# Mythos: Database Schema (DeepSpace collections)

Status: **Proposed.** This is the canonical schema document; ARCHITECTURE.md summarizes it.

## 0. How "the database" works on DeepSpace

There is no SQL database to provision and no migrations folder. Each collection is a typed SQLite table inside the app's `RecordRoom` Durable Object (`app:${APP_ID}`). It is declared in TypeScript under `src/schemas/` and baked in at deploy time. Clients read and write over a WebSocket. The DO checks each collection's `permissions` **before** it persists a write or broadcasts a row.

**This replaces Supabase Row Level Security.** The table below maps each RLS concept to its DeepSpace equivalent. See ADR-011.

| RLS concept | DeepSpace equivalent |
|---|---|
| `USING (...)` read policy | `permissions[role].read` (`'team'`, `'collaborator'`, `'own'`, …) evaluated in the DO |
| `WITH CHECK` write policy | `permissions[role].update/create/delete`, plus `writableFields`, `userBound`, `immutable`, and `uniqueOn` |
| `auth.uid()` | The verified JWT subject. The DO stamps `createdBy`, and `userBound` columns get the verified id |
| Membership join tables | The `team_members` collection plus `teamField` |
| `SECURITY DEFINER` functions | Server actions (`/api/actions/:name`), which run as the app with a verified `ctx.userId` |
| Foreign keys | `{ kind: 'reference' }` interpretation (advisory). Integrity is enforced in server actions |
| Migrations | Schema changes ship on deploy. The automatic migration handles added columns. Breaking changes are documented in ARCHITECTURAL_DECISIONS.md |

Every record has the envelope `{ recordId, data, createdBy, createdAt, updatedAt }`. Fields live under `data`.

## 1. Entity relationship overview

```
users (scaffold) 1───* team_members *───1 universes
                                           │1
            ┌──────────────┬───────────────┼──────────────────┐
            *              *               *                  *
       categories      articles ──*── article_links ──*──  (articles)
       (parentId→self)    │1  │*
                          *   └── categoryId → categories
                 article_references

usage (per user/day/kind; admin + actions only)
ai-chats / ai-messages (drop-in, owner-only)
```

- Every universe-owned row carries `universeId`, which the DO uses as `teamField`.
- `team_members.teamId` = `universes.recordId`.

## 2. Permission building blocks

| Mechanism | Used for |
|---|---|
| `teamField` + `team_members` | **Read isolation.** Only active members of the universe receive its rows |
| `collaboratorsField: 'editorIds'` + `update: 'collaborator'` | **Editor vs. viewer.** Only the owner and editors can update fields or type in the Yjs body |
| `ownerField: 'ownerId'` (universe owner) | The owner always passes `'collaborator'` |
| `create: false` for `member` | Rows are created only by server actions that check the universe role (`create` is boolean-only and cannot check the team) |
| `writableFields` | Clients cannot touch `universeId`, `editorIds`, `ownerId` or other system fields |
| `uniqueOn` | Uniqueness of slugs, memberships, links and usage counters, enforced in the DO |

`'*'` (anonymous) and `viewer` (the app-level role) get **no access** to any Mythos collection.

## 3. Collections

Notation: `T` = `storage: 'text'`, `N` = `storage: 'number'`. "Req" = `required`, "Imm" = `immutable`.

### 3.1 `users` (scaffold)

Keep `BASE_USERS_SCHEMA` / `USERS_COLUMNS` unchanged, with `member: { read: 'own' }`. Collaborators' names come from `useUsers()`, which returns the public projection: id, name, imageUrl, role, lastSeenAt.

### 3.2 `universes`

| Column | Type | Flags | Notes |
|---|---|---|---|
| `name` | T plain | Req | 1–120 chars (Zod) |
| `slug` | T plain | Req | URL-friendly; uniqueness is not required (routes use the id) |
| `tagline` | T plain | | ≤ 200 |
| `description` | T plain | | ≤ 5,000 |
| `artStyle` | T plain | | ≤ 300; image prompt suffix |
| `coverImageKey` | T plain | | R2 key |
| `ownerId` | T plain | Imm | Creator |
| `editorIds` | T json | | Server-maintained: owner + editors |

- `teamField: '_rowId'` (the universe's own id is its team id; the official taskspace pattern).
- `collaboratorsField: 'editorIds'`, `ownerField: 'ownerId'`.

```ts
permissions: {
  member: { read: 'team', create: false, update: 'collaborator', delete: false,
            writableFields: ['name','tagline','description','artStyle','coverImageKey'] },
  admin:  { read: true, create: true, update: true, delete: true },
}
```

Editors may edit universe settings under this rule. To make settings owner-only, set `update: false` and route edits through `updateUniverse`. **Recommended:** owner-only via the action, which matches PRODUCT_SPEC F5.

### 3.3 `team_members` (name required by the SDK)

| Column | Type | Flags | Notes |
|---|---|---|---|
| `teamId` | T plain | Req, Imm | = universeId |
| `userId` | T plain | Req, Imm | Member's user id |
| `role` | T select `owner,editor,viewer` | Req | |
| `status` | T select `active,removed` | Req | The DO counts `active` (or null) as a member |
| `invitedBy` | T plain | Imm | Audit |

- `teamField: 'teamId'`, `uniqueOn: ['teamId','userId']`.

```ts
permissions: {
  member: { read: 'team', create: false, update: false, delete: false },
  admin:  { read: true, create: true, update: true, delete: true },
}
```

Removal **deletes** the row (rather than setting `removed`). Re-inviting then works within `uniqueOn`. `status` stays for future "invited" support.

### 3.4 `categories`

| Column | Type | Flags | Notes |
|---|---|---|---|
| `universeId` | T reference→universes | Req, Imm | teamField |
| `name` | T plain | Req | 1–80 |
| `parentId` | T reference→categories | | null = top level. MVP allows depth ≤ 2 |
| `sortOrder` | N plain | | |

- `teamField: 'universeId'`, `uniqueOn: ['universeId','parentId','name']`.
- `member: { read: 'team', create: false, update: false, delete: false }`. All writes go through actions, which keeps categories out of the `editorIds` fan-out.

### 3.5 `articles`

| Column | Type | Flags | Notes |
|---|---|---|---|
| `universeId` | T reference→universes | Req, Imm | teamField |
| `title` | T plain | Req | 1–200 |
| `slug` | T plain | Req | Derived from the title; unique per universe |
| `type` | T select `character,location,faction,event,species,item,lore,culture,other` | Req | |
| `summary` | T plain | | ≤ 1,000; used by search and AI context |
| `body` | (Yjs field) | | Not a column. `useYjsField('articles', id, 'body')` persists it in the RecordRoom |
| `infobox` | T json | | `Array<{ key: string; value: string }>`, ≤ 30 entries; suggested keys per type |
| `categoryId` | T reference→categories | | Nullable |
| `tags` | T json | | `string[]`, ≤ 20, each ≤ 40, lowercased |
| `status` | T select `draft,published` | Req, default `draft` | Within-universe label in MVP |
| `coverImageKey` | T plain | | |
| `editorIds` | T json | | Server-maintained |
| `ownerId` | T plain | Imm | = universe owner |
| `authorId` | T plain | Imm | The editor who created it (display) |

- `teamField: 'universeId'`, `collaboratorsField: 'editorIds'`, `ownerField: 'ownerId'`, `uniqueOn: ['universeId','slug']`.

```ts
permissions: {
  member: { read: 'team', create: false, update: 'collaborator', delete: false,
            writableFields: ['title','summary','type','infobox','categoryId','tags','status','coverImageKey'] },
  admin:  { read: true, create: true, update: true, delete: true },
}
```

- `slug` is set only by actions (`createArticle`, `renameArticle`) so uniqueness errors surface cleanly.
- `categoryId` written directly by a client is validated lazily: the UI only offers same-universe categories. A forged foreign id only harms the forger's view, because categories from other universes are unreadable and are shown as "Uncategorized". **[Option]** Move it to an action for strictness.

### 3.6 `article_links`

| Column | Type | Flags | Notes |
|---|---|---|---|
| `universeId` | T reference→universes | Req, Imm | |
| `fromArticleId` | T reference→articles | Req, Imm | |
| `toArticleId` | T reference→articles | Req, Imm | ≠ from |
| `type` | T select (see below) | Req | |
| `note` | T plain | | ≤ 500 |

- `teamField: 'universeId'`, `uniqueOn: ['fromArticleId','toArticleId','type']`.
- `member: { read: 'team', create: false, update: false, delete: false }`. `createLink`, `updateLinkNote` and `deleteLink` are actions.

Relationship types and inverse labels (the inverse is computed in the UI from one stored row):

| type | label (from → to) | inverse label (to ← from) |
|---|---|---|
| `related_to` | related to | related to |
| `ally_of` | ally of | ally of |
| `enemy_of` | enemy of | enemy of |
| `parent_of` | parent of | child of |
| `sibling_of` | sibling of | sibling of |
| `spouse_of` | spouse of | spouse of |
| `member_of` | member of | has member |
| `leads` | leads | led by |
| `located_in` | located in | contains |
| `part_of` | part of | includes |
| `born_in` | born in | birthplace of |
| `created` | created | created by |
| `owns` | owns | owned by |
| `participated_in` | participated in | participant |
| `instance_of` | is a (e.g. character → species) | example |
| `preceded` | preceded | followed |

### 3.7 `article_references`

| Column | Type | Flags | Notes |
|---|---|---|---|
| `universeId` | T | Req, Imm | |
| `articleId` | T reference→articles | Req, Imm | |
| `source` | T select `wikipedia,web,manual` | Req | |
| `title` | T plain | Req | ≤ 300 |
| `url` | T url | Req | `https:` only (Zod) |
| `excerpt` | T plain | | ≤ 2,000; shown as a quotation with attribution |

- `teamField: 'universeId'`, `uniqueOn: ['articleId','url']`.
- `member: { read: 'team', create: false, update: false, delete: false }` (actions).

### 3.8 `usage` (spend caps)

| Column | Type | Flags |
|---|---|---|
| `userId` | T | Req, Imm |
| `day` | T (YYYY-MM-DD, UTC) | Req, Imm |
| `kind` | T select `ai_text,ai_chat,image,research` | Req, Imm |
| `count` | N | Req |

- `uniqueOn: ['userId','day','kind']`.
- `member: { read: false, create: false, update: false, delete: false }`, `admin: { read: true, … }`. Written only by actions.

### 3.9 `ai-chats`, `ai-messages`

These are the drop-in `AI_CHATS_SCHEMA` / `AI_MESSAGES_SCHEMA`, unchanged: owner-only reads, `create: false`. The universe context for a chat is passed per request (see ARCHITECTURE.md §6).

## 4. Integrity rules enforced in server actions (Zod + lookups)

1. Every `universeId` in params must match a universe where the caller has an `active` membership with the required role.
2. Every referenced id (article, category, link target) must belong to **the same** universe.
3. A category `parentId` must be a top-level category (depth ≤ 2). A category cannot be its own parent.
4. Slugs are generated server-side. Collisions get a `-2`, `-3`, … suffix.
5. **Deletes cascade inside actions.** `tools.deleteWhere` is bounded at 500 rows per call, so the action loops until fewer than the limit are deleted.
   - Delete article → its links (both directions) and its references.
   - Delete category → set `categoryId` to null on its articles, and move child categories to the top level.
   - Delete universe → links, references, articles, categories, memberships, then the universe.
6. `editorIds` fan-out runs on role changes. The actions that add or remove editors update the universe and all its articles.

## 5. Indexing and query patterns

The DO filters in SQLite. Typical client queries:
- `useQuery('articles', { where: { universeId } })`: the whole universe index, live. This is fine up to about 1k articles; paginate later.
- `useQuery('article_links', { where: { fromArticleId } })` and `{ where: { toArticleId } }`: outgoing links and backlinks.
- `useQuery('team_members', { where: { teamId } })` and `{ where: { userId: me } }` for "my universes".

## 6. Schema change policy

- Additive changes (new optional columns) are safe on deploy.
- Renames and removals, or tightening a `select` or `required`, are breaking. Record them as an ADR, include a data backfill action, and verify in the release ledger (`deepspace releases`).
- `lintSchema()` must return `[]` for every schema. This is enforced by a Vitest test.

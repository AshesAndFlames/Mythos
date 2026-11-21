# Mythos: Database Schema (DeepSpace collections)

Status: **Implemented** (2026-11-20) in `src/schemas/mythos-schemas.ts`; types in `src/domain/records.ts`. This is the canonical schema document; ARCHITECTURE.md summarizes it. §7 maps the original Supabase-style brief onto it.

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
| `CHECK` constraints | `required`, `select` options, and `maxLength` on plain-text columns, all enforced by the DO before persisting |
| Indexes | One unique index per `uniqueOn`. The SDK has no other index configuration (ADR-017) |
| Seed data | The `seedExampleUniverse` action, refused outside local dev (§8) |

Every record has the envelope `{ recordId, data, createdBy, createdAt, updatedAt }`. Fields live under `data`.

## 1. Entity relationship overview

```
users (scaffold) 1───* team_members *───1 universes
                                           │1
            ┌──────────────┬───────────────┼──────────────────┐
            *              *               *                  *
       categories      articles ──*── article_links ──*──  (articles)
       (parentId→self)    │1  │*
                          │   └── categoryId → categories
            ┌─────────────┼──────────────┐
            *             *              *
  article_references  article_revisions  article_tags *───1 tags

usage (per user/day/kind; admin + actions only)
ai-chats / ai-messages (drop-in, owner-only)
```

- Every universe-owned row carries `universeId`, which the DO uses as `teamField`.
- `team_members.TeamId` = `universes.teamId` = `universes.recordId` (ADR-016).

## 2. Permission building blocks

| Mechanism | Used for |
|---|---|
| `teamField` + `team_members` | **Read isolation.** Only active members of the universe receive its rows |
| `collaboratorsField: 'editorIds'` + `update: 'collaborator'` | **Editor vs. viewer.** Only the owner and editors can update fields or type in the Yjs body |
| `ownerField: 'ownerId'` (universe owner) | The owner always passes `'collaborator'` |
| `create: false` for `member` | Rows are created only by server actions that check the universe role (`create` is boolean-only and cannot check the team) |
| `writableFields` | Articles: clients may change only `summary` and `type` (`status` moved to `saveArticle` in ADR-021). Everything that references another record, must stay unique, is JSON, or must match a pattern (`coverImageKey`) goes through an action (`saveArticle` covers them all) |
| `maxLength` | Every plain-text column. JSON columns cannot take it (the DO rejects non-strings), so they are action-only and Zod-bounded |
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
| `slug` | T plain | | Server-generated from the name; `uniqueOn: ['ownerId','slug']` (per owner, so it never reveals other users' universes) |
| `tagline` | T plain | | ≤ 200 |
| `description` | T plain | | ≤ 5,000 |
| `artStyle` | T plain | | ≤ 300; image prompt suffix |
| `coverImageKey` | T plain | | `''` or `covers/<universeId>/<uuid>.<ext>` in the app file store; keys saved before ADR-022 are `covers/<uuid>.<ext>` and stay valid (ADR-019, ADR-022) |
| `visibility` | T select `private` | default `private` | Only `private` today (ADR-017) |
| `ownerId` | T plain | Imm | Creator |
| `editorIds` | T json | | Server-maintained: owner + editors |

- `teamId` column (T plain, Req, Imm) holds the universe's own recordId, and is the `teamField`. `_rowId` is not used: per-record checks (broadcasts, Yjs) read `record.data[teamField]`, which is undefined for `_rowId` (ADR-016).
- `collaboratorsField: 'editorIds'`, `ownerField: 'ownerId'`.

```ts
permissions: {
  member: { read: 'team', create: false, update: false, delete: false },
  admin:  { read: true, create: true, update: true, delete: true },
}
```

Universe settings are owner-only and go through the `updateUniverse` action (PRODUCT_SPEC F5). `deleteUniverse` (owner, with the name typed as confirmation) cascades. An owner may own at most 25 universes.

### 3.3 `team_members` (name required by the SDK)

| Column | Type | Flags | Notes |
|---|---|---|---|
| `TeamId` | T plain | Req, Imm | = universeId |
| `UserId` | T plain | Req, Imm | Member's user id |
| `Status` | T select `active,removed` | Req | The DO counts `active` (or null) as a member |
| `role` | T select `owner,editor,viewer` | Req | |
| `invitedBy` | T plain | Imm | Audit |

- `teamField: 'TeamId'`, `uniqueOn: ['TeamId','UserId']`.
- The capitalised names are required: the DO's membership resubscribe reads `record.data.UserId` / `TeamId` / `Status` literally (ADR-016).

```ts
permissions: {
  member: { read: 'team', create: false, update: false, delete: false },
  admin:  { read: true, create: true, update: true, delete: true },
}
```

Removal **deletes** the row (rather than setting `removed`). Re-inviting then works within `uniqueOn`. A membership is created only when an invitee accepts an invitation (`invitations`, §3.10); `invitedBy` records who invited them.

### 3.4 `categories`

| Column | Type | Flags | Notes |
|---|---|---|---|
| `universeId` | T reference→universes | Req, Imm | teamField |
| `name` | T plain | Req | 1–80 |
| `parentId` | T plain | | '' = top level. Same universe, no cycles, at most 5 levels (`checkParent`) |
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
| `body` | (Yjs field) | | Not a column. `useYjsField('articles', id, 'body')` persists it in the RecordRoom; Tiptap binds the `Y.XmlFragment` named `body` (ADR-019) |
| `infobox` | T json | | `Array<{ key: string; value: string }>`, ≤ 30 entries. Written only by `setArticleInfobox` |
| `categoryId` | T plain | | '' or a category in the same universe. Written only by `setArticleCategory` / `saveArticle` |
| `status` | T select `draft,published` | Req, default `draft` | Within-universe label. Written only by actions (`saveArticle`), so publishing is always recorded (ADR-021) |
| `coverImageKey` | T plain | | `''` or `covers/<universeId>/<uuid>.<ext>` (older keys `covers/<uuid>.<ext>` stay valid). Written only by `saveArticle`, which refuses a key uploaded for another universe (ADR-019, ADR-022) |
| `editorIds` | T json | | Server-maintained |
| `ownerId` | T plain | Imm | = universe owner |
| `authorId` | T plain | Imm | The editor who created it (display) |

- `teamField: 'universeId'`, `collaboratorsField: 'editorIds'`, `ownerField: 'ownerId'`, `uniqueOn: ['universeId','slug']`.

```ts
permissions: {
  member: { read: 'team', create: false, update: 'collaborator', delete: false,
            writableFields: ['summary','type'] },
  admin:  { read: true, create: true, update: true, delete: true },
}
```

- `title` and `slug` are set only by actions (`createArticle`, `renameArticle`, `restoreRevision`) so uniqueness errors surface cleanly.
- `categoryId` is set only by `setArticleCategory`, which checks the category is in the same universe (ADR-017).
- Tags moved to the `tags` / `article_tags` collections (ADR-017).
- Rich-text content: the live body is the Yjs field; saved versions are rich-text JSON in `article_revisions`.

### 3.6 `article_links`

| Column | Type | Flags | Notes |
|---|---|---|---|
| `universeId` | T reference→universes | Req, Imm | |
| `fromArticleId` | T reference→articles | Req, Imm | |
| `toArticleId` | T reference→articles | Req, Imm | ≠ from |
| `type` | T select (see below) | Req | |
| `note` | T plain | | ≤ 500 |

- `teamField: 'universeId'`, `uniqueOn: ['fromArticleId','toArticleId','type']`.
- Symmetric types (`related_to`, `ally_of`, `enemy_of`, `sibling_of`, `spouse_of`) are stored with the smaller article id as `fromArticleId`, so `uniqueOn` also blocks reverse duplicates. Hierarchical types (`parent_of`, `located_in`, `part_of`, `instance_of`, `preceded`) may not form loops. Type metadata lives in `src/domain/relationships.ts` (ADR-020).
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
| `lives_in` | lives in | home of |
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

### 3.7a `article_revisions`

| Column | Type | Flags | Notes |
|---|---|---|---|
| `universeId` | T | Req, Imm | teamField |
| `articleId` | T | Req, Imm | |
| `number` | N | Req, Imm | 1, 2, 3, … per article |
| `title`, `summary` | T plain | Imm | Copied from the server's article row, not from the client |
| `content` | T json | Req, Imm | ProseMirror/Tiptap JSON from the editor, validated by `richTextDocSchema` (root `doc`, scalar attrs, safe link schemes, depth ≤ 40, ≤ 20,000 nodes, ≤ 200,000 chars) |
| `fingerprint` | T | Req, Imm | SHA-256 of canonical {title, summary, content}; identical saves are skipped |
| `authorId` | T | Req, Imm | The editor who saved it |
| `note` | T plain | Imm | ≤ 200 |

- `uniqueOn: ['articleId','number']`: concurrent saves fail instead of duplicating a number.
- Read: team. No client writes. `saveRevision` and `restoreRevision` (editor). At most 50 per article; the oldest are pruned.

### 3.7b `tags` and `article_tags`

| `tags` column | Type | Flags | Notes |
|---|---|---|---|
| `universeId` | T | Req, Imm | teamField |
| `name` | T plain | Req | ≤ 40, first spelling wins |
| `slug` | T plain | Req | `uniqueOn: ['universeId','slug']` |

| `article_tags` column | Type | Flags | Notes |
|---|---|---|---|
| `universeId` | T | Req, Imm | teamField |
| `articleId` | T | Req, Imm | Same universe as the tag (checked in `setArticleTags`) |
| `tagId` | T | Req, Imm | `uniqueOn: ['articleId','tagId']` |

- Read: team. No client writes. `setArticleTags` (replace an article's tags, ≤ 20) and `deleteTag` (editor).

### 3.8 `usage` (spend caps)

| Column | Type | Flags |
|---|---|---|
| `userId` | T | Req, Imm |
| `day` | T (YYYY-MM-DD, UTC) | Req, Imm |
| `kind` | T select `ai_text,ai_chat,image,research,upload` | Req, Imm. `upload` (ADR-022) counts cover uploads against a per-user daily cap |
| `count` | N | Req |

- `uniqueOn: ['userId','day','kind']`.
- `member: { read: false, create: false, update: false, delete: false }`, `admin: { read: true, … }`. Written only by actions.

### 3.9 `ai-chats`, `ai-messages`

These are the drop-in `AI_CHATS_SCHEMA` / `AI_MESSAGES_SCHEMA`, unchanged: owner-only reads, `create: false`. The universe context for a chat is passed per request (see ARCHITECTURE.md §6).

### 3.10 `invitations` (ADR-021)

| Column | Type | Flags | Notes |
|---|---|---|---|
| `universeId` | T plain | Req, Imm | |
| `email` | T plain ≤320 | Req, Imm | Lower-cased. Matched against the invitee's account email, which the system assigns from the verified sign-in |
| `role` | T select `editor,viewer` | Req | Changed when the owner re-invites the same address |
| `invitedBy` | T plain | Req | Latest inviter |
| `status` | T select `pending,accepted,declined` | Req | |

- No `teamField`, `uniqueOn: ['universeId','email']`.
- Permissions: **no client role** may read or write (`'*'`, `viewer`, `member`: all false; `admin`: all). An invitee is not a member yet, and other members must not see invitees' emails. Read only through `listInvitations` (owner) and `myInvitations` (the invitee, matched by account email).
- At most `LIMITS.pendingInvitations` (50) pending per universe. Revoking deletes the row; answering sets `status`. Deleting the universe drains them.

### 3.11 `activity` (ADR-021)

| Column | Type | Flags | Notes |
|---|---|---|---|
| `universeId` | T plain | Req, Imm | |
| `kind` | T select `article_created,article_updated,article_published,member_invited,member_joined` | Req, Imm | |
| `actorId` | T plain | Req, Imm | Who did it |
| `subjectId` | T plain | Imm | Article id, or invitation id for `member_invited`; `''` when none |
| `subjectTitle` | T plain ≤200 | | Snapshot: article title, or a masked email (`f•••@example.com`) |
| `detail` | T plain ≤200 | | The role, for member entries |
| `at` | T datetime | Req | When it happened. Repeated updates by one actor to one article within 15 minutes move this forward instead of adding a row |

- `teamField: 'universeId'`, permissions `UNIVERSE_OWNED` (members read; no client writes). Rows are created by the system identity.
- Article entries survive article deletion (the title is a snapshot); deleting the universe drains them.

## 4. Integrity rules enforced in server actions (Zod + lookups)

1. Every `universeId` in params must match a universe where the caller has an `active` membership with the required role.
2. Every referenced id (article, category, link target) must belong to **the same** universe.
3. A category `parentId` must be in the same universe, must not create a cycle, and the tree stays within 5 levels.
4. Slugs are generated server-side. Collisions get a `-2`, `-3`, … suffix.
5. **Deletes cascade inside actions.** `tools.deleteWhere` is bounded at 500 rows per call, so the action loops until fewer than the limit are deleted.
   - Delete article → first erase its Yjs body and verify it is empty (ADR-018), then its links (both directions), references, tag joins and revisions.
   - Delete category → clear `categoryId` on its articles, and move child categories up to its parent (renaming on a name clash).
   - Delete tag → its joins.
   - Delete universe → erase every article body first (ADR-018), then tag joins, tags, revisions, links, references, articles, categories, the universe, then memberships.
   - Article ids are `crypto.randomUUID()` and are never reused.
7. A row addressed by id (category, tag, link, revision) is authorized against the universe **the row** belongs to, never a universe id from the params (`requireOwned`, `requireArticle`). Ids from another universe answer "not found", exactly like ids that do not exist.
6. `editorIds` fan-out runs on role changes. The actions that add or remove editors update the universe and all its articles.

## 5. Indexing and query patterns

The DO filters in SQLite. The SDK creates a unique index for each `uniqueOn` (slugs, memberships, links, tag joins, revision numbers) and offers no other index configuration. All of an app's records live in one DO, and the expected size (thousands of rows per universe) is well within a full scan. Revisit if a universe passes ~10k articles. Typical client queries:
- `useQuery('articles', { where: { universeId } })`: the whole universe index, live. This is fine up to about 1k articles; paginate later.
- `useQuery('article_links', { where: { fromArticleId } })` and `{ where: { toArticleId } }`: outgoing links and backlinks.
- `useQuery('team_members', { where: { TeamId } })` and `{ where: { UserId: me } }` for "my universes".

## 6. Schema change policy

- Additive changes (new optional columns) are safe on deploy.
- Renames and removals, or tightening a `select` or `required`, are breaking. Record them as an ADR, include a data backfill action, and verify in the release ledger (`deepspace releases`).
- `lintSchema()` must return `[]` for every schema. This is enforced by a Vitest test.

## 7. Mapping from the Supabase-style brief

| Brief | Mythos on DeepSpace |
|---|---|
| `profiles` tied to Supabase Auth | The scaffold's `users` collection, maintained by DeepSpace auth (id, name, imageUrl). Members see each other's public identity through the roster |
| `universes` | `universes` (id, name, slug, description, cover image, owner, visibility; `createdAt`/`updatedAt` come from the record envelope) |
| `universe_members` | `team_members` (`TeamId`, `UserId`, `Status`, `role`). The SDK requires this name and spelling (ADR-016) |
| `articles` | `articles`; rich-text body = Yjs field, rich-text JSON snapshots in `article_revisions` (ADR-017) |
| `categories` | `categories` |
| `tags`, `article_tags` | `tags`, `article_tags` |
| `article_links` | `article_links` with 17 typed relationships (lives in, member of, created/created by, located in, related to, participated in, …) |
| `article_revisions` | `article_revisions` |
| SQL migrations | `src/schemas/mythos-schemas.ts`, applied on deploy |
| Foreign keys | Checked in actions (same-universe rule, §4) |
| RLS policies | Collection permissions (§2) plus the role checks in actions |
| Typed interfaces | `src/domain/records.ts` |
| Server / client utilities | Server: `src/server/mythos/{action,store,membership}.ts`. Client: `src/lib/actions.ts` and `src/features/universes/hooks.ts` |

## 8. Seed data (local development)

`seedExampleUniverse` builds "The Shattered Realms" (4 categories, 5 articles, tags, 6 relationships, one revision per article) by calling the real actions as the caller, so seed rows pass the same validation and role checks as user input. It refuses to run when the worker has the production `PLATFORM_WORKER` binding. The backend test (`tests/mythos-backend.spec.ts`) uses it.

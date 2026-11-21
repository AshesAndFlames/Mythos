# Architectural Decision Records

Status key: **Proposed** (awaiting approval), **Accepted**, **Superseded**.

---

## ADR-001: Build on the official DeepSpace scaffold, not Next.js + Supabase
**Status:** **Accepted** (2026-11-20). Placeholders deleted. Scaffolded with the `copilot` template, SDK 0.44.2.

**Context:** The workspace holds empty Next.js App Router and Supabase placeholders, and guidelines that mention Supabase RLS. DeepSpace already provides auth, DB, real-time sync, RBAC, files, AI and deploy as one Worker.

**Decision:** Use `npm create deepspace@latest` (SDK 0.44.2): Vite + React, generouted, Hono worker, DO collections. Remove the placeholders. Rewrite the Supabase-specific guidelines into DeepSpace equivalents.

**Consequences:**
- There is one runtime and one deploy command.
- No secrets are needed for core features.
- The project is tied to Cloudflare Workers and DeepSpace, which is the point of the submission.
- The SQL/RLS skill set does not transfer; it is replaced by schema RBAC.

## ADR-002: Universe = team; per-universe roles in `team_members`
**Status:** Proposed

**Context:** Built-in roles (`viewer/member/admin`) are app-wide, but Mythos needs roles per universe.

**Decision:**
- Store per-universe membership in the SDK-recognized `team_members` collection, with `teamId = universeId` and an extra `role` column.
- Content collections use `teamField: 'universeId'` with `read: 'team'`.
- `universes` uses `teamField: '_rowId'`, as in the official taskspace example.
- All membership writes go through server actions. `create: false` for clients, unlike taskspace, which lets any member create membership rows.

**Consequences:** cross-universe read isolation is enforced in the DO. The membership UI depends on actions.

## ADR-003: One app RecordRoom, not a room per universe
**Status:** Proposed

**Context:** Rooms can be app-defined (`universe:<id>`), and taskspace uses per-team rooms. But that needs custom room authorization, membership mirrors in each room, and a non-SDK `tools.forRoom` escape hatch. A "my universes" list would also span rooms. The docs say user-scoped data should live in app DOs with RBAC filtering.

**Decision:** Everything lives in `app:${APP_ID}`, isolated by RBAC.

**Consequences:**
- The design is simpler and matches the documented pattern.
- One DO holds all universes, which is fine for "hundreds to tens of thousands of rows".
- If a single deployment ever outgrows that, sharding to per-universe rooms is a migration (noted, not planned).

## ADR-004: Editor vs. viewer through a server-maintained `editorIds` (`'collaborator'` level)
**Status:** **Accepted** (2026-11-20), validated by the Phase-1 spike (`tests/mythos-roles.spec.ts`).

**Spike result:** against the real worker and RecordRoom, with four accounts (owner, editor, viewer, outsider):
- The editor co-edits the record-bound Yjs body live, and the owner sees the change.
- The viewer reads the body, but the DO reports `canWrite: false`, so the editor is read-only.
- The outsider's universe list does not show the universe, and the article URL renders "not found".
- Server actions refuse: viewer create (editor access needed), outsider create ("Universe not found"), editor and outsider invites, anonymous calls (401), and invalid input.
- Demoting the editor to viewer removes write access (in actions and in Yjs) after the `editorIds` fan-out.
- Removing the viewer revokes read access immediately.

The fallback is not needed.

**Context:** `'team'` cannot tell roles within a team apart. Each schema has one `teamField` and one `collaboratorsField`.

**Decision:**
- Articles (and universes) carry `editorIds` (json), listing the universe owner and editors, and use `update: 'collaborator'`.
- `ownerField: 'ownerId'` = universe owner.
- Server actions keep `editorIds` in sync and fan out on role changes.
- `writableFields` stop clients from editing `editorIds`, `ownerId`, and `universeId`.
- Record-bound Yjs inherits `canWrite` from the update RBAC.

**Fallback (if the spike fails):** two universe roles (owner, editor), with `update: 'team'`. "Viewer" is dropped from MVP and documented as a limitation.

**Consequences:** role changes cost O(articles) writes. Above ~1–2k articles per universe, move the fan-out into a `JobRoom` job.

## ADR-005: Article body is a record-bound Yjs field edited with Tiptap
**Status:** Proposed

**Context:** Articles need live co-editing. The `documents` feature has a polished Tiptap+Yjs editor, but its access model is per-document invites in a `documents` collection, which `/ws/yjs/:docId` reads.

**Decision:** Use `useYjsField('articles', articleId, 'body')` (syncs over RecordRoom, `canWrite` follows article RBAC). Reuse the documents feature's editor and toolbar components. Do **not** register the `documents` collection.

**Consequences:**
- A single access model (universe roles).
- The body is not a queryable column. Search and AI context use `summary` and title. A plain-text excerpt can be written on blur if needed.

## ADR-006: Cover images use R2 `'app'` scope with random keys
**Status:** **Accepted** (2026-11-20). Public-by-link images are OK for MVP.

**Context:** R2 has only `'self'` (uploader-only) and `'app'` (public) scopes. Nothing is per-team.

**Decision (MVP):**
- Store under `'app'` with unguessable keys (`universes/<id>/<uuid>.<ext>`).
- Only members ever receive the key, through the `team`-gated article row.
- Images are "unlisted public": anyone who has the URL can view them.

**Alternative (stretch, about half a day):** a gated worker route `GET /api/universe-image/:articleId` that verifies the JWT and membership, then streams the file from storage the app controls.

**Consequences:** acceptable for creative works in a demo. Not acceptable for confidential IP without the stretch.

## ADR-007: Integrations run only from server actions, with per-user daily caps
**Status:** Proposed

**Context:** Developer-billed endpoints accept any caller. The platform rate-limits only `google/*`.

**Decision:**
- No `integration.post` from the browser.
- Actions check membership and role, validate input, and increment a `usage` counter (`uniqueOn userId+day+kind`) before calling `tools.integration`.

**Consequences:** bounded spend and auditable usage. Each call adds a little latency.

## ADR-008: Three integrations are Claude (text), Gemini (images), Wikipedia (research)
**Status:** Proposed

**Rationale:** they cover the three requested categories, all exist in the live catalog with published schemas (see INTEGRATION_STRATEGY.md), none needs OAuth, and costs are predictable. Wikipedia is the cheapest (US$0.0013 per request).

**Alternatives:** `exa/answer` for research, `openai/generate-image` for images.

## ADR-009: Who pays for AI
**Status:** **Accepted** (2026-11-20): option (a), owner-billed with per-user caps.

**Options:**
- **(a) Owner-billed** (`'developer'`, chat summarizer and chat route without `authToken`), with caps. Best for judging and demo.
- **(b) User-billed** (scaffold default for chat). Users need their own DeepSpace credits; test accounts have none.

**Recommendation:** (a) for the submission window.

## ADR-010: Server-side lockdown of anonymous sockets
**Status:** Proposed

**Decision:** Mythos MVP has no anonymous data surface. Change the scaffold `wsRoute` so it requires a verified token, as the docs prescribe for fully private apps. The landing page stays static.

**Consequences:** a future public "published universe" view must reopen this deliberately.

## ADR-011: DeepSpace RBAC replaces Supabase Row Level Security
**Status:** **Accepted** (2026-11-20).

**Context:** RLS's purpose is row-level authorization enforced by the data layer, so that a client cannot bypass it. DeepSpace gives the same guarantee: collection permissions are evaluated inside the Durable Object before any write persists and before any row is broadcast. Server actions play the role of `SECURITY DEFINER` functions. The mapping is in DATABASE_SCHEMA.md §0.

**Decision:** Do not add Supabase. Meet the RLS requirement with DO-enforced RBAC (`team`, `collaborator`, `writableFields`, `immutable`, `uniqueOn`) plus Zod-validated server actions. Prove it with forged-write tests.

**Consequences:**
- There is one data store and one authorization model.
- The "RLS" wording in the guidelines is rewritten as "DeepSpace RBAC" in `CLAUDE.md`.

## ADR-012: Zod for input validation
**Status:** **Accepted** (2026-11-20). `zod ^4.5.4` ships with the scaffold, so no new dependency is needed.

**Decision:** Every server action and AI tool parses its params with Zod (schemas in `src/server/mythos/validation.ts`). Client forms reuse the same schemas for inline errors. Integration responses that drive writes (AI link suggestions, image payloads) are also parsed.

**Dependency:** the scaffold's AI tools already use Zod **[verify after scaffolding]**. Otherwise add `zod` as the one explicit dependency.

## ADR-013: Categories are a separate collection; tags are a JSON column
**Status:** **Superseded in part** by ADR-017 (tags are now collections; categories allow 5 levels). The category design is accepted.

**Context:** The product needs both a navigable hierarchy and free-form labels.

**Decision:**
- `categories` (universe-scoped, `parentId`, depth ≤ 2, action-only writes, which keeps them out of the `editorIds` fan-out).
- `articles.tags` (normalized `string[]`); the tag list is derived client-side.
- Article **type** (character, species, …) stays a fixed enum, because it drives infobox templates and AI and image prompts.

**Consequences:** renaming a tag across a universe is a bulk action (stretch). Category deletes un-categorize articles; they never delete them.

## ADR-014: GitHub is the source authority
**Status:** **Accepted** (2026-11-20)

**Decision:** The code lives in GitHub.

**Consequences:**
- The first `npx deepspace deploy` must run from a checkout whose selected remote is the GitHub repository. That deploy permanently claims GitHub as the source.
- `npx deepspace push` must never be run.
- Deploys ship the local working tree (including uncommitted changes), so commit and push to GitHub before each deploy.
- Rollback uses the deployment bundles kept in the release ledger.

## ADR-015: Copilot template
**Status:** **Accepted** (2026-11-20)

**Decision:** Scaffold with `--template copilot`. Its three-panel shell (sidebar, main panel, AI chat dock) maps directly onto Mythos: universe and category navigation, the article view, and the Lore Assistant.

**Consequences:**
- The template already ships the chat surface (`src/components/chat/ChatPanel.tsx`).
- Do **not** run `npx deepspace add ai-chat`, which would install a second, divergent panel.

## ADR-016: SDK conventions found in the RecordRoom source
**Status:** **Accepted** (2026-11-20)

**Context:** Reading `deepspace/dist/worker.js` (SDK 0.44.2) showed four behaviours the original schema design got wrong.

**Decisions:**
1. **`team_members` columns are `TeamId`, `UserId`, `Status`.** The DO's membership resubscribe reads those exact keys, so camelCase names silently break live membership updates.
2. **Universes carry an explicit `teamId` column** (= their own recordId) as `teamField`. `teamField: '_rowId'` works for queries but fails per-record checks (broadcasts and Yjs), because `record.data._rowId` is undefined.
3. **Universe-owned rows are created by the system identity** (`env.OWNER_USER_ID`, via `mythosAction`'s `system` tools), never as the caller. A `'team'` read also admits `_created_by = userId`, so a removed member would otherwise keep reading the rows they created.
4. **Queries that may exceed one page follow `nextOffset`** (`queryAll` in `src/server/mythos/store.ts`). The tools API accepts `offset` even though the `ActionTools` type does not declare it.

**Consequences:**
- The schema names differ from the rest of the camelCase model. This is deliberate and commented in `mythos-schemas.ts`.
- `createActionTools` lives in `src/server/action-tools.ts`, so actions can build system tools.
- Recheck these four points on every SDK upgrade (`deepspace app update`).

## ADR-017: Backend foundation (tags, revisions, visibility, reference fields)
**Status:** **Accepted** (2026-11-20)

**Context:** The backend brief asked for profiles, universes with visibility, tags and article_tags, typed relationships, and article revisions, all with RLS-equivalent security.

**Decisions:**
1. **Visibility is `private` only.** `universes.visibility` exists, but its `select` allows only `private`. The permission system cannot express "members OR public" on one collection, so public universes need their own read path and design. Chosen by the user.
2. **Revisions are editor snapshots.** The live body stays a collaborative Yjs document. `saveRevision` receives the editor's rich-text JSON, validates it (`richTextDocSchema`), copies title and summary from the server's row, skips identical saves by fingerprint, and keeps 50 per article. `restoreRevision` restores title and summary and returns the body, which the editor applies and saves as a new version. The server cannot render the Yjs document as rich text, so a snapshot can only be as true as the editor that sends it. Only editors can send one, and they can edit the article anyway. Chosen by the user.
3. **Tags are collections** (`tags` and `article_tags`), not a JSON column. **Breaking change:** `articles.tags` was removed. *Backfill:* none needed. No action or UI ever wrote a non-empty `tags` value (createArticle wrote `[]`, and no client control existed). Had there been data, a one-off action would have read each article's `tags` and called `setArticleTags`.
4. **Reference, unique and JSON fields are action-only.** `categoryId`, `title`, and `infobox` left `writableFields`. Before this, an editor could set `categoryId` to a category in another universe. Now `setArticleCategory` checks the universe, and `setArticleInfobox` bounds the JSON with Zod.
5. **The DO is the second line of defence.** `maxLength` sits on every plain-text column. It cannot be put on JSON columns, because the DO rejects non-string values under `maxLength`; this was found when the first runtime test failed.
6. **No custom indexes.** The SDK creates unique indexes from `uniqueOn` and has no other index configuration.
7. **Seed data is an action**, refused when the production platform binding is present.

**Consequences:**
- The client UI must switch title edits to `renameArticle` (done) and future category, tag and infobox controls to their actions.
- Deleted articles' Yjs bodies are erased before deletion (ADR-018).

## ADR-018: Erase article bodies on delete; never reuse article ids
**Status:** **Accepted** (2026-11-20)

**Context:** The SDK stores record-bound Yjs documents in the RecordRoom's `yjs_docs` table, keyed `articles:<id>:<field>`, and never deletes them. After an article row is deleted, new joins are refused (the join looks up the row). But two paths still reach the stored body:
- A browser that joined **before** the deletion keeps its subscription, and the room answers its sync requests (`MSG_SYNC_STEP1`) without rechecking the row.
- Any new article that reused the id would serve the old body to its own readers, possibly in another universe.

The user proposed recycling deleted articles' ids for new articles. That would have opened the second path, so it was declined in favour of this design.

**Decision:**
1. `deleteArticle` and `deleteUniverse` erase each article's Yjs fields (`ARTICLE_YJS_FIELDS`, today `body`) **before** deleting any row (`src/server/mythos/scrub.ts`):
   - Empty the article's `editorIds`, so editors' live updates are refused during the erase.
   - Use `yjs.setText(..., '')` as the system identity.
   - Read the text back and require `''`.
   - If anything fails, restore the editor list and refuse the deletion, so an article is never deleted with its body intact.
2. Yjs encodes stored state with garbage collection on (the room's default `new Y.Doc()`), and the room re-saves the full state on every update. Erased text is therefore gone from the stored bytes, not merely hidden. Pinned by `scrub.test.ts`.
3. `createArticle` assigns `crypto.randomUUID()` explicitly. The SDK's default id is a timestamp plus 6 random characters; a UUID makes an id coming back a non-event.

**Verification:** `tests/mythos-backend.spec.ts` types a secret into real article bodies through the UI and confirms it is in the stored bytes. It then deletes an article (while another member has it open) and the whole universe, and confirms the bytes no longer contain the secret. It reads `yjs_docs` through wrangler's local explorer API.

**Consequences and limits:**
- The universe **owner** still passes the `'collaborator'` check (`ownerField`) during the erase. An owner keystroke in the same instant could land after the erase and before the row is removed. Updates after the row is gone are dropped by the room.
- ~~`yjs.setText` only handles `Y.Text` fields; a Tiptap body would fail closed.~~ **Superseded by ADR-019:** the Tiptap body is a `Y.XmlFragment` named `body`, and the server's `getText('body').delete(...)` erases its nested content too. That is pinned by `scrub.test.ts` and by stored-byte checks in `mythos-backend.spec.ts` and `mythos-journey.spec.ts`. The read-back check in `eraseArticleBody` is weak for fragments (`getText` reads `''` even before the erase), so the e2e byte checks are the real guarantee.
- The empty `yjs_docs` row itself stays, holding only an empty document's metadata.
- Bodies of articles deleted **before** this change keep their content in local development data. Production had no articles.

## ADR-019: Frontend architecture (Task 3)
**Status:** **Accepted** (2026-11-20)

**Context:** Task 3 asked for the full frontend (auth screens, dashboards, library, article view and editor) in a dark editorial style, with every control connected to the backend.

**Decision:**
1. **Rich text is Tiptap on the article's record-bound Yjs field.** `useYjsField('articles', id, 'body')` provides the document; Tiptap's Collaboration extension binds to `doc.getXmlFragment('body')`. The fragment **must** be named `body` (the field name): that is what the server-side erase reaches (ADR-018). Editing is enabled only when the room reports `canWrite`, so read-only is the server's decision. ProseMirror's own history is off (Yjs keeps undo); collaborators' carets come from the room's awareness.
2. **One save action for the editor.** `saveArticle` (Zod-validated) writes title (with slug), type, summary, status, category, cover and tags, and records a version of the body (`recordRevision`, deduplicated by fingerprint). "Save draft" and "Publish" are this action with different `status`. `coverImageKey` left `writableFields` so it is only ever set through validation.
3. **Cover images** go to the app-scope file store under keys Mythos chooses, `covers/<uuid>.<ext>`, validated by `COVER_KEY_PATTERN` on the server and again before rendering. The store serves app-scope files only by their full key (`apps/<appId>/covers/...`), so `coverUrl(key, appId)` builds the URL. Images are public to anyone with the link (approved earlier).
4. **Routes:** `/universes` (dashboard), `/u/:id` (overview), `/u/:id/articles` (library), `/u/:id/a/:articleId` (read), `/u/:id/a/:articleId/edit` (editor), `/u/:id/settings`. A universe `_layout` resolves the universe and role once and passes them to pages through the outlet context.
5. **Layouts use container queries**, not viewport breakpoints, because the assistant dock changes the panel's width independently of the window.
6. **Library filters live in component state** and are mirrored to the URL (`useLibraryFilters`). Binding inputs directly to the URL dropped quick consecutive changes, because router updates land asynchronously.
7. **Themes:** `archive` (dark, default) and `vellum` (light) replace the scaffold's `slate`/`paper`. Fonts are Cormorant Garamond (display), Spectral (prose) and Inter (UI).

**Consequences and limits:**
- Article metadata in the editor is a form saved as a whole. Two editors changing the same metadata field at once: the last save wins. The body is live and merges.
- Revision history is stored but has no browsing or restore UI yet.
- Seeded example articles have no live body (the seed only records a version).


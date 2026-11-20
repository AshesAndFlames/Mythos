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
**Status:** Proposed. **Must be validated in the Day-1 spike.**

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
**Status:** Proposed

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

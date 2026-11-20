# Mythos: Implementation Plan

Status: **Proposed.** Implementation starts only after approval of ARCHITECTURE.md §9.

The day-by-day calendar is in FIVE_DAY_ROADMAP.md. This document defines the phases, their deliverables, and the definition of done.

## Guiding rules

- Use the official scaffold. Extend it; never hand-assemble the runtime.
- Get one working deploy early, then grow it. Every phase ends with tests, a deploy, and a check on the live app.
- Each feature is complete only when:
  - the UI exists;
  - the backend works;
  - permissions are enforced in the DO or an action;
  - input is validated with Zod;
  - loading, empty and error states are handled;
  - its important behavior has tests.
- No mocks where real functionality is expected. Only the external integration boundary is mocked, and only in automated tests.
- Business logic goes in `src/server/mythos/` and feature hooks. Components only present.

## Phase 0: Setup (needs a human, about 30 min)

| Step | Owner |
|---|---|
| Approve the architecture and the decisions in ARCHITECTURE.md §9 | You |
| `npx deepspace auth login`, then `auth whoami` to confirm the owning account | You |
| Choose the app name and source authority (GitHub vs DeepSpace) | You |
| Delete placeholders. Scaffold (`npm create deepspace@latest .`). Convert `claude.md.txt` to `CLAUDE.md` | Claude |
| Create test accounts: Owner, Editor, Viewer, Outsider (`@deepspace.test`) | Claude (with your session) |
| First deploy of the untouched scaffold to prove the pipeline | Claude |

## Phase 1: Foundation and de-risking

**Deliverables**
1. Schemas for `universes`, `team_members`, `categories`, `articles`, `article_links`, `article_references` and `usage`. Register them in `src/schemas.ts`. Add a `lintSchema() === []` Vitest test.
2. `wsRoute` requires a token. The app shell and theme are replaced (not the scaffold placeholder look).
3. `src/server/mythos/validation.ts` (Zod), `membership.ts` (`requireRole`) and `slug.ts`, with unit tests.
4. The `createUniverse` action.
5. **RBAC spike with 4 users.** Prove each of these:
   - an outsider receives no rows from another universe;
   - `teamField: '_rowId'` works on `universes`;
   - an editor can `put` and type in the Yjs body, while a viewer's `put` is rejected and their `canWrite` is false;
   - `writableFields` rejects client writes to `editorIds`, `universeId` and `ownerId`.

   Record the results in ADR-004. Apply the fallback if needed.

**Exit:** a deployed app where a signed-in user creates a universe, and the spike tests pass.

## Phase 2: Universes, membership, articles

**Deliverables**
1. "My universes" (list and create), and universe settings with the `updateUniverse` / `deleteUniverse` actions (cascade).
2. Members page: the `inviteMember`, `setMemberRole`, `removeMember` and `leaveUniverse` actions, including the `editorIds` fan-out.
3. The `useUniverseRole` hook, used for UI gating.
4. Articles: the `createArticle`, `renameArticle` and `deleteArticle` actions (cascade). The article page with summary, infobox (type-suggested keys), status, and tags.
5. Body editor: `npx deepspace add documents`. Adapt its Tiptap editor to `useYjsField('articles', id, 'body')`. Do not register the `documents` collection. Show remote carets and the presence avatar strip.
6. Playwright `collab.spec.ts`:
   - the owner invites the editor and the viewer;
   - the editor's typing appears live for the owner;
   - the viewer's editor is read-only;
   - the outsider's universe list is empty.

**Exit:** two real accounts co-edit an article on production.

## Phase 3: Organization, relationships, browsing

**Deliverables**
1. Categories: the `createCategory`, `updateCategory` and `deleteCategory` actions (depth ≤ 2, un-categorize on delete), a category tree, and the category picker on articles.
2. Tags: the tag editor (normalized), with tag filters on the universe home.
3. Relationships:
   - the `createLink`, `updateLinkNote` and `deleteLink` actions;
   - a link picker (same-universe article search plus a relationship type);
   - the Relationships panel and the "Referenced by" panel with inverse labels.
4. Encyclopedia home: cover, description, category tree, A–Z index grouped by type, recently updated, tag cloud, and type/category/tag filters.
5. Search with the `search-bar` feature over titles, summaries and tags.
6. Cover image upload (png/jpeg/webp, ≤ 5 MiB, validated), stored in R2 with the key on the article or universe.
7. Tests for the role matrix: a viewer cannot link or categorize, an editor cannot manage members, and cascades leave no orphans.

**Exit:** the full non-AI product journey works on production.

## Phase 4: Integrations

**Deliverables**
1. `src/integrations.ts` billing (per the approved decision), the `caps.ts` helper with the `usage` collection, and **one approved paid `invoke` per endpoint** to confirm the response shapes. The shapes are then encoded as Zod schemas.
2. **Wikipedia:** the `researchWikipedia` action, a research sidebar, and "Save as reference" (`addReference`) with attribution.
3. **Gemini:** the `generateCoverImage` action (prompt builder in `prompts.ts`), decoded and stored in R2, then set as the cover.
4. **Claude:**
   - the copilot template's built-in chat dock on universe pages (do not run `add ai-chat`);
   - a `chat-routes.ts` extension that adds `universeId` context with a membership check;
   - custom tools, with the built-in write tools trimmed;
   - the `aiExpandArticle` and `aiSuggestLinks` actions with Zod-validated output, plus an accept/reject UI.
5. Every integration surface uses `useAsyncResource` with four states, `insufficient_credits` and cap messages, and buttons disabled while busy.
6. Playwright tests mock only the integration HTTP boundary.

**Exit:** all three integrations work on production within the caps.

## Phase 5: Hardening and release

**Deliverables**
1. Security tests:
   - forged WebSocket writes (an outsider `put`s another universe's article; a viewer `put`s `editorIds`);
   - actions without auth (expect 401);
   - actions against the wrong universe (expect refused);
   - checks that no response contains emails.
2. Accessibility and polish pass (`/design/product-polish`, anti-AI gate).
3. `npx deepspace test run all`, then `deploy`. Verify on production with two accounts. Review `logs --follow`, `releases` and `app usage`.
4. `README.md`: overview, roles, integrations, how to run, known limitations. Plus a demo script.

## Stretch (only after Phase 5 is green)

In priority order:
1. Inline `[[article]]` mentions in the body.
2. A relationship graph view.
3. Invite emails and an accept step.
4. A gated image proxy.
5. Public published universes.
6. Managed-knowledge RAG.
7. Exa web research.
8. Batch image jobs.
9. Timelines.

## Testing strategy

| Layer | Tool | Covers |
|---|---|---|
| Pure logic | Vitest | Zod schemas, `requireRole`, slugging, cascade planning, inverse labels, prompt builders, caps, `lintSchema` |
| API / actions | Playwright `api.spec.ts` | Auth required, role checks, same-universe integrity, cap enforcement |
| Multi-user | Playwright `collab.spec.ts` with `users(4)` | Live sync, the viewer read-only, the outsider isolation, presence |
| Smoke | `smoke.spec.ts` (scaffold) | Routes render, landing is static |
| Production | Manual, with 2 real accounts | The full journey from PRODUCT_SPEC §7 |

Commands to run:
- Vitest: `npx deepspace test run`, then `npx deepspace test run all` before each deploy.
- TypeScript: `tsc --noEmit`.
- Lint: the scaffold's ESLint.

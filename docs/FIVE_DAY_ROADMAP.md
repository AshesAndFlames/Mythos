# Five-Day Roadmap

The principle is to put a working deploy up on Day 1, then grow it. Every day ends with `test run`, then `deploy`, then a check of the live app. Stretch work only begins after the core journey passes on production.

## Day 0 (before Day 1, about 30 minutes, needs a human)

Get the approvals listed in ARCHITECTURE.md §9:
- account login (`npx deepspace auth login`),
- the app name,
- the source authority (GitHub vs DeepSpace),
- the billing model,
- workspace cleanup.

Create 3 test accounts (`npx deepspace test accounts create ...@deepspace.test`): Owner, Editor, Outsider.

## Day 1: Foundation and de-risking

1. Scaffold: `npm create deepspace@latest`. Commit `wrangler.toml` after registration. Make a first `deploy` of the untouched scaffold to prove the pipeline.
2. Replace the scaffold theme and starter home. Set up the static landing and the gated app shell.
3. Lock down `wsRoute` so it requires a token.
4. Write the schemas: `universes`, `team_members`, `articles`, `article_links`, `article_references`, `usage`. Add a `lintSchema` unit test so lint stays clean.
5. **De-risk spike (most important item of the day).** With 3 users, prove that:
   - `read: 'team'` via `team_members` hides universe B from a non-member of B;
   - `teamField: '_rowId'` works on `universes`;
   - `update: 'collaborator'` with `editorIds` lets the editor and not the viewer write, **including Yjs `canWrite` on `useYjsField('articles', id, 'body')`**;
   - `writableFields` blocks client writes to `editorIds` and `universeId`.

   If any of these fails, apply the fallback in ADR-004 today.
6. Actions: `createUniverse`, plus shared helpers (`requireMembership`, `requireRole`, validation) with Vitest tests.

**Exit criteria:** a deployed app where a signed-in user creates a universe. Spike results recorded in ARCHITECTURAL_DECISIONS.md.

## Day 2: Universes, membership, articles

1. Universes list and create page. Universe home (article index by type, empty states).
2. Members page with the `inviteMember`, `setMemberRole`, `removeMember`, and `leaveUniverse` actions, including the `editorIds` fan-out.
3. Articles: the `createArticle` / `deleteArticle` actions, the article page with field editing, and `npx deepspace add documents` (adapt its Tiptap editor to `useYjsField('articles', id, 'body')`; do not register the `documents` collection).
4. Presence avatars on the article page.
5. Playwright `collab.spec.ts`: the owner invites the editor, the editor's edit appears live for the owner, and the outsider gets an empty list.

**Exit criteria:** two real users co-edit an article on production.

## Day 3: Organization, relationships, images, search

1. Categories (actions, tree, picker) and tags. The encyclopedia home with A–Z by type and filters.
2. The `createLink` / `deleteLink` actions. A link picker (search articles in the same universe, choose a type). Outgoing links and backlinks on the article page.
3. Cover image upload (validated type and size), stored in R2 with the key on the article.
4. The `search-bar` feature on the universe home.
5. Universe settings (art style) and `deleteUniverse`.
6. Tests for the role matrix: the viewer cannot type or link, and the editor cannot manage members.

**Exit criteria:** the full non-AI journey works on production.

## Day 4: The three integrations

1. `src/integrations.ts` billing, the `usage` cap helper, and **one paid `invoke` per endpoint** (with approval) to confirm the response shapes.
2. **Wikipedia:** the `researchWikipedia` action, a research side panel, and "Add as reference" via `article_references`.
3. **Gemini:** the `generateCoverImage` action (prompt built from article, universe art style, and the no-text suffix), stored to R2.
4. **Claude:**
   - the copilot template's built-in chat dock (do not run `add ai-chat`), shown on universe pages, with custom tools (`universe_articles`, `wikipedia_lookup`) and the built-in write tools trimmed;
   - the `aiExpandArticle` and `aiSuggestLinks` actions with validated JSON.
5. Four UI states on every integration surface, with `insufficient_credits` handling. Playwright mocks the integration boundary.

**Exit criteria:** all three integrations work on production under the caps.

## Day 5: Hardening, polish, ship

1. Security pass:
   - a forged WebSocket write test (outsider tries `put` on another universe's article);
   - an action test with no auth (expect 401) and with the wrong universe (expect refused);
   - check that no action returns user emails;
   - review `logs`.
2. Visual polish following `/design/product-polish` and the anti-AI gate. Accessibility basics.
3. `npx deepspace test run all`, then `deploy`, then verify on production with two accounts. Check `releases`, `app usage` (spend), and `logs --follow`.
4. A README and demo script (journey steps, roles, integrations, known limitations).
5. Buffer for overruns. Only start the stretch list if everything above is done.

## Risk register

| Risk | Mitigation |
|---|---|
| `team` / `collaborator` RBAC doesn't behave as documented with Yjs | Day-1 spike; fallback in ADR-004 |
| Integration response shapes differ from the docs | `info` schemas were captured; one `invoke` per endpoint on Day 4 |
| Owner credits run out mid-demo | Caps, a check of `app usage`, and a top-up as a human action |
| R2 128 MiB free cap | Cap images at 5 per user per day; prefer `aspectRatio` with modest `imageSize` |
| Tiptap integration time | Reuse the documents feature's editor files instead of writing from scratch |
| Slot/quota refusal on deploy | Surface it to the user (free a slot or upgrade); not an agent decision |

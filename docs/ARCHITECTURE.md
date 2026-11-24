# Mythos: Architecture (DeepSpace-native)

Status: **PROPOSED, awaiting approval.** No implementation has started.

Related documents:
- PRODUCT_SPEC.md: what we build.
- DATABASE_SCHEMA.md: collections and permissions.
- IMPLEMENTATION_PLAN.md: how and when.
- DEEPSPACE_RESEARCH.md: platform findings.
- INTEGRATION_STRATEGY.md: the three integrations.
- ARCHITECTURAL_DECISIONS.md: the ADRs.

## 1. Current repository (inspected 2026-11-20)

| Item | Finding | Action |
|---|---|---|
| Framework / runtime | **None.** No `package.json`, lockfile, `tsconfig`, or build config | Scaffold with `npm create deepspace@latest` (SDK 0.44.2) |
| `src/app/universes/example/page.tsx.txt`, `.../articles/page.tsx.txt` | 0-byte Next.js App Router-style placeholders | Delete (approval required). Superseded by `src/pages/` routes |
| `supabase/seed.sql.txt` | 0 bytes | Delete (approval required). There is no SQL database |
| `tests/` | Empty | Replaced by the scaffold's `tests/` (Playwright + Vitest) |
| `claude.md.txt` | Engineering guidelines. Mostly platform-neutral and worth keeping; two rules are Supabase-specific | Convert into the project `CLAUDE.md`, rewriting the RLS and migrations rules to DeepSpace equivalents (approval required) |
| `docs/` | Planning documents (this set) | Keep |

**Worth preserving:** the guidelines' principles (strict TypeScript, server-side authorization, validation, loading/error/empty states, no dead controls, definition of done) and the docs.

**There is no working code to preserve.**

**Missing infrastructure** (all supplied by the scaffold or platform):
- the build toolchain, the worker, and Durable Objects;
- auth, the data layer, and file storage;
- the test harness;
- deploy;
- DeepSpace login, app registration, and the source-control authority. These are human steps.

## 2. Stack

| Concern | Choice | Notes |
|---|---|---|
| Language | TypeScript, `strict` (scaffold default) | No `any` in app code. Integration responses are narrowed through Zod |
| Frontend | React + Vite + Tailwind v4 + scaffold UI primitives (`src/components/ui`) | |
| Routing | generouted file routes in `src/pages/` | Three tiers: static, `(app)`, `(app)/(protected)` |
| Backend | One Cloudflare Worker (`worker.ts`, Hono) | Scaffold routes plus server actions |
| Data and sync | Collections in the app `RecordRoom` DO; `useQuery` / `useMutations` | See DATABASE_SCHEMA.md |
| Auth | DeepSpace auth (GitHub/Google). JWT verified in the worker | |
| Authorization | DO collection RBAC plus server actions | Replaces Supabase RLS (ADR-011) |
| Validation | **Zod** in server actions and AI tools | Already used by the scaffold's AI tools **[verify in package.json after scaffolding]**; add it explicitly only if it is absent |
| Rich text and co-editing | Record-bound Yjs (`useYjsField`) + Tiptap | Editor components reused from `npx deepspace add documents` |
| Presence | `usePresence` | |
| Files | R2 via `useR2Files` / `appFiles` | |
| AI | `ai-chat` feature (Claude via `streamDeepSpaceAgent`) and `tools.integration('anthropic/chat-completion')` | |
| Integrations | Integration proxy (`tools.integration`), billing set in `src/integrations.ts` | Claude, Gemini images, Wikipedia |
| Tests | Vitest (helpers, Zod schemas, `lintSchema`) and Playwright with `deepspace/testing` multi-user fixtures | |
| Deploy and ops | `npx deepspace deploy`, `logs`, `releases`, `app usage` | |

**Dependencies we expect to add, each justified:**
- Tiptap packages, via the `documents` feature: the rich-text editor with Yjs binding.
- Markdown renderers, via the `ai-chat` feature: chat output.
- Zod, only if the scaffold does not already include it.

Nothing else.

**Deliberately not used**, because DeepSpace provides the equivalent:
- Supabase (DB, Auth, RLS, Storage, Realtime);
- Next.js;
- Prisma or Drizzle;
- NextAuth or Clerk;
- Liveblocks, PartyKit or Socket.io;
- direct provider SDKs or API keys;
- S3 presigned URLs;
- Vercel;
- an external cron or queue service;
- React Query (the SDK hooks are already live).

No concrete requirement found so far needs separate infrastructure.

## 3. Request and data flow

```
Browser (React SPA)
 ├─ WS /ws/:roomId ──────────► AppRecordRoom DO (collections, RBAC, record-bound Yjs body)
 ├─ POST /api/actions/:name ─► server actions: verified userId → Zod → membership/role check → writes
 │                               ├─ tools.query/create/update/remove/deleteWhere ─► AppRecordRoom
 │                               ├─ tools.integration(...) ─► platform API worker ─► Claude / Gemini / Wikipedia
 │                               └─ appFiles(env,…).upload ─► R2
 ├─ POST /api/ai/chat ───────► Lore Assistant stream (tools run under caller RBAC)
 ├─ /api/files/* ────────────► R2 reads
 └─ /api/auth/* ─────────────► platform auth worker
```

Everything lives in the app's main RecordRoom. Universes are isolated by RBAC, not by separate rooms (ADR-003).

## 4. Authorization model

The full schema and permission blocks are in DATABASE_SCHEMA.md.

| Universe role | Read | Edit fields + Yjs body | Create/delete articles, links, categories, refs | Members | Settings / delete universe |
|---|---|---|---|---|---|
| owner | ✔ `team` | ✔ (`ownerId`) | ✔ action | ✔ action | ✔ action |
| editor | ✔ `team` | ✔ (`editorIds`) | ✔ action | ✖ | ✖ |
| viewer | ✔ `team` | ✖ (DO rejects; Yjs `canWrite=false`) | ✖ | ✖ | ✖ |
| non-member | ✖ (rows never sent) | ✖ | ✖ | ✖ | ✖ |

- **Read isolation:** `teamField` + `team_members`, evaluated in the DO.
- **Editor vs. viewer:** `update: 'collaborator'` against a server-maintained `editorIds` (ADR-004). This is validated in the Day-1 spike, and there is a documented fallback.
- **Creates and deletes:** only server actions, because `create` permission is boolean and cannot check universe membership.
- **App-level lockdown:** `wsRoute` requires a token (ADR-010). Anonymous users and the app-level `viewer` role get nothing.

## 5. Server actions (business logic layer)

All actions live in `src/actions/index.ts`. Each one is thin and delegates to pure, tested helpers in `src/server/mythos/`:
- `validation.ts`: Zod schemas.
- `membership.ts`: `requireRole(tools, userId, universeId, minRole)`.
- `cascade.ts`, `slug.ts`, `caps.ts`, `prompts.ts`.

Every action follows the same steps: Zod-parse params → `requireRole` → same-universe integrity checks → writes → minimal result. Actions never return raw `users` rows.

| Group | Actions | Minimum role |
|---|---|---|
| Universes | `createUniverse`, `updateUniverse`, `deleteUniverse` | signed-in / owner / owner |
| Members | `inviteMember` (also sends the invitation email, ADR-023), `listInvitations`, `revokeInvitation`, `setMemberRole`, `removeMember` | owner (`removeMember` on yourself: any member leaving) |
| Invitations | `myInvitations`, `respondToInvitation` | signed in; only invitations addressed to the caller's account email |
| Articles | `createArticle`, `renameArticle`, `deleteArticle` | editor |
| Categories | `createCategory`, `updateCategory`, `deleteCategory` | editor |
| Links | `createLink`, `updateLinkNote`, `deleteLink` | editor |
| References | `addReference`, `removeReference` | editor |
| Integrations | `researchWikipedia` (viewer+), `generateCoverImage`, `aiExpandArticle`, `aiSuggestLinks` (editor+) | as noted. All check the cap |

**Simple field edits** (summary, infobox, tags, category, status, cover key) go straight through `useMutations().put`, which the DO enforces. That keeps editing snappy and avoids an action per keystroke. These forms are validated with the same Zod schemas on the client for UX; the server boundary is the DO plus `writableFields`.

## 6. AI design

- **Lore Assistant:** the `ai-chat` ChatPanel is docked on universe pages.
  - The current `universeId` is sent with each turn. This needs a small extension of `chat-routes.ts` to accept it, validate membership, and inject the universe's name and art style plus an article index into the system prompt.
  - Built-in `records.*` tools run under caller RBAC, so cross-universe reads are impossible.
  - Write tools are trimmed: the assistant suggests, and the user applies.
  - Custom tools: `universe_articles`, `get_article` (title, summary, infobox, links), and `wikipedia_lookup`.
  - The system prompt treats article text as **data**, as a defense against prompt injection through shared content.
- **One-shot actions:** these use Claude Sonnet- or Haiku-class models for cost. Structured output is parsed with Zod. Suggested links are filtered to real same-universe article ids before they reach the UI.
- **Images:** the prompt is built from the article fields, the universe `artStyle`, and the docs' no-text suffix. Generated images are stored once in R2, never regenerated on view.

## 7. Frontend structure

```
src/pages/index.tsx                                       static landing
src/pages/(app)/(protected)/universes/index.tsx           my universes + create
src/pages/(app)/(protected)/u/[universeId]/index.tsx      encyclopedia home: categories, A–Z by type, tags, recent, search
src/pages/(app)/(protected)/u/[universeId]/a/[articleId].tsx  article: cover, infobox, Tiptap body, relationships, backlinks, references, presence, research/AI sidebar
src/pages/(app)/(protected)/u/[universeId]/members.tsx
src/pages/(app)/(protected)/u/[universeId]/settings.tsx
src/features/universes|articles|links|categories|members|research|ai/   hooks + components per feature
src/server/mythos/                                        pure business logic (shared by actions, tested)
src/schemas/                                              collections
```

- Business logic lives in hooks and `src/server/mythos/`. Presentation components receive data and callbacks.
- A `useUniverseRole(universeId)` hook reads the caller's own `team_members` row to gate controls. This is UX only; the DO and actions are the boundary.
- Write controls stay disabled until `useMutations().ready`. Confirmed mutations are used before navigation.

## 8. Security concerns and mitigations

| # | Concern | Mitigation |
|---|---|---|
| S1 | Cross-universe data leakage | `read: 'team'` on every universe-owned collection. Actions verify every id belongs to the claimed universe. A three-user Playwright test includes an outsider |
| S2 | Privilege escalation via forged WebSocket writes | `create: false`, `writableFields`, `immutable` and server-maintained `editorIds`. A test sends forged `put`s |
| S3 | Self-joining a universe | `team_members` has no client writes (the taskspace example allowed member creates; we don't) |
| S4 | Spoofed identity | Identity comes only from the JWT (`wsRoute` strips URL identity; actions use `ctx.userId`) |
| S5 | Anonymous access | `wsRoute` requires a token. No `'*'` permissions |
| S6 | Spend abuse of owner-billed integrations | Actions only, with a membership check, a per-user daily cap, and disabled-while-busy buttons |
| S7 | Input validation | Zod in actions (lengths, enums, id format, `https:` URLs). DO `select` and `required` |
| S8 | XSS | React escaping. Tiptap stores structured content. AI and Wikipedia text are rendered as text or sanitized Markdown, with no `dangerouslySetInnerHTML` |
| S9 | Prompt injection via shared articles | Article content is delimited as data. The assistant has no write tools. Outputs are validated before any write |
| S10 | Secrets | No provider keys exist (integration proxy). Any future key goes in `deepspace secrets`. `callerJwt` is never logged or returned |
| S11 | User email exposure | Use `useUsers()` (public projection). Actions never return user rows. The invite lookup returns only "found / not found" plus an id |
| S12 | File uploads | Allowlist png/jpeg/webp, max 5 MiB, random keys. The platform blocks HTML/SVG/JS and sets `nosniff` |
| S13 | Private-universe images are public by URL (`'app'` scope) | Unguessable keys in MVP. A gated proxy is a stretch goal. **Needs acceptance** (ADR-006) |
| S14 | Destructive cascades | Owner-only, typed confirmation, bounded `deleteWhere` loops |

## 9. Items that require human approval

1. Delete the empty placeholders (`src/app/`, `supabase/`, `tests/`) and scaffold into this folder.
2. **"Implement Supabase Row Level Security"** in the brief conflicts with "do not introduce Supabase". The proposal is to meet the same intent with DeepSpace's server-enforced RBAC (ADR-011). Please confirm.
3. Convert `claude.md.txt` into `CLAUDE.md`, replacing the Supabase rules.
4. `npx deepspace auth login` (you run it). Confirm which account owns the app.
5. App name / subdomain.
6. **Source authority (permanent):** GitHub or DeepSpace.
7. Who pays for AI and images (recommended: owner, with caps). Credit balance.
8. Accept public-by-URL images for MVP, or fund the gated proxy.
9. The roles fallback if the Day-1 spike fails (owner/editor only).
10. A few cents for one real test call per integration.

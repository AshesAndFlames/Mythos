# DeepSpace Platform Research

Research date: 2026-11-20. Docs read from `https://docs.deep.space/llms-full.txt` (129 pages). Catalogs come from the live CLI.

- **SDK / CLI version:** `deepspace@0.44.2` (the `create-deepspace` version is the same).
- **Node:** v26.13.1, installed during this research. The supported lines are 22.15+, 24 and 26.
- **CLI login:** not yet. `auth whoami` returns `not_authenticated`. The catalog commands do not need a login.
- **Official examples inspected:** `deepdotspace/taskspace` (teams and membership) and `deepdotspace/storynest` (Gemini images and AI text).

Where this document and the installed `.d.ts` files disagree, the `.d.ts` files win. Statements marked **[verify]** come from the docs and have not yet been exercised against a running app.

---

## 1. What a DeepSpace app is

A DeepSpace app is **one Cloudflare Worker** (Hono) that serves a **Vite + React SPA**. It owns per-app **Durable Objects** that hold all shared state. Platform workers that DeepSpace runs supply auth, billing, the integration proxy, files, and deploys. You need no Cloudflare account. The app lives at `<name>.app.space`.

The scaffold (`npm create deepspace@latest`) ships these parts:

| Layer | What the scaffold gives you |
|---|---|
| Frontend | React + Vite, Tailwind v4, file-based routing with `generouted` (`src/pages/`), and shadcn-style primitives in `src/components/ui` |
| Route tiers | `src/pages/*.tsx` is static (no providers). `src/pages/(app)/*` has data and auth and works signed out. `src/pages/(app)/(protected)/*` requires sign-in through `<AuthGate>` |
| Worker | `worker.ts` (Hono) with routes `/ws/*`, `/api/auth/*`, `/api/integrations/*`, `/api/actions/:name`, `/api/ai/*`, `/api/files/*` |
| Durable Objects | `RecordRoom` (SQLite collections), `YjsRoom`, `CanvasRoom`, `PresenceRoom`, `CronRoom`, `JobRoom` |
| Data | `src/schemas.ts` and `src/schemas/*`. Schemas are baked in at deploy time |
| Privileged logic | `src/actions/index.ts` holds server actions |
| AI | `src/ai/tools.ts` and `src/ai/chat-routes.ts` |
| Tests | Playwright (smoke / api / collab specs) and Vitest. `deepspace/testing` provides a multi-user fixture |

---

## 2. Capability inventory

For each capability: what DeepSpace provides, how Mythos would use it, whether extra dependencies are needed, and whether custom code is needed.

### 2.1 Authentication and user management
- **Native:** Better Auth runs in the platform auth worker. Users sign in with GitHub or Google. JWTs are ES256 and last 5 minutes. `DeepSpaceAuthProvider`, `AuthBoot`, `<AuthGate>`, `useAuth()`, `useUser()`, and `useUsers()` (a privacy-projected directory). For custom HTTP routes, the worker calls `verifyJwt` (it never throws; check `result`).
- **Required `users` collection:** extend `USERS_COLUMNS` / `BASE_USERS_SCHEMA`. Never rename or replace it.
- **Mythos use:** all accounts. Universe pages go under `(app)/(protected)/`. A future public "published universe" view could live in `(app)/`.
- **Extra dependencies:** none.
- **Custom code:** none for auth itself. Do **not** add Supabase Auth, NextAuth, Clerk, or similar.

### 2.2 Persistent data storage
- **Native:** collections, which are typed SQLite tables in the app's `RecordRoom` DO. Records use an envelope (`recordId`, `data`, `createdBy`, `createdAt`, `updatedAt`). Columns are `text`/`number` with interpretations such as `select`, `json`, `reference`, `date`, and `url`. Column flags include `required`, `immutable`, `userBound`, `default`, and `timestampTrigger`. `uniqueOn` gives composite uniqueness.
- **Client:** `useQuery` and `useMutations` (`create` / `put` / `remove` plus `*Confirmed` variants).
- **Limits:** the docs describe records as tuned for "hundreds to tens of thousands of small rows". A worldbuilding wiki fits that.
- **Mythos use:** universes, memberships, articles, article links, and usage counters.
- **Extra dependencies:** none. Do **not** add Supabase/Postgres, Prisma, or Drizzle.
- **Custom code:** schemas and server actions only.

### 2.3 Real-time synchronization
- **Native:** every `useQuery` subscribes over WebSocket. The DO broadcasts `core.record_change` only to clients whose RBAC allows the read. There is no optimistic insert; the local store updates when the server broadcasts back.
- **Mythos use:** article lists, link panels, and member lists update live for every collaborator.
- **Extra dependencies / custom code:** none.

### 2.4 Role-based permissions
- **Native:** per-collection `permissions` keyed by role (`'*'`, `viewer`, `member`, `admin`). Levels are `true/false`, `'own'`, `'unclaimed-or-own'`, `'collaborator'`, `'team'`, `'published'`, and `'shared'`. Modifiers are `ownerField`, `collaboratorsField`, `teamField`, `visibilityField`, and `writableFields`. **Enforcement happens in the DO before data reaches the wire.**
- **App roles vs. universe roles:** the built-in roles apply **app-wide** (one role per user per room). Per-universe roles need a different mechanism:
  - **`teamField` + a collection literally named `team_members`** (columns `teamId`, `userId`, `status`). The `'team'` level passes for the owner, for users in `collaboratorsField`, or for active members of the team in `teamField`. The official `taskspace` example uses `teamField: '_rowId'` on its `teams` collection so a team row is readable by its own members.
  - **Server actions** (`POST /api/actions/:name`). They run as the app, bypass RBAC, receive a verified `userId`, and do multi-collection orchestration.
- **Mythos use:** described in ARCHITECTURE.md §4. In short: a universe is a team. Reads use `'team'`. Writes use `'collaborator'` against a server-maintained `editorIds` list. Every membership change goes through a server action.
- **Extra dependencies:** none.
- **Custom code:** membership and role server actions. These are what makes universe roles real.

### 2.5 Multi-user collaboration
- **Native:** live records, `usePresence` / `usePresenceRoom` (who is online, cursors, typing), and Yjs co-editing.
- **Mythos use:** live article editing, a "who's here" avatar strip on articles, and live member and article lists.
- **Custom code:** UI only.

### 2.6 File storage
- **Native:** R2 through `useR2Files` (client) and `appFiles` (worker).
  - Scope `'self'` (default) is readable **only by the uploading user**.
  - Scope `'app'` is **publicly readable**; the URL works as an `<img src>`.
  - Writes always require sign-in. Files can be up to 1 GiB, with multipart above 20 MiB. The total allocation is capped by the owner's plan (**128 MiB on the free plan**).
  - The server refuses active content (HTML, SVG, JS) and serves files with `nosniff`.
- **Gap:** there is **no per-team / per-universe file scope**. `'self'` hides an image from the other universe members. `'app'` makes it public to anyone who has the URL.
- **Mythos use:** article cover images and AI-generated art. See ARCHITECTURAL_DECISIONS.md ADR-006 for the tradeoff.
- **Extra dependencies:** none.

### 2.7 Collaborative text editing
- **Native:** Yjs CRDTs.
  - `useYjsText` / `useYjsField(collection, recordId, field)` are **record-bound**. They sync over the record's RecordRoom connection, and **`canWrite` mirrors the collection's update RBAC**.
  - `useYjsRoom(docId)` is a standalone YjsRoom.
  - The `documents` feature (`npx deepspace add documents`) ships a Tiptap + Yjs editor (toolbar, remote carets, outline) with per-document viewer/editor sharing.
- **Mythos use:** the article body is a record-bound `useYjsField('articles', id, 'body')` bound to Tiptap. We reuse the documents feature's editor components but **not** its `documents` collection: universe-level roles must govern article access, not per-document invites.
- **Extra dependencies:** the Tiptap packages the documents feature adds (`@tiptap/react`, starter-kit, collaboration, and collaboration caret). These are the documented path.

### 2.8 Messaging and notifications
- **Native:** the `messaging` feature (channels, threads, reactions, read receipts) is **public-channel only by design**. Private channels need an app schema with `read: 'shared'`/`'team'`. For email, the `email/send` integration goes through Resend.
  - Note: the catalog description says the sender is fixed (`DeepSpace Apps <notifications@updates.app.space>`, "any from value is ignored"). The External APIs guide says to send from `<app>@app.space`. **[verify]** before relying on either.
  - The docs describe no in-app notification service. The `topbar` feature has a notifications UI slot.
- **Mythos use (post-MVP):** per-universe discussion via a schema with `read: 'team'`. "You were invited to universe X" emails through `email/send`.
- **Custom code:** yes, if built. It is out of MVP scope.

### 2.9 AI capabilities
- **Native:**
  - **AI chat** (`npx deepspace add ai-chat`): streamed multi-turn chat, persisted to `ai-chats` / `ai-messages` (owner-only RBAC, `create: false`), context compaction, and tool use. The default model is `claude-opus-5-5`. Other agent-capable models are `claude-sonnet-5-5`, `claude-haiku-5-5`, `claude-fable-5-1`, `gpt-6-sol`, and `gpt-6-luna`. Built-in record tools (`records.query/get/create/update/delete`, `schema.*`, `user.current`) run **under the caller's RBAC**. Custom tools go in `buildTools` (`src/ai/tools.ts`).
  - **Billing:** the scaffold's chat routes pass the caller's JWT, so **each user pays from their own DeepSpace credits** by default. Omitting `authToken` bills the owner.
  - **`createDeepSpaceAI(env, provider, { authToken? })`** lets the worker generate directly.
  - **`registerAgent`** exposes the same tools to a local coding agent.
  - **Managed knowledge** (`knowledge(env)`): one Cloudflare AI Search instance per app, with folders, hybrid/semantic/fulltext search, and owner-billed usage.
- **Mythos use:** a Lore Assistant (chat grounded in the universe's articles) plus one-shot "Expand article" and "Suggest relationships" actions. Managed knowledge is a stretch goal for long-universe RAG.
- **Extra dependencies:** the ai-chat feature adds `react-markdown`, `remark-gfm`, `remark-breaks`, `rehype-highlight`, and `highlight.js`. Do **not** add the OpenAI or Anthropic SDKs directly.

### 2.10 Background jobs and scheduling
- **Native:** `JobRoom` (`src/jobs.ts`, `useJobs`, `enqueueJob`) runs durable jobs from seconds to more than 15 minutes. `authorizeWrite` defaults to member or admin; tighten it for owner-billed jobs. `CronRoom` (`src/cron.ts`) runs schedules with history. Server actions cover work that finishes inside the request.
- **Mythos use:** MVP integration calls finish within a request, so they use server actions. Jobs become worthwhile for batch work such as "generate portraits for 10 characters" or "re-index the universe into knowledge". Cron could send a weekly "what changed in your universe" digest (stretch).

### 2.11 Third-party integrations
- **Native:** the integration proxy covers 215+ endpoints. No provider keys are needed. Calls are billed in DeepSpace credits (100 credits = US$1).
  - Billing per provider is set in `src/integrations.ts`. `'developer'` (owner pays) is the default. `'user'` makes the signed-in caller pay; anonymous callers get 401.
  - **Developer-billed endpoints accept anonymous callers**, and the platform rate-limits only `google/*`. Spend control is the app's job: sign-in, server actions, and per-user caps.
- Client: `integration.post(...)`, `useAsyncResource`, and `usePagedResource`. Worker: `tools.integration(...)`.
- Details are in INTEGRATION_STRATEGY.md.

### 2.12 Deployment and environment management
- **Native:**
  - `npx deepspace deploy` builds with Vite, validates bindings, uploads to Workers for Platforms, and serves at `<name>.app.space`.
  - Apps **register on first use** under whichever account is logged in.
  - `deepspace secrets` is the per-app encrypted store. Never hand-edit `.dev.vars`.
  - The release ledger supports `releases` and rollback. `logs --follow`, `activity`, and `app usage` cover operations.
  - Local dev is `npx deepspace dev start`. Tests run with `npx deepspace test run [all]`.
  - The source authority (**GitHub or DeepSpace**) **latches permanently** on the first source-producing action.
- **Mythos use:** standard. No external CI, Vercel, or Docker.

---

## 3. Feature catalog (`npx deepspace add --list`)

| Feature | Relevance to Mythos |
|---|---|
| `ai-chat` | **Use.** The Lore Assistant panel and persisted chat history |
| `documents` | **Borrow the editor** (Tiptap + Yjs toolbar and carets). Do not adopt its `documents` collection as the article store |
| `search-bar` | **Use.** Local ranked search over the article titles and summaries already synced to the client |
| `file-attachments` / `file-manager` | Optional. Cover images need only `useR2Files` directly |
| `admin-page` | Optional. App-level admin user management |
| `tree` | Maybe. A hierarchical sidebar for the article tree (stretch) |
| `canvas` | Stretch. A collaborative relationship map or world map |
| `landing` | Maybe. A marketing landing at `/`, which must stay static |
| `messaging`, `kanban`, `tasks`, `leaderboard`, `items`, `cron`, `documentation`, `mobile`, `topbar` | Not for MVP |

---

## 4. Lessons from the official examples

**taskspace (teams):**
- `teams` uses `teamField: '_rowId'`, so a team record is readable by its own members. `team_members` has `TeamId`, `UserId`, `RoleInTeam`, and `Status` (`active` / `invited`). Content collections use `teamField: 'TeamId'` with `read: 'team'`.
- Membership changes (invite, claim, role change, remove) are **server actions** that check the caller's `team_members` row first.
- It also uses a **per-team RecordScope** (`team:<id>`) with a custom `tools.forRoom` escape hatch and mirrored membership rows. That adds non-SDK plumbing, and it uses the older `SCOPE_ID = app:${APP_NAME}` pattern; current docs key rooms to the immutable app id.
- **Anti-pattern to avoid:** its `team_members` grants `member: { create: true }`, so any signed-in user could write a membership row for any team. Mythos sets `create: false` and routes all membership through actions.

**storynest (AI media):**
- Calls `tools.integration('gemini/generate-image', { model, prompt, aspectRatio })` from the worker and reads `base64Images`. Prompts include a style suffix and a "character sheet" for visual consistency. That idea carries over to universe-level art style in Mythos.
- Stores images in R2 and resolves `app` vs `self` scope from the physical key prefix.

---

## 5. Existing workspace state

`C:\Users\asher\documents\dsp` currently contains:
- `claude.md.txt`: engineering guidelines. Some of them are **Supabase-specific** ("Respect Supabase RLS policies", "Keep database migrations version-controlled").
- `src/app/universes/example/page.tsx.txt` and `.../articles/page.tsx.txt`: **empty** Next.js App Router-style placeholders.
- `supabase/seed.sql.txt`: **empty**.
- `tests/`: empty.

None of this is working code. The Next.js / Supabase layout conflicts with the DeepSpace scaffold (generouted under `src/pages/`, DO-backed collections). See ARCHITECTURAL_DECISIONS.md ADR-001 and the approval list in ARCHITECTURE.md.

# MVP Scope

## Core user journey (must work end-to-end on production)

1. Sign in with GitHub or Google.
2. Create a universe (name, tagline, art style).
3. Create articles of different types, and edit the body in a rich-text editor that **co-edits live** with other people.
4. Link articles with typed relationships, and see the links and backlinks on each article.
5. Invite a second user as **editor** or **viewer**. Edits sync live; the viewer cannot edit; a non-member sees nothing.
6. Use the three integrations from an article: research on Wikipedia and save a reference, generate cover art, and ask the Lore Assistant or "Expand article".
7. Everything runs at `https://<name>.app.space`.

## Platform feature map

Each row is marked **native** (DeepSpace SDK primitive) or **3rd-party** (integration-proxy endpoint).

| Mythos feature | DeepSpace capability | Kind |
|---|---|---|
| User accounts and sign-in | DeepSpace auth (Better Auth, GitHub/Google), `<AuthGate>`, `useAuth` | native |
| Universes | `universes` collection in the app RecordRoom | native |
| Universe membership and roles | `team_members` + `teamField` (`read: 'team'`), `editorIds` + `'collaborator'`, server actions | native |
| Articles (character, location, faction, event, species, item, lore, culture) | `articles` collection; `useQuery`/`useMutations` | native |
| Categories (nested) and tags | `categories` collection (actions) + `articles.tags` json | native |
| Encyclopedia browsing | Live queries: category tree, A–Z by type, tag filters, backlinks | native |
| Article relationships | `article_links` typed records + `uniqueOn` | native |
| Article body editing | Record-bound Yjs (`useYjsField`) + Tiptap (documents-feature editor) | native |
| Who's viewing / editing | `usePresence`, Yjs awareness carets | native |
| Live lists across users | RecordRoom WebSocket sync | native |
| Article search | `search-bar` feature over synced records | native |
| Cover images (upload) | R2 via `useR2Files` / `appFiles` | native |
| Privileged writes and checks | Server actions (`/api/actions/*`) | native |
| Spend caps | `usage` collection + actions | native |
| Lore Assistant chat | `ai-chat` feature (Claude through the platform AI pipeline) | native pipeline + **3rd-party** model |
| Expand article / suggest links | `anthropic/chat-completion` | **3rd-party** |
| AI cover art | `gemini/generate-image` → R2 | **3rd-party** |
| Research panel and references | `wikipedia/search-pages`, `wikipedia/get-page-summary` | **3rd-party** |
| Deploy, logs, rollback | `deepspace deploy` / `logs` / `releases` | native |

## In scope (MVP)

- **Auth:** gated app, `wsRoute` requires a token, and a static landing page at `/`.
- **Universes:** create, list mine, view, edit settings, and delete (owner only).
- **Members:** invite by email (the user must have signed in once), set the role (editor/viewer), remove a member, and leave a universe.
- **Articles:**
  - Create, rename, set type/summary/tags/status, and delete.
  - Collaborative Tiptap body.
  - Index grouped by type, local search, and a recently updated list.
- **Categories and tags:** nested categories (depth ≤ 2), tag editing, and type/category/tag filters on the encyclopedia home.
- **Relationships:** create and delete typed links. The article page shows outgoing links and backlinks with inverse labels.
- **Cover images:** upload (png/jpeg/webp, ≤ 5 MiB) or AI-generate.
- **Integrations:** Wikipedia research and references, Gemini cover art, the Claude Lore Assistant, and Claude "Expand" / "Suggest links".
- **Quality bar** (the existing CLAUDE.md definition of done):
  - Loading, empty, and error states on every view.
  - No dead buttons.
  - Inputs validated in actions.
  - Permissions enforced in the DO and actions.
  - Unit tests for helpers.
  - Playwright multi-user tests for the role matrix.

## Stretch, only after the core journey is verified live

1. A relationship graph view (canvas or a simple force layout).
2. An invite-accept flow plus an invite email through `email/send`.
3. Article version history / snapshots.
4. Membership-gated image proxy (private universe images).
5. Public read-only "published universe" pages (`'*'` read on published articles, which needs care with `'team'` + `visibilityField`).
6. Managed knowledge (`knowledge(env)`) RAG per universe for large canons.
7. Exa "Ask the web" research mode.
8. Batch portrait generation through `JobRoom`.
9. Weekly universe digest through `CronRoom`.
10. Timeline view for `event` articles.

## Explicitly out of scope

- Payments and subscriptions.
- The mobile app.
- Custom domain.
- Private messaging and chat channels.
- Ownership transfer.
- Import and export.
- Wikitext / Markdown import.
- Maps.
- Multi-language support.

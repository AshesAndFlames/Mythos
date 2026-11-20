# Integration Strategy

Source: `npx deepspace integrations list --json` and `integrations info <endpoint> --json`, run 2026-11-20 against CLI 0.44.2. Every endpoint below exists in that catalog. Costs are the catalog's base costs in USD. "Per actual cost" means the provider's real cost is settled after the call.

## Recommendation: three integrations

| # | Integration | Endpoints | Purpose in Mythos |
|---|---|---|---|
| 1 | **Anthropic Claude** (through the native AI chat pipeline and the `anthropic` proxy) | `anthropic/chat-completion`; streamed chat via `/api/ai/chat` (`createDeepSpaceAI`) | AI-assisted worldbuilding: a Lore Assistant chat plus one-shot "Expand article" and "Suggest relationships" |
| 2 | **Google Gemini image generation** | `gemini/generate-image` | Visual creation: cover art, character portraits and location art in a per-universe art style |
| 3 | **Wikipedia** | `wikipedia/search-pages`, `wikipedia/get-page-summary` | Research: real-world mythology, history and geography references from inside the editor |

**Alternatives held in reserve:**
- `exa/answer` (cited web answers) and `exa/search`: richer research, but cost is per actual use.
- `openai/generate-image` (`gpt-image-*`): a drop-in image fallback.
- `fal/run-model`: async, many models, $2 default reserve. Too heavy for MVP.
- `websearch/advanced-search`: $0.1339 per request. Too expensive per call.

---

## 1. Anthropic Claude: AI worldbuilding

**Endpoints**
- `anthropic/chat-completion`. Input: `messages[]` (required), `model` (default `claude-opus-5-5`), `max_tokens` (default 4096), `system`, `temperature` (0–1). **No output schema is published**, so make one `invoke` test call before parsing the response.
- The native chat pipeline (built into the copilot template; ADR-015): `POST /api/ai/chat` streams through `streamDeepSpaceAgent`, persists to `ai-chats` / `ai-messages`, and supports tool use. Models come from `listDeepSpaceAgentModels('application')`; never hard-code the list.

**What it does for Mythos**
1. **Lore Assistant** (chat panel docked in a universe). Users can ask "what do we know about House Varn?" or "is there a contradiction between these two timelines?". The assistant reads articles with the **built-in `records.query`/`records.get` tools, which run under the caller's RBAC**, so it can only see universes the caller belongs to. Custom tools in `src/ai/tools.ts`:
   - `universe_articles(universeId, query?)`: scoped retrieval of titles and summaries.
   - `wikipedia_lookup(query)`: research from inside chat (integration #3).
   - The MVP trims the built-in write tools (`ALLOWED_TOOL_NAMES` limited to reads). The assistant then *suggests* text, and the user applies it, which keeps it inside the editorIds write model.
2. **Expand article** (server action `aiExpandArticle`). Input: the article's title, type, summary, and N linked article summaries as context. Output: draft prose that the user inserts into the editor.
3. **Suggest relationships** (server action `aiSuggestLinks`). Input: this article plus the universe's article index. Output: JSON `[{ targetArticleId, type, rationale }]`, validated server-side against real article ids. The user accepts each suggestion with one click, which creates an `article_links` row through `createLink`.

**Authentication and consent:** no OAuth. The user only needs to be signed in to Mythos.

**Billing / cost**
- Per actual token cost; free-tier pricing differs.
- The chat scaffold bills **the caller** (passes their JWT), so users without DeepSpace credits get credit errors.
- The one-shot actions bill per `src/integrations.ts`.
- **Decision needed** (see ARCHITECTURE.md §9): owner pays with caps, or users pay.
- Recommendation: owner pays for the demo period, use `claude-sonnet-5-5` / `claude-haiku-5-5` for one-shot actions, and keep a per-user daily cap.

**Complexity:** low for the chat panel (a scaffold feature). Medium for the custom tools and structured-output validation.

**Why it matters:** it turns a passive wiki into a co-author that knows the canon.

---

## 2. Gemini image generation: visual worldbuilding

**Endpoint:** `gemini/generate-image`
- Input: `prompt` (required), `model` (`gemini-2.5-flash-image` default | `gemini-3.1-flash-image-preview` | `gemini-3-pro-image-preview`), `aspectRatio` (e.g. `"3:4"`, `"16:9"`), `imageSize`, `temperature`, `maxOutputTokens`.
- Output: `{ base64Images: string[], text?, usage{inputTokens,outputTokens,totalTokens}, model }`.

**What it does for Mythos**
- A "Generate cover art" button on an article (character portrait 3:4, location or landscape 16:9, artifact 1:1).
- The prompt combines the article's title, type, and summary with the universe's **art style** (a field on `universes`, the storynest "character sheet" pattern) and the docs' required suffix: `no text, no words, no letters, no writing, no logos`.
- The server action decodes the base64 and stores it through `appFiles(env, { scope: 'app' })` under `universes/<universeId>/<random>.png`. The key goes on `articles.coverImageKey`. Images are never regenerated on view.

**Authentication and consent:** no OAuth.

**Billing / cost:**
- Per token: $0.00012 per token on the free tier, $0.000039 per token on paid. The cost per image depends on output tokens. **[verify]** with one `invoke` before setting caps.
- Each image also uses R2 allocation, with a **128 MiB cap on the free plan**. At roughly 1–2 MB per PNG, that is about 60–120 images in total. Compressing to WebP or JPEG client-side isn't possible, because generation happens server-side. **Owner plan and quota are an approval item.**
- **Fallback:** `openai/generate-image` (`images[]` output, `gpt-image-1-mini` standard pricing).

**Complexity:** low to medium. The storynest example shows the exact call shape.

**Why it matters:** wikis such as World Anvil are text-heavy. Instant on-style visuals make a universe feel alive and help demos land.

---

## 3. Wikipedia: research and inspiration

**Endpoints**
- `wikipedia/search-pages`. Input: `query` (or `q`), `limit` 1–50 (default 10). Output: an array of `{ title, key, excerpt, description, id, thumbnail }`.
- `wikipedia/get-page-summary`. Input: `title`. Output: `{ title, description, extract, url, pageData }`.

**What it does for Mythos**
- A **Research panel** in the article editor: search "Norse cosmology" or "Byzantine court titles", read summaries, and insert a **reference** into the article.
- The reference is stored in an `article_references` row with url, title and excerpt (or in a `references` JSON column), with attribution.
- It also serves as an AI tool so the Lore Assistant can ground suggestions in real history and mythology.

**Authentication and consent:** none.

**Billing / cost:** $0.0013 per request, the cheapest useful endpoint in the catalog, so it is safe to expose to every signed-in member with a generous cap.

**Licensing:** Wikipedia text is CC BY-SA. Show the source and link, and label inserted excerpts as quotations.

**Complexity:** low.

**Why it matters:** writers research constantly. Keeping research inside the universe (with saved references) beats tab-switching, and it is cheap.

**Upgrade path:** `exa/answer` gives cited answers from the open web (e.g. "how did medieval guild systems work?"). Use it for a premium "Ask the web" mode once costs are measured.

---

## Cross-cutting rules for all integrations

1. **Call integrations only from server actions** (`tools.integration`) or the AI chat route, never with `integration.post` straight from the browser. Reasons:
   - The action verifies the caller is a **member (or editor) of the universe** before it spends credits.
   - The action enforces the **per-user daily cap**, stored in a `usage` collection that is admin-only and written only by actions.
   - The action validates and normalizes input (prompt length limits, trimmed queries).
2. `src/integrations.ts` sets `anthropic`, `gemini` and `wikipedia` to `'developer'` (pending approval). `google` stays `'user'` as scaffolded.
3. Every integration-backed UI has four states: loading, error with an in-place retry, empty, and success. Use `useAsyncResource`. Disable the trigger while a request is in flight.
4. Render `error`, branch on `code` (`insufficient_credits` gets a friendly message), and never reload the page on failure.
5. Tests: mock the integration boundary with `page.route` in Playwright, plus one real `invoke` per endpoint by hand. Never flip billing modes to make a test pass.

## Proposed caps (initial; tune after measuring)

| Kind | Per user per day | Rationale |
|---|---|---|
| `ai_text` (expand / suggest) | 30 | Mid-size Claude model; a few cents each |
| `ai_chat` turns | 50 | Bounded by the scaffold's 20 tool calls per turn |
| `image` | 5 | Highest unit cost, and consumes R2 quota |
| `research` (Wikipedia) | 200 | $0.0013 each |

---

## Verified responses (live `integrations invoke`, 2026-11-20, CLI 0.44.2)

All calls are wrapped as `{ ok, success, data }`. `tools.integration` returns the body under `data`.

| Endpoint | Request used | Verified `data` shape | Observed cost |
|---|---|---|---|
| `wikipedia/search-pages` | `{ query: "Norse cosmology", limit: 3 }` | Array of `{ title, key, excerpt, description, id, thumbnail \| null }`. The excerpt is plain text, about 150 characters, cut mid-sentence | $0.0013 (catalog) |
| `wikipedia/get-page-summary` | `{ title: "Yggdrasil" }` | `{ title, description, extract, url, pageData }`. `pageData` is the large raw REST payload; **drop it** before storing or returning | $0.0013 (catalog) |
| `anthropic/chat-completion` | `claude-haiku-5-5`, `max_tokens: 200`, `system` + 1 user message | The Anthropic Messages shape: `{ model, id, role, content: [{ type: 'text', text }], stop_reason, usage{…}, costUsd }`. The JSON-only prompt returned valid JSON as `content[0].text`; parse it with Zod and tolerate code fences | **$0.000067** (`costUsd`, 216 tokens) |
| `gemini/generate-image` | `gemini-2.5-flash-image`, `aspectRatio: "1:1"` | `{ base64Images: ["data:image/png;base64,…"], text, usage{ inputTokens: 31, outputTokens: 1297 }, model }`. Each entry is a **data URI**; strip the prefix before decoding | ≈ 1,297 output tokens, about **$0.16 on the free tier** (≈ $0.05 paid) per image |

**Effects on the design:**
- Image size: a 1024×1024 PNG is about **1.68 MB**. The 128 MiB free-plan R2 allocation holds roughly **75 images**. Keep the cap at 5 images per user per day and show remaining storage to the owner. If space becomes tight, consider a paid plan; transcoding in the Worker would need a Wasm codec, which is a new dependency and not planned.
- Claude Haiku is very cheap for one-shot actions, so `ai_text` caps can be generous. The chat default model (`claude-opus-5-5`) costs much more per turn; consider defaulting the dock to Sonnet.
- Gemini returns a short `text` alongside the image ("Here's your image: "). Ignore it.

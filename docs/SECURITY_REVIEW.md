# Mythos security review

**Date:** 2026-11-20 · **Scope:** the whole app at commit `a25dc3d` plus the fixes in this review · **Method:** code review, the permission unit tests, end-to-end probes against the local worker, and unauthenticated probes against production (https://mythos.app.space).

Severity: **Critical** (anyone can take or destroy other people's data), **High** (a signed-in user can affect universes they are not in), **Medium**, **Low**.

## Summary

| # | Finding | Severity | Status |
|---|---|---|---|
| S-1 | Any signed-in user could list, overwrite and delete every cover image, and upload any file of any size | **High** | **Fixed** locally (ADR-022); **not yet deployed** |
| S-2 | Every signed-in user sees the names of every Mythos user | Medium | Open (KNOWN_ISSUES K-1) |
| S-3 | Cover images are public by URL and outlive their universe | Medium | Open (K-2) |
| S-4 | No rate limits on server actions; no cap on articles per universe | Medium | Open (K-3) |
| S-5 | Content-Security-Policy has no `script-src` | Low | Open (K-4) |
| S-6 | Invalid input is reported before access is checked | Low | Accepted |

No critical findings. Nothing in the content, membership or invitation model let an outsider read or change a universe.

## S-1 File store (High, fixed)

**Found by** `tests/mythos-files.spec.ts` (first written as a probe). As Dave, a signed-in user with no role in Alice's universe, against the local worker:

| Request | Before | After |
|---|---|---|
| List all app files (`GET /api/files?scope=app`) | 200, every key in the app | 403 |
| Overwrite Alice's cover | 200 | 403 (outsider), 409 (owner re-using a key) |
| Delete Alice's cover | 200, file gone | 403 for everyone |
| Upload `junk/<uuid>.txt` as `text/plain` | 200 | 400 |
| Upload 6 MB under a `.png` key | 200 | 413 |
| Upload non-image bytes as `image/png` | 200 | 415 |
| Upload a PNG under a `.gif` key | 200 | 415 |
| Upload a cover for a universe he does not edit | 200 | 403 |
| Attach another universe's cover key with `updateUniverse` | accepted | "belongs to another universe" |

**Cause:** the worker forwarded `/api/files/*` unchanged to the platform gateway. App-scope files are writable by any signed-in user, and type and size were checked only in the browser.

**Fix:** see ADR-022 and `src/server/mythos/uploads.ts`.
- Reads of one file still pass, so covers render.
- Every other operation is refused except a cover upload. A cover upload must:
  - use a `covers/<universeId>/<uuid>.<ext>` key that does not exist yet;
  - come from an owner or editor of that universe;
  - be 5 MB or less;
  - carry PNG, JPEG, WebP or GIF bytes (checked by signature) matching the key's extension;
  - stay within 40 uploads per user per day.
- The save actions refuse a cover key that belongs to another universe.

**Verified by:** `tests/mythos-files.spec.ts` (every row above), 10 unit tests in `src/server/mythos/uploads.test.ts`, and the cover upload through the UI in `tests/mythos-journey.spec.ts`.

**Production is still exposed until the fix is deployed.**

## Checklist

| Area | Result | Evidence |
|---|---|---|
| Authentication enforcement | **Pass.** Every action, the AI chat, integration status and file writes require a verified JWT. A forged unsigned token is refused. The debug routes return 404 in production. | Production probes: `createUniverse`, `seedExampleUniverse`, `/api/ai/chat` → 401; forged `alg:none` token → 401; `/api/debug/*` → 404. `tests/api.spec.ts` |
| Database permissions (RBAC, the DeepSpace equivalent of RLS) | **Pass.** All Mythos collections are `create: false` for clients. Reads are `team`-scoped, and article writes go to `collaborator` (editor ids) with two `writableFields` only. `invitations` and `usage` have no client access, and `users` reads are own-row. | `src/schemas/mythos-schemas.test.ts` (permission matrix for owner, editor, viewer and outsider) |
| Unauthorized article access | **Pass.** A viewer cannot save, publish or create; the edit page shows "Read the article instead". | `tests/mythos-qa-journey.spec.ts`, `mythos-membership.spec.ts`, `mythos-roles.spec.ts` |
| Cross-universe data access | **Pass for content.** Ids from another universe answer "not found", and links, categories and tags cannot cross universes. Covers were a gap (S-1, fixed). User names are visible app-wide (S-2). | `mythos-backend.spec.ts` "manipulated ids cannot cross universes", `mythos-relationships.spec.ts` |
| Membership authorization | **Pass.** Only owners invite, change roles, remove members and edit settings. Only the invitee can answer an invitation; removal revokes access immediately. | `mythos-membership.spec.ts` |
| Input validation | **Pass.** Every action parses its input with Zod (`src/server/mythos/validation.ts`), including length limits, enum checks, id patterns and rich-text depth, node and size caps. The AI chat route checks its own input. | `backend-logic.test.ts`, `activity.test.ts` |
| File upload validation | **Fail, then fixed** (S-1) | above |
| Secret exposure | **Pass.** No secrets in tracked files (pattern scan for keys, JWTs and private keys). `.dev.vars` is git-ignored. The built client bundle contains no `APP_OWNER_JWT`, `APP_IDENTITY_TOKEN` or JWT strings. The AI chat bills the caller's own token. | `git grep` scan; `grep -r dist/client` |
| Unsafe rendering of user content | **Pass.** No `dangerouslySetInnerHTML` or raw HTML. Article bodies render through TipTap's schema, whose Link mark drops `javascript:` and other disallowed URLs in `renderHTML` (so a forged Yjs update cannot inject one); the editor also accepts only http, https and mailto links. Chat markdown uses `react-markdown` without raw HTML. Uploaded files are served with their stored type and `nosniff`, and HTML, SVG and JS uploads are refused. | `RichTextEditor.tsx`, `@tiptap/extension-link` source |
| Security headers | Pass, with S-5. `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy`, `object-src 'none'`. | `curl -I https://mythos.app.space/universes` |

## Open findings

**S-2 User directory (Medium).** DeepSpace's roster gives every signed-in user the public identity (name, avatar, last seen) of every registered Mythos user, not only people in their universes. No emails, content or memberships leak. Fixing it means `roster: 'read-policy'` plus a server action that returns names of co-members, and moving the screens that show names onto it.

**S-3 Covers are public by URL (Medium).** App-scope files can be fetched without signing in by anyone holding the URL. Keys are random UUIDs and can no longer be listed (S-1). A removed member who kept a URL can still open that image, and covers are not deleted with their article or universe.

**S-4 No rate limits (Medium).** A member can call actions as fast as they like, and an editor can create unlimited articles, categories and links in a universe they belong to. Universes per owner (25), pending invitations (50), revisions (50 per article) and cover uploads (40 a day) are capped.

**S-5 CSP (Low).** The policy does not restrict `script-src`, so it adds no protection if an XSS bug is introduced later. No XSS vector was found.

**S-6 Validation before authorization (Low, accepted).** A non-member sending malformed input gets the validation error before "not found". This reveals nothing about the universe.

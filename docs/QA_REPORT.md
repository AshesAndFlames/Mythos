# Mythos QA report: production readiness

**Date:** 2026-11-20 · **Build:** `a25dc3d` plus this review's fixes · **Environment:** local `deepspace dev` worker, real RecordRoom, Chromium via Playwright, test accounts Alice, Bob, Carol and Dave. Production (https://mythos.app.space) was probed for authentication and headers only.

**Verdict:** ready to release once this change is deployed. One high-severity security problem (S-1, cover files) and one high-priority UX defect (Q-1, accidental unpublishing) were found, and both are fixed and tested here. The remaining issues are medium or low and listed in KNOWN_ISSUES.md.

"Verified" below means an automated test drove it and asserted the result. Nothing is claimed from reading code alone unless marked **(code review)**.

## 1. Functional journey

Driven through the UI in `tests/mythos-qa-journey.spec.ts`. Alice is the owner, Bob accepts as editor, Carol accepts as viewer.

| Step | Result | How it was verified |
|---|---|---|
| Register an account | **Not exercised.** Sign-up is DeepSpace's hosted flow, and tests use pre-registered accounts (K-9). | Signed-out visitors get the sign-in prompt on app pages (`smoke.spec.ts`) |
| Log in | Pass | Each test signs in its accounts; `collab.spec.ts` checks every browser shows its own account |
| Create a universe | Pass | Dashboard dialog → overview shows the name |
| Edit universe details | Pass | Settings: name, tagline and description saved; the overview shows the new values |
| Create a character article | Pass | "Kael Ashborne", type character |
| Create a location article | Pass | "Emberfall", type location |
| Connect the character to the location | Pass | "lives in" from Kael. Emberfall shows "home of Kael" (both directions) |
| Edit an article | Pass | Summary and rich-text body edited and saved |
| Publish an article | Pass | Published; the view shows summary, body and a "Published" badge. Unpublishing and republishing also pass |
| Invite another user | Pass | Members page: Bob as editor, Carol as viewer; both pending |
| Accept an invitation | Pass | Bob and Carol accept on their dashboards and land in the universe; 3 members, 0 pending |
| Role-based permissions | Pass | Bob (editor) saves the article; the server refuses his invite and settings changes. Carol (viewer) sees no Edit button, is turned away from the edit URL and the owner-only pages, and the server refuses her save and create |

Already covered by other specs and re-run green:
- invitations: update, revoke, decline, and only the invitee can answer (`mythos-membership.spec.ts`);
- the full owner, editor, viewer and outsider matrix, the activity feed, and immediate loss of access on removal (`mythos-membership.spec.ts`, `mythos-roles.spec.ts`);
- cross-universe id tampering and delete cascades (`mythos-backend.spec.ts`);
- relationship integrity: no loops or duplicates (`mythos-relationships.spec.ts`);
- library search and filters, cover upload, and article and universe deletion with confirmation (`mythos-journey.spec.ts`).

## 2. Security

Full detail is in SECURITY_REVIEW.md.

| Check | Result |
|---|---|
| Authentication enforcement | Pass, including production probes (401 without a token or with a forged one) |
| Database permissions (RBAC/RLS) | Pass: permission-matrix unit tests |
| Unauthorized article access | Pass |
| Cross-universe data access | Pass for content. **Fixed** for covers (S-1). User names visible app-wide (K-1) |
| Membership authorization | Pass |
| Input validation | Pass: Zod on every action |
| File upload validation | **Failed. Fixed** (S-1, ADR-022) |
| Secret exposure | Pass: no secrets in the repo or the client bundle |
| Unsafe rendering of user content | Pass: no raw HTML, link URLs sanitized, uploads served with `nosniff` |

## 3. Code quality

| Check | Result |
|---|---|
| TypeScript errors | None (`tsc --noEmit`, strict) |
| Lint errors | None (`eslint .`) |
| Broken imports | None: build succeeds; typecheck covers every import |
| Duplicate components | None found. Shared UI comes from `src/components/ui`; Mythos pieces (cards, badges, dialogs, skeletons, status views) are each defined once and reused |
| Unnecessary dependencies | None. Every runtime dependency is imported, or is a required peer of one that is (TipTap's core, pm and y-tiptap packages and y-protocols for the editor; highlight.js for `rehype-highlight`) |
| Component boundaries | Good. Authorization and business rules live in `src/server/mythos` and `src/actions`; pages read through feature hooks (`src/features/universes/hooks.ts`) and write only through `callAction` |
| Data fetching consistency | Consistent: live reads via `useQuery` hooks, all writes via server actions. Invitations load through actions because no client may read them (by design, K-6) |
| Error handling | Every action returns user-facing errors. Unexpected failures are logged with the action name and caller and never swallowed (no empty `catch` in app code). Activity-log failures are logged without failing the user's change (ADR-021) |
| Loading states | Every universe page has skeletons; the dashboard, library, members, activity, article and editor pages have loading, error and empty states **(code review, plus screenshots)** |

## 4. UX

| Check | Result |
|---|---|
| Mobile responsiveness | Pass at 390×844 on the dashboard, overview, library, article, editor, members and activity pages: no sideways page scroll (measured). The editor's details panel stacks under the body and can be reached by scrolling, and the tab strip scrolls to Members (asserted). Screenshots in `test-results/qa-mobile-*.png`. The tab strip has no "more" cue (K-13) |
| Empty states | Present for no universes, no articles, an empty library or filter, no connections, no activity and no invitations **(code review)** |
| Loading skeletons | Present **(code review, screenshots)** |
| Form validation | Required fields and length limits in the forms. Server errors appear inline and as toasts (for example an invalid email on invite, a duplicate category, a link that would create a loop) |
| Navigation consistency | The universe layout gives every member Overview, Library, Activity and Members, plus Settings for the owner. Back links on the editor, a 404 page for unknown routes, and "Universe not found" for outsiders |
| Accessibility | Every visible button, link and form control on the seven main pages has an accessible name (automated audit). **Fixed:** the assistant's message box had only a placeholder; it now has a label. Icon buttons carry `aria-label`; status text uses `aria-live` |
| Error messages | Plain-language and specific (for example "Only the universe owner can do that", "That email was just invited. Refresh to see it.") |
| Destructive action confirmations | Pass: deleting an article, deleting a category, removing a connection, removing a member, leaving a universe and revoking an invitation all confirm first; deleting a universe requires typing its name |

## 5. Problems fixed in this review

| # | Problem | Priority | Fix | Test |
|---|---|---|---|---|
| S-1 | Any signed-in user could list, overwrite and delete all cover images, and upload any file type or size | High | The worker allows only validated cover uploads by the universe's owners and editors, with a daily cap; listing and deleting are refused (ADR-022) | `tests/mythos-files.spec.ts`, `src/server/mythos/uploads.test.ts` |
| Q-1 | On a published article, "Save draft" silently unpublished it ("Draft saved" toast). Found when the editor's save unpublished the owner's article | High | A published article shows "Save changes" (stays published, stays on the page) and an explicit "Unpublish" | `tests/mythos-qa-journey.spec.ts` |
| Q-2 | The assistant's message box had no accessible name | Low | Added `aria-label` | QA journey accessibility audit |

## 6. Test and build results (final run)

| Check | Result |
|---|---|
| `tsc --noEmit` | Pass |
| `eslint .` | Pass |
| Unit tests (`vitest run`) | 146 passed (10 files) |
| Production build (`vite build`) | Pass (chunk-size warning, K-11) |
| End-to-end (`deepspace test run all`) | 19 passed |

New tests: `tests/mythos-qa-journey.spec.ts`, `tests/mythos-files.spec.ts` and `src/server/mythos/uploads.test.ts`.

# Known issues

**As of:** 2026-11-24 (release #8). First written 2026-11-20, after the production readiness review. Each entry has a severity, the impact on users, and the suggested fix. Security items are detailed in SECURITY_REVIEW.md.

## Before release

| # | Issue | Severity |
|---|---|---|
| K-0 | ~~The cover-upload fix (S-1, ADR-022) is not deployed.~~ **Resolved:** deployed with release #7 (2026-11-21) and in every release since. | Resolved |

## Security and privacy

| # | Issue | Severity | Suggested fix |
|---|---|---|---|
| K-1 | Every signed-in user can see every Mythos user's name, avatar and last-seen time (the SDK roster), not just people who share a universe with them. | Medium | `roster: 'read-policy'` on `users`, plus a server action that returns names of co-members, used by the member list, activity feed, revisions and editor cursors. |
| K-2 | Cover images and gallery maps/images are public to anyone holding the URL. Covers are not deleted with their article or universe (gallery files are, ADR-025). | Medium | Delete cover files from `deleteArticle` and `deleteUniverse` (server-side DELETE through the platform gateway). Moving to private files would need an authenticated image route. |
| K-3 | No rate limiting on server actions; no cap on articles, categories or links per universe. | Medium | Per-user action budget in `usage`, plus caps per universe (for example 5,000 articles). |
| K-4 | The Content-Security-Policy does not set `script-src`. | Low | Add `script-src 'self'` (and the hashes the prerendered page needs) in `public/_headers`, then test the AI chat and editor. |

## Functional gaps

| # | Issue | Severity |
|---|---|---|
| K-5 | ~~No invitation email is sent.~~ **Resolved (ADR-023):** `inviteMember` emails the invitee, capped at 20 a day per inviter. If the cap is reached or sending fails, the owner is told to let the person know. | Resolved |
| K-6 | The dashboard's invitation list loads once. A new invitation shows only after a reload (invitations are deliberately not live-synced; ADR-021). | Low |
| K-7 | The activity feed does not record live body edits (until someone saves), summary/type changes made directly (for example by the assistant), role changes, removals or deletions. It shows the latest 100 entries per universe, with no paging or pruning. | Low |
| K-8 | Editors can delete articles. The brief's editor role does not mention deletion; confirm whether it should be owner-only. | Low (product decision) |
| K-9 | Registration and sign-in are DeepSpace's hosted flow. The QA run used pre-registered test accounts, so creating a brand-new account was not exercised end to end. Signed-out visitors are verified to get the sign-in prompt. | Info |
| K-10 | Nothing stops a user starting several cover uploads (or invitations) at once and going slightly over the daily caps (40 uploads, 20 invitation emails), because the count is read and then written. | Low |
| K-15 | Anyone signed in can join a public universe as a viewer, and viewers see drafts, activity and the member list. There is no ban list: a removed member can rejoin while it is public (ADR-024). | Medium (product decision) |

## Code and UX

| # | Issue | Severity |
|---|---|---|
| K-11 | Two JavaScript chunks are over 500 kB minified (the main bundle and the rich-text editor); the editor is already split into its own chunk. First load on slow mobile networks is heavier than it needs to be. | Low |
| K-12 | `/api-status` is a page left over from the starter template, kept because `tests/collab.spec.ts` uses it. It is not linked from the app. | Low |
| K-13 | On phones the universe tabs (Overview, Library, Activity, Members, Settings) scroll sideways inside their strip with no visual cue that more tabs exist. Verified to be reachable. | Low |
| K-14 | Local development data contains universes left over from interrupted test runs (for example "Dave's world …"). Local only; tests no longer depend on test accounts starting empty. | Info |

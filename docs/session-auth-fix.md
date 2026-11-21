# Netlify session authorization fix

Target: https://prepaiddealersportal.netlify.app and Supabase
`niabpabsvdgxackjjcsb`. Verification date: 2026-11-21.

## Diagnosis

A fresh production dealer login returned HTTP 200 and issued authenticated
profile, role, organization and catalog reads with the returned user's JWT.
The previously reported invalid production key was already resolved before
this investigation; no environment key or Auth setting was changed here.

The reported organization failure was reproduced by removing the isolated test
browser's stored session between its successful role response and organization
query. The existing code awaited initial session readiness, but did not recheck
it before subsequent reads. Supabase JS then used its publishable-key fallback
in the Authorization header: the organization request ran as `anon` and returned
HTTP 401 / `42501`, `permission denied for table dealers`. The server's suggested
anonymous grant is inappropriate and was not applied. This controlled race
reproduces the failure; the user's original browser event was not observed.

## Focused fix

The existing single Supabase client remains responsible for persistence and
refresh. A small shared helper awaits its current session, checks the expected
user where applicable, and provides a per-request JWT for profile, role,
organization, product and order-history reads. Organization access rechecks the
session after the earlier identity reads. Missing or changed identity produces
a clear login-again message before sending the protected request. No global
Authorization header or cached token is introduced.

Existing guards, database-derived roles and the already session-bound order RPC
remain intact. No migrations, grants, RLS, Auth settings, Netlify keys or business
records are changed.

## Verification

- Four focused unit tests pass: session initialization wait, refreshed tokens,
  missing/changed identity and SDK refresh-error propagation.
- Three local production-preview browser tests pass with existing synthetic
  accounts: two dealers' JWTs, catalog/history/details, refresh, switching and
  logout; the reproduced session-loss race and login recovery; permanent admin
  routing, refresh, dealer-page exclusion and logout. Protected reads carry
  `authenticated` JWTs for the expected user. No anonymous organization request
  is sent after session loss; no uncaught or console errors occurred.
- The existing 15 draft/submission/history unit tests and production build pass.
- Production-preview checks pass all eight HTML pages and 22 linked routes/assets.
- All ten existing catalog, submission and history browser regressions pass,
  including mobile layouts, inactive/role guards and safe existing-request
  replays. Six orders/eleven items remain unchanged; no new order was created.
- Read-only comparison confirms existing records, products, functions, grants,
  RLS and all five migration records are unchanged. One concurrent public
  registration appeared during testing and was preserved. Anonymous SELECT on
  `dealers` remains prohibited and its RLS remains enabled.
- Fix commit `6100359` was pushed to GitHub `main`. Netlify automatically served
  the new session code by `2026-11-21T10:42:08Z`; the deployed public-key fingerprint
  is unchanged.
- All three focused browser tests also pass against Netlify with real public
  Auth logins. Both dealers load their own organization, ten active products,
  history and UUID details after refresh and account switching. Admin login,
  refresh, dealer-page exclusion and logout pass. Every observed protected read
  uses an `authenticated` JWT for the expected user; no console/uncaught errors
  occurred. The injected session loss produces the local login-again message,
  sends no anonymous organization request, and recovers after login.
- Live HTTP checks pass all eight routes, sixteen assets, HTTPS, unknown-route
  404 and seventeen private/source-path denials. No privileged credential or
  known fixture password was found in the inspected assets; tested source maps
  are unavailable. The final read-only data/security comparison also passes.

The original user's precise browser event remains unknown; the race is verified
with controlled browser-only session loss. No new registration/order was made
by these checks. Live submission replay was not repeated for this fix; existing
request replays passed against the production preview with the same hosted RPC.
Confirmation-enabled email delivery and natural long-duration token expiry were
not tested. No broader production milestone is claimed.

Browser test artifacts and credentials stay in ignored local verification files.

## Recurring failure: stale identity checks

The initial checks above did not cover a rejected identity read still in flight
across another tab's logout and new login. The deployed version was reconfirmed
before editing. A controlled delayed HTTP 401 for Dealer A, released after a real
Dealer B login, caused a logout request using **B's JWT**, removed B's session
and returned B to Login. UI generation checks discarded old rendering results
but did not prevent `loadAccount()`'s unconditional sign-out side effect. The
installed SDK's `getUser()` also removes session storage for `session_not_found`.

Account checks now verify the same JWT against the same Supabase Auth `/user`
endpoint without mutating session state. Server verification, current-session
owner checks, database-derived roles and RLS remain mandatory. Only explicit
logout uses the SDK sign-out operation. The order service reuses this identity
check while keeping its owner check, pinned JWT, payload and retry behavior.
Deferred Auth callbacks reread current
session state; a stale broadcast cannot clear a newer user's draft. Background
checks no longer delete per-user drafts. Explicit logout keeps its existing
cleanup and unresolved-request preservation. Rejected stored sessions keep the
Login form usable for reauthentication, with protected content hidden.

Read-only inspection before tests found eight existing Auth accounts, each with
one profile, organization and role, including the recent registrations. No
existing account was registered again. A separate opt-in test uses one unique
controlled public-signup fixture per environment and checks for an existing
account before any rerun. It verifies redirect, isolated dealer provisioning,
refresh, role guard, logout and login. No Admin API or new order is used.

All seven focused production-preview browser tests pass, including both delayed
identity error variants, stale broadcast/draft preservation, rejected-session
reauthentication, real public Register, multi-page Login/refresh/logout/account
switching and admin guards. The registration fixture is reused on reruns.
All ten existing catalog/history/submission browser regressions, nineteen unit
tests and the production build pass. Order submission regressions replayed
existing requests; no extra orders were created. Read-only comparison confirms
the eight pre-existing accounts, six orders/eleven items, twelve products, five
migrations, functions, grants and RLS are unchanged. The sole added account is
the controlled preview signup fixture. The initial reauthentication test had a
test navigation error; correcting it to submit the already-open Login form
passed individually and in the complete seven-test run.

Fix commit `0538d19` was automatically published from `main`; its non-mutating
identity code was observed live at `2026-11-21T11:07:39Z`. The deployed public-key
fingerprint is unchanged. All seven focused browser tests pass on Netlify,
including a real public Register request and both stale-response variants. The
newer login survives delayed old errors and a queued sign-out broadcast; both
owner-scoped drafts and the exact pending request remain intact. Real dealer
and admin routing, redirects, refresh, logout, switching and login recovery pass.
Normal registration/login flows have no uncaught/console errors; injected 401s
are expected only in the controlled rejection tests.

The final read-only comparison preserves all eight pre-existing accounts and
all business/security data. Exactly two unique controlled registration fixtures
were added through public Register, one per environment, each with one active
profile, isolated organization and dealer role. No duplicate registrations or
new orders were created. Live HTTP checks again pass eight routes, sixteen
assets and seventeen private/source-path denials, with no privileged credential
patterns or known original fixture passwords found in inspected assets.

Refresh or close every older portal tab once after deployment, so no tab keeps
running the previous JavaScript. Do not clear site data: drafts and pending
requests stay in their existing per-user storage. No database, Auth-setting,
Netlify key, migration or unrelated feature changes are included. The original
user's exact tab/network sequence remains unobserved; the stale-response cause
was reproduced with controlled timing on Netlify. Natural long-duration token
expiry and confirmation-enabled delivery remain untested.

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

- All ten existing catalog, submission and history browser regressions pass,
  including mobile layouts, inactive/role guards and safe existing-request
  replays. Six orders/eleven items remain unchanged; no new order was created.
- Read-only comparison confirms existing records, products, functions, grants,
  RLS and all five migration records are unchanged. One concurrent public
  registration appeared during testing and was preserved. Anonymous SELECT on
  `dealers` remains prohibited and its RLS remains enabled.

Deployed Netlify verification is pending publication of this locally verified fix.
Browser test artifacts and credentials stay in ignored local verification files.

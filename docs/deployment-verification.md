> Historical deployment record. Counts and deferred-feature notes below describe their recorded milestone. See [the final release review](release-review.md) for the completed eleven-route release. This report is documentation, not a public runtime asset.

# Production deployment verification

Site: https://prepaiddealersportal.netlify.app

Initial source reviewed: GitHub `dyovkova/Prepaid-Dealer-Portal`, branch `main`, revision
`c642f16f56b3a18aaac133a9e9e0bf172e448de1`. Date: 2026-11-21.

Status: the recurring failure's stale identity-check cause is reproduced and
fixed. All seven focused tests pass on Netlify and production preview. Earlier
observations below retain their original scope.

## Initial confirmed results

- All eight live HTML routes return their own expected pages: `/`, `/login/`,
  `/register/`, `/catalog/`, `/new-order/`, `/my-orders/`, `/order-details/`, `/admin/`.
- Sixteen referenced assets/dependencies loaded with expected types. HTTPS
  redirection and unknown-route HTTP 404 passed.
- Seventeen targeted private/source paths returned 404, including `.env` variants,
  `.mcp.json`, `.git`, `.codex`, local `.verification` fixture files, package/source
  files and migration SQL. Tested bundle source maps were unavailable.
- Inspected assets contain the intended Supabase project URL and a publishable
  key. No secret-key/private-key/database-password pattern, service-role JWT or
  known fixture password was found in those assets. Public keys are not secrets.
- Local production build and all 15 draft/submission/history unit tests passed.
  A focused browser test passed public pages, refresh, anonymous guards and
  mobile forms locally and on the live site after the fix below. No uncaught
  JavaScript or console errors occurred in that passing live test. Initial
  authenticated attempts produced HTTP 401 resource errors from the invalid key.
- Exact before/after database/security snapshots match: six orders/eleven items,
  twelve products, existing accounts/roles, functions/grants/RLS and five migration
  records. No orders were created; no submission replay was attempted because
  login was blocked. No migrations, Auth settings or business logic changed.

## Confirmed deployment issues

1. The initial deployment rejected its publishable key with HTTP 401 `Invalid API key`.
   At the subsequent session investigation, the deployed key was already accepted
   and real login succeeded. This task did not change any Netlify key or Auth
   setting. The project URL remains correct; only public configuration is bundled.
2. Home-page horizontal overflow measured 12 pixels at 320/390 pixels. Its hero
   used a Bootstrap gutter wider than the mobile container. The source now uses
   the normal mobile horizontal gutter and retains the larger gutter from the
   small breakpoint upward. Fix commit `c2f697d` is live, and the 320/390-pixel
   production browser check passes.

## Initial deferred checks

The initial review deferred real dealer/admin login, catalog, submission replay, history,
details and authenticated mobile/refresh checks until the valid
production key was published. Initial login attempts failed at the API-key gate;
they do not establish a password or application-business-logic failure.
The prepared replay uses an existing verified owner/request UUID and exact
payload, blocking unrelated data writes so no extra order is needed.

## Observed automatic publication from main

This document returned 404 before the verification commit. After only pushing
`c2f697db14e2ac89d535f72ef9aee89cc2d2aa86` to GitHub `main`, it returned 200
with the marker below, and the live home HTML contained the corrected mobile
gutter. Observed at `2026-11-21T09:42:40.750Z`. No manual deployment/upload or
Netlify API build trigger was used. Main-branch automatic publication is observed.

GitHub reports `main` as the default branch; its public commit statuses/checks
and deployments list contain no Netlify records. Dashboard settings could not
be inspected because both browser-control runtimes failed to start, and no
Netlify management authentication was available. The publication observation,
rather than an assumption about dashboard settings, is the verification evidence.

Public verification marker: `deployment-review-20261121-c642f16`.

This document intentionally contains no account addresses, passwords, tokens,
secret environment values or local verification records. Authenticated checks
are now covered by the focused session investigation. This is not completion of
another milestone.

## Session investigation

Fresh live login and catalog reads now succeed with the authenticated user's
JWT. Controlled loss of browser session storage between role and organization
reads reproduced the reported HTTP 401 / `42501`: the SDK sent its publishable
key as the Authorization fallback and the request ran as `anon`.

The frontend fix explicitly supplies the current session JWT for protected
reads, rechecks identity before organization access, and fails locally with a
login-again message if the session disappears or changes. The same Supabase
client and role guards remain in use. No anonymous database grant, migration,
RLS, Auth setting or environment-key change is included.

Fix commit `6100359` was automatically published from GitHub `main`, with the new
bundle observed at `2026-11-21T10:42:08Z`. The public-key fingerprint is unchanged.
All three focused real-account browser tests pass on Netlify: two dealer logins,
own organization/catalog/history/details, refresh, account switching, logout,
admin routing/refresh and exclusion from dealer pages. Every protected read
observed by these tests carries the expected user's authenticated JWT. The
controlled session-loss case now sends no anonymous organization request and
recovers after login. No uncaught JavaScript or console errors were observed.

After publication, all eight routes, sixteen assets, seventeen private/source
path denials, HTTPS and unknown-route 404 pass again. Inspected assets contain
no privileged credentials or known fixture passwords. Local checks pass nineteen
unit tests, thirteen real-account browser tests, all eight preview pages and the
production build. Existing-request submission replays ran on the production
preview with the hosted RPC; no live submission replay was repeated for this fix.

Read-only comparisons confirm existing records, twelve products, six orders and
eleven items, security definitions and five migration records are unchanged.
One concurrent public registration was observed and preserved; these tests did
not create accounts or orders. Unrelated local configuration changes are excluded
from commits. The original user's exact session-loss trigger and long-duration
token expiry remain unobserved; the reported failure was reproduced with a
controlled browser-only storage change. Email-confirmation delivery remains
outside this verification.

Session verification marker: `session-jwt-binding-20261121`.

## Recurring failure follow-up

The previous test did not hold an old identity rejection across a new login in
another tab. That case was reproduced on Netlify: after Dealer B logged in,
Dealer A's delayed 401 caused an unconditional sign-out using **B's JWT**.
UI generation checks prevented stale rendering but could not undo the logout.
Stale sign-out broadcasts could also clear the newer identity's local draft.

The follow-up keeps server verification through the same Supabase Auth `/user`
endpoint and current JWT/owner checks, while making identity reads non-mutating.
Deferred Auth events reread current session state and do not delete drafts.
Rejected stored sessions allow explicit reauthentication. One shared SDK client,
RLS and role guards remain. No migrations, grants, Auth settings or keys change.

All seven focused production-preview browser tests pass, including real Register,
both stale-error races, stale broadcasts, draft/request preservation, Login,
redirects, refresh, logout, switching and admin guards. Ten existing browser
regressions, nineteen unit tests and the production build pass. All eight
pre-existing accounts and business/security data remain unchanged.

Commit `0538d19` was automatically published from `main`, observed live at
`2026-11-21T11:07:39Z`, with unchanged public configuration. All seven focused
Netlify tests pass too, including real public Register, both delayed identity
errors, queued cross-tab sign-out, reauthentication, Login, redirects, refresh,
logout, switching and admin guards. The newer session survives stale failures;
drafts and the exact pending request are preserved. Normal auth flows produce
no uncaught/console errors; controlled 401 rejection tests intentionally inject
errors. Exactly two unique controlled signup fixtures were retained, one per
environment. All eight earlier accounts and existing orders/security remain
intact; no duplicate registrations or extra orders were created.

Live checks again pass eight routes, sixteen assets and seventeen private/source
path denials. Existing migrations, grants, RLS, Auth settings, keys and unrelated
configuration edits are preserved. The original user's exact event sequence
and natural long-duration expiry remain unobserved; the race uses controlled
response timing. Confirmation-enabled delivery remains untested.

Refresh or close all older portal tabs once to stop the previous JavaScript
from running. Do not clear site data; saved drafts and pending requests remain
in their existing per-user storage.

Follow-up marker: `nonmutating-identity-check-20261121`.

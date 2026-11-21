# Production deployment verification

Site: https://prepaiddealersportal.netlify.app

Source reviewed: GitHub `dyovkova/Prepaid-Dealer-Portal`, branch `main`, revision
`c642f16f56b3a18aaac133a9e9e0bf172e448de1`. Date: 2026-11-21.

Status: **partially verified; authenticated checks blocked by production configuration**.

## Confirmed results

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

1. Supabase rejects the deployed publishable key with HTTP 401 `Invalid API key`.
   The project URL is correct; the local ignored configuration's publishable key
   is accepted. Update Netlify's **Production build** variable
   `VITE_SUPABASE_PUBLISHABLE_KEY` from the correct project configuration and run
   a fresh build. Keep `VITE_SUPABASE_URL=https://niabpabsvdgxackjjcsb.supabase.co`.
   Do not use service-role/secret keys or change Auth settings.
2. Home-page horizontal overflow measured 12 pixels at 320/390 pixels. Its hero
   used a Bootstrap gutter wider than the mobile container. The source now uses
   the normal mobile horizontal gutter and retains the larger gutter from the
   small breakpoint upward. Fix commit `c2f697d` is live, and the 320/390-pixel
   production browser check passes.

## Pending live checks

Real dealer/admin login, catalog, saved-request submission replay, history,
details and authenticated mobile/refresh checks must be rerun after the valid
production key is published. Initial login attempts failed at the API-key gate;
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
remain pending a valid Production publishable key and fresh build. This is not
completion of another milestone.

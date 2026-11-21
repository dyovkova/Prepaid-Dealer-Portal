# Production deployment verification

Site: https://prepaiddealersportal.netlify.app

Source reviewed: GitHub `dyovkova/Prepaid-Dealer-Portal`, branch `main`, revision
`c642f16f56b3a18aaac133a9e9e0bf172e448de1`. Date: 2026-11-21.

Status: **in progress; production environment correction required**.

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
  mobile forms after the one-line responsive fix below.
- No database migrations, Auth settings or existing orders were changed.

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
   small breakpoint upward. The local 320/390-pixel browser check passes;
   production confirmation is pending publication.

## Pending live checks

Real dealer/admin login, catalog, saved-request submission replay, history,
details and authenticated mobile/refresh checks must be rerun after the valid
production key is published. Initial login attempts failed at the API-key gate;
they do not establish a password or application-business-logic failure.
The prepared replay uses an existing verified owner/request UUID and exact
payload, blocking unrelated data writes so no extra order is needed.

GitHub's default branch is `main`, but its public commit statuses/checks and
deployment list provide no Netlify proof. Dashboard automation could not start
in this session. Continuous deployment will be checked by fetching this newly
introduced public document after pushing to `main`; it returned 404 beforehand.
No manual deployment will be triggered by the verification agent.

Public verification marker: `deployment-review-20261121-c642f16`.

This document intentionally contains no account addresses, passwords, tokens,
secret environment values or local verification records. A later verification result
will replace the pending status; this is not completion of another milestone.

# Milestone 4B: working authentication UI

Implemented and verified against **PrepaidDealerPortal** (`niabpabsvdgxackjjcsb`).
The eight-page Vite application uses vanilla JavaScript, HTML and Bootstrap.
No database migration, Auth setting, product/order operation or Storage feature
was added. Existing business screens remain labelled placeholders.

## Configuration and modules

Install dependencies, copy `.env.example` to ignored `.env.local`, and supply
the project's public URL and `sb_publishable_...` key. Restart Vite after changing
them. The client rejects secret/service-role keys; examples contain placeholders.
Vite embeds public configuration in the browser build, so RLS remains the
authorization boundary. Hosted builds need the same public build variables.

- `src/services/supabase.js`: one reusable client with Supabase-managed persistence
  and token refresh. Missing configuration produces an actionable UI error.
- `src/services/auth.js`: signup, password login, local-session logout, validated
  Auth user lookup, and fresh RLS-protected profile/role/organization reads.
- `src/auth/page-auth.js`: role-based destinations, hidden-until-checked content,
  account status, retry, logout, cross-tab auth events and restored-page checks.
- `src/auth/form.js`, `validation.js`, `messages.js`: busy/error/success feedback,
  input validation and safe user-facing messages. Names render with `textContent`.

Signup submits only email/password and bounded business/display names. The
existing 4A trigger creates the isolated organization/profile/fixed dealer role.
Neither signup metadata nor locally cached role claims grant UI permissions.
Active users are routed using database roles: dealers to `/catalog/`, admins to
`/admin/`. Invalid/missing profile or role stops access with a setup message.
Inactive profiles/organizations receive explicit feedback and a recheck action.
Own identity diagnostics remain readable under the accepted 4A policy.

| Page | Access in 4B |
| --- | --- |
| Home | Public; navigation reflects the current account |
| Login, Register | Guests; active signed-in users go to their role's workspace |
| Catalog, New Order, My Orders | Active dealer |
| Order Details placeholder | Active dealer or admin; future order ownership still requires RLS |
| Admin Dashboard placeholder | Active admin |

Protected HTML content starts hidden. Network/account-check failures keep it
hidden and offer retry. Guards help navigation; they do not replace server RLS.
The frontend queries only Auth, profiles, user_roles and dealers in this milestone.

Logout uses Supabase's local scope, ending the current browser session and
notifying other tabs. Other-device sessions are untouched. Issued access JWTs
may remain valid until expiry; existing RLS still checks current roles/status.
See [Supabase logout semantics](https://supabase.com/docs/reference/javascript/auth-signout).

## Actual verification (2026-11-20)

- `@supabase/supabase-js` `2.119.2` and development-only Playwright `1.65.1` installed;
  npm reported zero vulnerabilities. `npm.cmd run build` emitted all eight entries.
- Real Chrome browser tests exercised new registration through the actual form
  using one plus-tagged variant of a previously supplied controlled demo address.
  Trusted reads verified one active isolated organization, Auth-linked profile
  and fixed dealer role. The fixture is retained for the capstone demo.
- Real login/logout, refresh persistence, all protected direct URLs, wrong-role
  redirects, invalid credentials, required fields/password confirmation, and
  success/error/loading states passed. Cross-tab logout removed protected access.
- The existing dealer with forged `user_metadata.role=admin` still landed in
  Catalog with no admin navigation. Direct server requests denied another user's
  profile and role promotion (`403/42501`). No business-table/Storage requests
  were made by the application.
- Inactive-profile login and inactive-organization feedback passed, with content
  hidden and successful recovery after trusted fixture reactivation.
- A temporary database role change restricted to the new fixture tested actual
  admin login destination, dashboard refresh, shared order-details access and
  dealer-only redirects. `finally` restored the dealer role and activation.
  No permanent admin was provisioned, and no Auth Admin API was used.
- Simulated profile-fetch failure kept protected content hidden; retry recovered.
  No uncaught browser JavaScript errors occurred. Desktop/mobile-width login/register
  screenshots were visually inspected, no horizontal overflow was found, and
  keyboard form order and the collapsed mobile menu passed.
- Both final Playwright tests passed against the production build. The static
  preview check passed all eight pages, 19 linked routes/assets, the order-details
  query URL and an unknown-route 404. Final database reads found three active
  dealer users/organizations/profiles/roles, zero admins, no inactive fixtures and
  no products/orders/items; migration history remains the same two entries.

Tests run in isolated Chrome contexts without traces, videos or automatic failure
screenshots that could retain credentials. Actual emails, generated passwords,
browser profiles, screenshots and test reports stay in ignored local verification
files. No personal addresses or passwords belong in committed test source.

Email confirmation remains temporarily disabled by the user for this demo.
Confirmation-enabled signup/email delivery and other browser engines were not
tested. Broader milestone 2 visual acceptance remains separate. No applicable
4B auth check is intentionally left to manual testing.

## Reproduce the checks

```powershell
npm.cmd run build
$env:SUPABASE_HOME = Join-Path (Get-Location) '.verification/supabase-home'
$env:PDP_AUTH_UI_LIVE = '1'
npm.cmd run test:auth-ui
```

The live tests require Chrome, authenticated Supabase CLI, the ignored 4A fixture
state from its approved validation, and `.env.local`. Set `PDP_UI_TEST_EMAIL` to
a new controlled address to override the default plus-tagged address. Existing
4B fixture state is reused on retries. Only that fixture's role/activation may
be changed by trusted test SQL, and cleanup restores it. Accounts are retained;
deletion needs separate instructions. The test server uses the production build.

`npm.cmd run check:preview` remains the static eight-entry/assets/404 check; run
it while `npm.cmd run preview` serves the build. It does not execute browser guards.

Optional manual smoke check: open `/register/`, create a synthetic dealer with
a controlled email, refresh Catalog, try `/admin/`, then log out and directly
open `/catalog/`. The account should persist on refresh, admin access should
redirect to Catalog, and the logged-out visit should redirect to Login.

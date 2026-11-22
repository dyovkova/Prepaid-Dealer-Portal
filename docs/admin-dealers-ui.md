# Milestone 9B: admin dealer management UI

Implemented and verified against the production build on 2026-11-22.
Target: **PrepaidDealerPortal — `niabpabsvdgxackjjcsb`**.
Netlify publication and browser verification are pending the verified code push.

## Behavior and boundaries

- `/admin/dealers/` is the tenth independent HTML entry, linked from Admin
  Dashboard. It uses the shared Supabase client and active-admin guard.
- Separate organization/profile cards have search and active/inactive filters,
  associated user counts, loading/empty/error states and explicit reload.
- Organization creation/rename sends only `name`; status changes send only
  `is_active`. New organizations are active and empty: no account, invitation
  or membership is created. Names need not be unique in the existing schema.
- Profiles display authorized display names, organization, database role and
  profile status. There is no Auth email query, role editor or membership editor.
  Admin/missing-role/missing-organization profiles have no activation controls.
- Individual activation calls only `set_dealer_profile_active`; no direct
  profile status write is attempted. Organization and profile activation remain
  separate. Both must be active for dealer business access.
- Confirmation explains the affected organization/users before a status change;
  cancel sends no write. Buttons block duplicate submissions while saving.
- All reads and writes obtain the current verified user's JWT through the
  existing session helper. RLS and the existing RPC remain authoritative.
  Account changes clear directory/editor state and cancel stale reads/dialogs.
- Uncertain saves keep editor values and require reload before another write,
  because the original change may already be committed. No automatic retry or
  hard deletion is provided. Draft/order-request storage is untouched.

Page coordination, data access, validation, cards/confirmation and editor are
separate small modules under `src/pages`, `src/services` and `src/admin-dealers`.
Shared Bootstrap styles, feedback, navigation and Auth guards are reused. The
only guard integration is adding this page to the existing admin-only map;
authentication/session behavior is unchanged. No database migration, Auth
setting, order processing or Storage implementation was added.

## Actual production-preview checks

Four opted-in Chrome/Playwright cases pass against the built application and
the real hosted backend, using existing controlled admin/dealer accounts:

1. Admin organization create/rename, associated user counts and database roles;
   whitespace validation, duplicate-click protection, organization/profile
   search/status filters, confirmation/cancel, direct navigation/refresh and
   desktop/390px/320px layouts. Screenshots were inspected; no horizontal overflow.
2. Actual dealer-profile RPC disable/enable and organization disable/enable.
   The same pre-existing dealer JWT loses catalog, organization, order/item
   reads and a known idempotent order retry while disabled. Reactivation restores
   the dealer catalog. Existing browser draft content survives these checks.
3. Anonymous/dealer route guards and real Data API administration denials,
   including inactive dealer denial. Role/membership/direct activation and
   hard deletion remain forbidden even for the admin. An intercepted inactive
   admin profile verifies the page guard; no admin account was deactivated.
4. Controlled API failure/empty/retry, loading, 201-organization pagination,
   HTML-as-text safety, an aborted create and a null activation response.
   Uncertain saves preserve the name and disable writes until reload.

No uncaught JavaScript errors or out-of-scope page writes occurred. Deliberate
network/permission errors are expected in failure tests. An initial simulated
pagination fixture omitted the dealer's organization; it was corrected, then
all four cases passed. This was a test-fixture issue, not a deployed UI defect.

Further checks passed:

- All **27 unit tests**, including five new validation/directory/filter/error
  checks and existing product, draft, submission, history and session regressions.
- Existing session/browser regressions: **six passed**, registration deliberately
  skipped to preserve existing accounts. Real login/refresh/logout/switching,
  JWT identity, stale cross-tab failures and role guards remain functional.
- `npm run build`: all ten HTML entries; `check:preview`: all ten pages, 26
  linked routes/assets, details query URL and unknown-route HTTP 404.
- Read-only hosted preservation comparison: all eleven accounts, profiles,
  roles/memberships, fifteen products, eight orders/fourteen items, existing
  organizations, seven migrations and function/policy/privilege definitions
  unchanged. Seven local/remote migration versions remain synchronized.

One new empty organization, **Synthetic 9B UI organization**, was created through
the real UI and retained inactive, giving thirteen organizations in total.
The Netlify run will reuse this recorded fixture. Temporary fixture profile and
organization statuses/names were restored through the approved public APIs.
No users, products or orders were created or deleted.

## Reproducing focused checks

`npm run test:admin-dealers` runs pure unit checks. Opt-in browser tests require
the existing ignored controlled account manifests, baseline and fixture ledger
under `.verification/`; these contain private test configuration and are never
published or committed. Build first, then in PowerShell:

```powershell
$env:PDP_ADMIN_DEALERS_UI = '1'
npm.cmd run test:admin-dealers-ui
# After publication, reuse the same fixtures against Netlify:
$env:PDP_ADMIN_DEALERS_NETLIFY = '1'
npm.cmd run test:admin-dealers-ui
```

The suite restores fixture statuses in cleanup, retains the new empty
organization inactive and refuses out-of-scope browser writes. It does not
register users, call the Auth Admin API or create fresh order requests.

## Limits

Unsaved names do not persist across document refresh/navigation. Directory data
is refreshed on load, explicit reload and existing session/account rechecks;
there is no realtime subscription. Concurrent admin edits follow the existing
database behavior; reload before acting on stale information. An uncertain
creation must be checked in the reloaded directory before retrying. No role
changes, membership reassignment, email administration, hard deletion, order
processing or Storage functionality is included.

# Milestone 9A: admin dealer management backend

Status: **deployed and verified after explicit approval** (2026-11-22).
Target: **PrepaidDealerPortal - `niabpabsvdgxackjjcsb`**, healthy production
project, PostgreSQL `17.12`, verified with official Supabase CLI `3.2.0`.

## Deployed migration

[20261121000700_admin_dealer_access.sql](migrations/20261121000700_admin_dealer_access.sql)

SHA-256: `0129dd8c67e7a2f3aaa76ce4d8b84ae20da64353e1aa960b2638c27d0234adc6`

- Five policies reuse `private.is_active_admin()`: admin organization SELECT,
  INSERT and UPDATE, plus profile/role SELECT. This allows inspection of inactive
  organizations/profiles and role labels, without exposing Auth users or emails.
- Only organization `name`/`is_active` columns gain INSERT/UPDATE privileges.
  Existing constraints enforce required/nonblank names and boolean activation;
  IDs/timestamps remain generated/immutable. Organization creation creates an
  empty organization, not an Auth account, profile, invitation or membership.
- `public.set_dealer_profile_active(p_profile_id uuid, p_is_active boolean)`
  returns the changed profile UUID. Both arguments are required/non-null. It can
  set only a dealer profile's activation flag, including reactivation; the
  target must have a database `dealer` role and organization membership. Missing
  or non-dealer targets, including the caller/other admins, are rejected.
- The public function is a small SECURITY INVOKER wrapper. Its private SECURITY
  DEFINER implementation, owned by postgres with empty search path, locks caller
  profile/role rows, verifies current active-admin status, and locks target
  profile/role rows before updating only `profiles.is_active`. Both routines
  revoke PUBLIC/anonymous execution and grant only authenticated execution.
  The private implementation independently authorizes every call.
- There is no direct profile-activation grant, generic profile editing RPC,
  role operation, membership reassignment or hard-delete permission. Existing
  own profile/role reads and own display-name UPDATE policies remain intact.
  New policies use the existing definer helper to avoid recursive RLS.

No existing rows, tables, constraints, indexes, Auth settings, order functions,
product policies, migration files or users are changed by this migration.
The existing private schema remains outside the Data API's exposed schemas;
only the narrow public wrapper is intended as an HTTP RPC.

## Activation and existing sessions

Business authorization reads current database profile/organization status, not
cached metadata. After committed deactivation, the same caller claims lose
catalog, organization and order/item reads and order submission/retry access.
Own profile/role diagnostics remain readable. Profile deactivation affects that
user; active colleagues in the same organization keep their authorized history.
Organization deactivation blocks all its dealer users. Reactivating one profile
cannot bypass an inactive organization. Admin authority depends on the admin
profile/role, not the status of an organization associated with that admin.

The profile activation RPC uses the same profile-before-role lock order as order
creation. A pending submission finishes before deactivation commits; an order
waiting behind a committed deactivation fails without partial writes. Caller
and target role checks are re-evaluated after lock waits. No JWT revocation or
Auth-configuration change is required. Data already displayed in a browser is
not erased; subsequent server requests enforce current activation status.

## Actual checks

During preparation (2026-11-21), remote operations were read-only or dry-run.
Verified six matching
applied migration versions; the dry-run lists only version `20261121000700`,
with no seeds, custom roles or Vault updates. The baseline has eleven Auth
accounts/organizations, fifteen products, eight orders/fourteen saved items.
Existing direct identity/activation write restrictions and helper definitions
were inspected before preparation.
The final read-only snapshot matches the original baseline for all inspected
rows, schema/security definitions and applied migration history; no hosted
fixtures or changes were introduced during validation.

The [native harness](verification/test_admin_dealers_local.mjs), using disposable
loopback PostgreSQL **17.12**, passes all seven migrations and these checks:

- Admin organization/profile/role lists and joined queries without recursive
  policies, empty-organization creation, rename/deactivate/reactivate, validation,
  immutable columns and hard-delete denial even for an unreferenced organization.
- Ordinary dealers, anonymous, absent identities and forged metadata cannot
  administer organizations or use the activation RPC. Direct profile status,
  identity, organization-membership and role changes remain denied to admins
  and dealers. DELETE is still denied by RLS under a temporary local DELETE grant.
- Null arguments, absent targets, admin targets and dealer targets without a
  role/membership are rejected. Inactive/demoted callers cannot use admin
  operations. Profile/organization status changes use unchanged claim values;
  self diagnostics/name access, colleague access, cross-organization isolation
  and saved order rows/snapshots remain intact after rollback.
- New [multi-session tests](verification/admin_dealer_concurrency.mjs) observe
  actual PostgreSQL lock waits for both activation-RPC and organization UPDATE
  races against order creation. Admin profile/role withdrawal and target role
  promotion are checked after waits; the operation holds the authorized caller
  until commit. All temporary local statuses/roles are restored.
- Existing catalog/atomic/admin-product security suites and native concurrent
  order/idempotency/price/archive/activation regressions pass. Existing rows and
  function bodies are unchanged apart from the two new routines; protected
  column grants, execution privileges and search paths are checked.

All 22 JavaScript unit tests and `npm.cmd run build` pass. No frontend changes or
additional hosted fixtures are part of this milestone.

```powershell
# Optional ignored native PostgreSQL tooling is documented in order-submission.md.
node supabase/verification/test_admin_dealers_local.mjs
node --test tests/draft.test.js tests/submission.test.js tests/history.test.js tests/session.test.js tests/admin-products.test.js
npm.cmd run build
$env:SUPABASE_HOME = Join-Path (Get-Location) '.verification/supabase-home'
node node_modules/supabase/dist/supabase.js migration list --remote=niabpabsvdgxackjjcsb
node node_modules/supabase/dist/supabase.js db push --remote=niabpabsvdgxackjjcsb --dry-run --skip-vault
```

## Actual hosted deployment and verification (2026-11-22)

Reconfirmed the exact project, `ACTIVE_HEALTHY` status, successful database probe,
PostgreSQL 17.12, approved SHA-256 and sole pending version. Applied **only**
`20261121000700`, with seeds/roles/Vault excluded. All seven stored migration
bodies and local/remote versions match, with no pending migration. Verified five
added policies, exact organization-column grants, protected profile/membership/
role columns, private definer/public invoker ownership/search paths and revoked
PUBLIC/anonymous execution. Existing functions and unrelated policies/grants
are unchanged.

The [hosted runner](verification/test_admin_dealers_live.mjs) and
[API checks](verification/admin_dealer_live_checks.mjs) pass using the permanent
demo admin and three existing dealer fixtures through public Supabase Auth:

- Real admin organization reads/create/rename/deactivate/reactivate, required
  name/status validation and generated-ID protection. The created organization
  has no linked profiles; it does not create or reassign a user.
- Admin profile/role lists and nested joins expose the authorized records.
  Dealers retain exactly their own profile/role/active organization, cannot read
  another identity, and can still save their own existing display name. Admins
  cannot update another user's display name through the own-name policy.
- Dealer/anonymous administration, direct profile activation, membership/role/
  identity edits and organization/profile/role deletion are denied. Admin DELETE
  is denied even for the new empty organization. RPC null/missing/admin targets
  are rejected; the private schema remains unexposed (`406/PGRST106`).
- A dealer-profile RPC deactivation immediately blocks products, organizations,
  orders/items and an existing saved-request replay with the **same issued JWT**.
  Own diagnostics remain readable; other dealer accounts retain access. The RPC
  restores activation and the same JWT regains catalog/history/submission access.
- Organization deactivation has the same immediate effect; setting the profile
  active cannot bypass its inactive organization. All original flags are restored.
- The verified admin profile is temporarily deactivated through narrowly guarded
  trusted test SQL, since the public RPC correctly forbids admin targets. Its
  existing JWT loses broad reads, organization CRUD and RPC authority. The flag
  is restored in cleanup. This changes no Auth setting, password, role or user.
- Real own/cross-organization order/item UUID regressions and saved snapshots pass.
  Submission checks replay the recorded original request UUID and exact payload;
  no new order is created even if a denial assertion were to regress.

Final exact comparison preserves all eleven existing users/profiles, roles,
memberships, fifteen products, eight orders/fourteen items and eleven original
organizations, plus deployed security/history. The sole data addition is one
empty synthetic organization, **Synthetic 9A verified organization**, retained
inactive to respect the no-hard-delete rule (twelve organizations total). Private
manifests make reruns reuse that row. Every temporary status change is restored.
No new users, products or orders are created, and no credentials/tokens are
logged or committed. Evidence remains in ignored `.verification/`.

After deployment, native 9A/7A security/history/concurrency regressions, all 22
unit tests and production build pass. Six real-account browser session/guard
regressions pass; the registration case was intentionally skipped to avoid new
accounts. Native multi-session race tests remain local;
no hosted load/concurrency stress test is claimed.

```powershell
# Opt-in: existing controlled credentials/retained request and organization manifests.
# Runs bounded public API mutations and guarded admin activation test setup;
# restores all existing states and retains the new organization inactive.
$env:SUPABASE_HOME = Join-Path (Get-Location) '.verification/supabase-home'
$env:PDP_ADMIN_DEALERS_LIVE = '1'
node supabase/verification/test_admin_dealers_live.mjs
```

Frontend 9B, order processing and Storage remain deferred. Auth settings and
unrelated MCP/ignore-file edits are preserved; no frontend code changed in 9A.

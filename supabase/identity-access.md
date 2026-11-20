# Milestone 4A: identity backend review

**Applied and validated on 2026-11-20 for the approved SoftUni demo configuration.** Target: **PrepaidDealerPortal**,
`niabpabsvdgxackjjcsb` (CLI environment **production**, `eu-central-1`, PostgreSQL `17.12`).
Only [20261120000200_identity_and_access.sql](migrations/20261120000200_identity_and_access.sql)
was applied in 4A. No migrations remain pending. Existing data and both reviewed
migration files are preserved. Two controlled fixture accounts were created through
public signup; both remain active dealers. No permanent administrator was created.

Reviewed migration SHA-256:
`f2117c6d5d771c890f56a63fa171a654487778328df2c8e7fd21537976df61e1`.

## Final demo validation (2026-11-20)

**Confirm Email is temporarily disabled by the user for this SoftUni capstone
demo environment.** Read-only CLI configuration preview and public Auth settings
both verified this state. The assistant did not change Auth settings. Real
confirmation-email delivery and the confirmation-enabled signup flow are not
claimed as tested; re-enable and validate them before using that configuration.

The [live verification runner](verification/test_identity_access_live.mjs) used
the two controlled addresses supplied by the user, with synthetic names/business
data and generated passwords. Addresses, passwords and JWTs are not committed.
No privileged Auth Admin API was used.

Passed against hosted Supabase Auth/Data API and PostgreSQL `17.12`:

- Public `/auth/v1/signup` succeeded for both users and returned real sessions.
  Separate password logins returned access/refresh tokens, and authenticated
  `/auth/v1/user` identified the correct account.
- Each signup created exactly one active isolated organization, one Auth-linked
  profile and one fixed `dealer` role. Both business names were identical, yet
  organization UUIDs differ. B's requested `admin`, A's IDs/organization, and
  inactive metadata did not affect provisioned identity/activation.
- Actual JWTs could read only their own profile, role and organization. Cross-user
  reads returned no rows; cross-user profile edits affected no rows. Joined RLS
  reads succeeded without recursive-policy errors.
- Role promotion, organization reassignment, profile activation and organization
  activation writes returned `42501`. Own display-name edits succeeded and were
  restored. Both sessions were denied all CRUD operations on catalog/order tables.
- The complete hosted rollback SQL fixture suite passed with the real Auth users,
  including inactive admin, missing-role/subject, private function execution,
  column grants, and cross-account restrictions. Temporary role/name/status edits
  rolled back; no admin role or changed grants persisted.
- With the same previously issued JWT, profile deactivation removed organization
  access and name editing, while own diagnostic profile/role reads remained.
  Organization deactivation independently enforced the same boundary. Activation,
  membership and names were restored and checked afterward.
- Authenticated private-schema helper RPC attempts returned `406/PGRST106`;
  public-schema attempts returned `404/PGRST202`. No helpers are API-exposed.
- Final read-only counts: two Auth users, organizations, profiles and dealer roles;
  zero admins/inactive fixtures; zero products/orders/items. Both original
  migration hashes are unchanged, history matches, and no migrations are pending.
- Application build, JavaScript syntax checks and the local PostgreSQL simulation
  passed. An initial CLI argument issue in the live runner was corrected with
  the `--` argument separator; the resumed suite passed without duplicate signup.

All applicable 4A demo checks passed. The two active fixture accounts are retained
for the demo; no cleanup, permanent admin promotion, frontend Auth, Storage or 4B
features were introduced. MCP/configuration changes remain outside the 4A commit.

## Deployment and actual live checks (2026-11-20)

Before application, the project identity and complete core catalog matched the
prior verified snapshot: 32 columns, 27 constraints, eleven indexes, six RLS
tables, and existing automatic-RLS function. Auth/application identity tables
were empty. The dry-run listed only the approved migration; its hash matched.
Applied using the pinned project reference, `--skip-vault --yes`, without seeds,
roles or Auth configuration changes.

Passed on hosted PostgreSQL `17.12`:

- Both migration history entries, including every normalized stored statement,
  match the local SQL files. All three deployed function bodies match source.
  Final dry-run reports up to date.
- Three parameterless private functions are owned by `postgres`, run as security
  definer with empty search paths, and deny anonymous execution. Authenticated
  execution is granted only for the two actor helpers. Private schema usage is
  authenticated-only, with no client CREATE permission.
- The Auth AFTER INSERT trigger, four authenticated-only identity policies,
  three identity SELECT grants, and profile `display_name`-only UPDATE grant
  match the migration. Business tables retain no client CRUD grants or policies.
- Real Data API requests to all three functions with `Content-Profile: private`
  returned `406/PGRST106`; attempts in `public` returned `404/PGRST202`.
  All six anonymous table reads returned `401/42501`. Helpers are not exposed.
- Rollback-only, no-account database checks passed 21 forbidden statements
  (role/membership/activation changes, trigger execution, business operations,
  anonymous identity/helper reads). An unprovisioned authenticated subject saw
  no identity rows; joined policies and helpers returned safely without recursive
  RLS errors. These are not registered-user/cross-account fixture tests.
- Application build and the local SQL/trigger/RLS simulation passed again.

Initial blocked attempt (resolved by the final demo run above): public
`/auth/v1/signup` rejected both reserved synthetic addresses
(`demo-4a-a@example.invalid` and `demo-4a-a@example.com`) with
`400/email_address_invalid`. Subsequent catalog counts confirmed zero Auth,
organization, profile and role rows; no partial provisioning remained.

At that point, valid controlled synthetic test addresses were needed. With
confirmation enabled, signup email is required; built-in SMTP accepts only
organization-team recipients, while other recipients need configured test SMTP.
See [hosted Auth testing limits](https://supabase.com/docs/guides/auth/testing-auth-flows).
No Auth settings were changed by the assistant. Automatic approval review rejected
the alternative of using a privileged service-role key to create persistent
fixtures through the Auth Admin API as outside public-signup authorization.
That action did not run and will not be retried without explicit authorization.

The user subsequently disabled confirmation for the demo and supplied controlled
addresses. Public signup and all required registered-user checks then passed,
without retrying the rejected Admin API action. Commit/push was authorized after
those checks. Frontend 4B has not started.

## Registration and access contract

Supabase Auth continues to own credentials, confirmation and sessions. The new
`AFTER INSERT ON auth.users` trigger creates an organization, profile bound to
`NEW.id`, and literal `dealer` role in the Auth transaction. Any failure rolls
back all provisioning. Existing users and rows are neither backfilled nor changed.

Editable signup metadata may supply `display_name` (trimmed, 1–120 characters)
and `business_name` (trimmed, 1–160 characters). Omitted names default to `Dealer`
and `Dealer organization`; supplied blank, non-string, or overlong names fail.
Requested IDs, organization membership, roles and activation flags are ignored.
Matching business names never join organizations. Metadata updates do not alter
existing profile, role or membership rows.

Authenticated users read only their own profile/role. Per the accepted design,
these diagnostic reads remain available when inactive. Active dealers read only
their active organization. Active dealers/admins may update only their own
`display_name` (maximum 120 characters); column grants prohibit membership,
activation, identity and timestamp edits. No client role, organization or account
creation/deletion is permitted. Admin-wide reads/operations are deferred.

Two parameterless helpers in `private` derive the actor from `auth.uid()` and
read current database roles/activation. They run as `postgres` with empty
`search_path`, avoiding recursive policies. Only authenticated callers receive
schema usage/helper execution; the trigger function is not client-executable.
No private schema is added to Data API exposure. The configuration dry-run
found no API schema differences from defaults (`public`, `graphql_public`).
Catalog, orders, order items, and Storage receive no new permissions or policies.

This follows Supabase's [Auth trigger guidance](https://supabase.com/docs/guides/auth/managing-user-data),
[RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security),
and [function security guidance](https://supabase.com/docs/guides/database/functions).

## Trusted first demo administrator

After approved deployment, create and confirm a **synthetic** user through
Supabase Auth (dashboard or trusted Admin API). The trigger initially assigns
`dealer`. Verify the exact project, Auth UUID, email and matching profile before
promotion. Keep privileged credentials outside source, frontend code and Git.

Run the following manually as `postgres` through a trusted SQL connection only.
Replace the zero UUID with that verified synthetic user's UUID. Change the demo
email only if the verified synthetic account uses a different address. This is
a one-time operator transaction, never a migration, HTTP RPC or signup option.
It changes only the existing role; it preserves the profile/organization/history.

```sql
BEGIN;
LOCK TABLE public.user_roles IN SHARE ROW EXCLUSIVE MODE;
DO $$
DECLARE
    target_user uuid := '00000000-0000-0000-0000-000000000000';
    expected_email text := 'demo-admin@example.invalid';
    changed integer;
BEGIN
    IF current_user <> 'postgres' OR
       target_user = '00000000-0000-0000-0000-000000000000' THEN
        RAISE EXCEPTION 'Use a trusted postgres connection and a verified demo UUID';
    END IF;
    IF EXISTS (SELECT 1 FROM public.user_roles WHERE role='admin') THEN
        RAISE EXCEPTION 'An admin already exists; review trusted provisioning separately';
    END IF;
    UPDATE public.user_roles AS r SET role='admin'
    FROM public.profiles AS p
    JOIN auth.users AS u ON u.id=p.id
    JOIN public.dealers AS d ON d.id=p.dealer_id
    WHERE r.user_id=target_user AND p.id=r.user_id AND r.role='dealer'
      AND u.email=expected_email AND u.email_confirmed_at IS NOT NULL
      AND p.is_active AND d.is_active;
    GET DIAGNOSTICS changed = ROW_COUNT;
    IF changed <> 1 THEN
        RAISE EXCEPTION 'Expected exactly one confirmed, active synthetic dealer';
    END IF;
END;
$$;
COMMIT;
```

Verify the role/profile afterward as the trusted operator. The first admin still
has no catalog/order/admin-management access until the relevant later migrations.
No administrator was provisioned during this preparation.

## Checks actually run before approval

- Read-only CLI verified the healthy linked target, sole applied core migration,
  no Auth triggers, no private schema, zero identity rows, and the six RLS-enabled
  tables with no policies or client CRUD grants. SQL inspection and config preview
  did not modify the project.
- Remote migration dry-run succeeded and listed only the new identity migration,
  without roles, seeds or Vault updates.
- Disposable PGlite `0.5.17` / PostgreSQL `18.7` applied both SQL migrations and
  passed [database security tests](verification/test_identity_access.sql), eight
  invalid-metadata cases, omitted-name defaults, metadata edits, injected late
  provisioning failure rollback, and the documented admin transaction's UUID/
  first-admin guards. Tests cover cross-account isolation, blocked
  self-promotion/membership/activation edits, inactive profile/organization/admin,
  missing role/subject, own-name edits, private function grants, joined-policy
  reads without recursion, and deferred business-table denial.
- `npm.cmd run build` passed all eight entries. This changes no frontend behavior.
- Scope/credential/whitespace review passed for all twelve 4A files, and all 37
  local documentation links resolved. The original migration, `.mcp.json`, and
  the existing `.gitignore` edit retain their original hashes. No Git files are staged.

The [local harness](verification/test_identity_access_local.mjs) uses only an
in-memory Auth **event stub**, with no passwords or real identities. This is a
database simulation, not Supabase Auth registration or session validation.
The hosted database runs PostgreSQL `17.12`; this simulation alone does not
validate Supabase Auth signup, email confirmation or actual JWT sessions.
Initial local execution found a CASE-expression syntax error in the test script;
it was corrected and the final suite passed. No migration changes were required.

To reproduce the optional local simulation without adding app dependencies:

```powershell
npm.cmd install --prefix .verification/identity-sql-tools --no-save --package-lock=false @electric-sql/pglite@0.5.17
node supabase/verification/test_identity_access_local.mjs
```

## Reproducing live validation

For the approved confirmation-disabled demo, run the public API suite with
controlled fixture addresses supplied at runtime, never hard-coded in source:

```powershell
$env:SUPABASE_HOME = Join-Path (Get-Location) '.verification/supabase-home'
$env:PDP_LIVE_TESTS = '1'
$env:PDP_TEST_EMAIL_A = Read-Host 'Controlled fixture A email'
$env:PDP_TEST_EMAIL_B = Read-Host 'Controlled fixture B email'
node supabase/verification/test_identity_access_live.mjs
```

The runner refuses accounts outside its recorded fixture state, reuses successful
public signups on retries, and restores fixture activation after live checks.
Generated fixture passwords remain only in ignored `.verification/identity-live-state.json`;
JWTs stay in memory and the redacted results contain no email addresses or tokens.
The two Auth accounts are retained; deletion requires separate cleanup instructions.

The reviewed migration is already applied. Use
[read-only inspection](verification/inspect_identity_access.sql)
to check trigger ownership, function search paths/grants, policies, column
permissions and remote history. The original migration remains unchanged.

Use supported Supabase Auth signup, with a public publishable/anon key, for two
valid controlled synthetic fixture addresses. The SQL suite accepts transaction-local
`pdp.test_email_a` and `pdp.test_email_b` settings; its `.invalid` defaults are
for the local event simulation, and were rejected by the hosted Auth validator.
Send `test_fixture: "milestone4a"`, `display_name` and `business_name` inside
signup `data`. After A registers, obtain its organization UUID through a trusted
read. B must additionally submit `role: "admin"`, `dealer_id: "<A organization UUID>"`
and `is_active: false`; verify B still receives a fresh active organization,
active profile and dealer role. A local Supabase Auth mail sink can handle
`.invalid` emails. If hosted mail configuration prevents synthetic signup,
report that separately. Trusted Auth Admin API fixture creation would require
separate explicit authorization here and would not replace public-signup validation.
Do not change hosted Auth settings merely to bypass a failed test.

After those supported Auth fixture registrations, the rollback suite can run as
a trusted operator with the established ignored CLI home:

```powershell
$testEmailA = (Read-Host 'Synthetic fixture A email').Replace("'", "''")
$testEmailB = (Read-Host 'Synthetic fixture B email').Replace("'", "''")
$suite = Get-Content supabase/verification/test_identity_access.sql -Raw
$settings = "SELECT set_config('pdp.test_email_a','$testEmailA',true); SELECT set_config('pdp.test_email_b','$testEmailB',true);"
$suite = $suite.Replace('BEGIN;', "BEGIN;`n$settings")
node node_modules/supabase/dist/supabase.js db query --remote=niabpabsvdgxackjjcsb --yes -- $suite
```

All suite name/activation/role edits roll back; the two Auth fixture accounts
remain. Record their UUIDs and obtain cleanup authorization before deleting
accounts or related rows. Never insert passwords or test users directly into
the project's `auth.users`. Finish live tests using actual issued dealer sessions,
including reused tokens after trusted deactivation. Rerun migration listing and
confirm the identity migration is the only new history entry. The 3B all-denied
regression script is a historical baseline; use the 4A suite after identity grants.

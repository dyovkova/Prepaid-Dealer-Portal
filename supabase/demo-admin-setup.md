# Milestone 4C: initial demo administrator setup

Status (2026-11-20): **approved promotion executed; applicable 4C checks passed**.
Target: **PrepaidDealerPortal — `niabpabsvdgxackjjcsb`**, CLI environment
`production`. Exactly one permanent synthetic demo administrator exists.
Milestone 5A remains unstarted and requires its own instruction.

## Verified candidate

The candidate registered through the existing public `/register/` page in a
production-build Chrome test, using a separate plus-tag alias of the controlled
test mailbox supplied by the user. No Auth Admin API or privileged key was used.
The Register request sent only the two supported name metadata fields.

| Field | Verified value |
| --- | --- |
| Auth user / profile UUID | `6c99cda5-d354-496b-ba85-0218fd9ee1af` |
| Display name | `Demo Administrator` (initial registration: `SoftUni Demo Administrator`) |
| Organization UUID | `862bcb52-78e7-4aed-972a-fcb3290d8ed9` |
| Organization name | `Synthetic Demo Administration` |
| Current role | `admin` (initial public-signup role was `dealer`) |
| Profile / organization | Both active; exactly one member |

A trusted read matched the exact Auth UUID and email to one profile, role and
isolated organization. The verified email and generated login password remain
only in ignored `.verification/demo-admin-candidate.json`; do not commit them.
This is a retained demo account, not a disposable fixture.

**Confirm Email remains temporarily disabled by the user for the SoftUni demo.**
The public settings endpoint confirmed autoconfirm, and Auth populated the
candidate's confirmation timestamp. Mail delivery/mailbox verification was not
tested. No Auth settings were changed by this setup.

## Approved trusted operation — executed

The [trusted first-admin transaction](identity-access.md#trusted-first-demo-administrator)
was copied to ignored `.verification/4c-promote-demo-admin.sql`. Only the target
UUID and expected email declarations were replaced with the verified candidate.
The zero-UUID safety guard remains unchanged. Prepared file SHA-256:

`c0813506c6c8838554e3dc4f02940031aeea66225bf107b34793072465b76c0e`

The transaction requires `postgres`, locks `user_roles` against concurrent writes,
refuses to run if any admin exists, and checks the candidate's exact UUID, email,
confirmation timestamp, current dealer role and active profile/organization.
It must update exactly one row or abort. Its sole persisted change was that
candidate's role from `dealer` to `admin`; membership and all other records stayed
unchanged. This is an operator data change, not a migration or public RPC.

The user explicitly approved this exact file, UUID, project and SHA-256 before
execution. Immediately beforehand, read-only CLI checks reconfirmed the healthy
named project, matching hash, exact UUID/email, confirmed active profile and
organization, current dealer role and zero existing admins. The transaction
matched the documented template with only its two identity declarations filled.
It executed successfully once, using the pinned target and `--file`:

```powershell
node node_modules/supabase/dist/supabase.js db query --remote=niabpabsvdgxackjjcsb --file .verification/4c-promote-demo-admin.sql --yes
```

This is a completed audit record, **not a command to rerun**. The first-admin
guard now rejects another execution. Do not run the general 4B live suite here:
it temporarily changes a fixture's role and is not this approved one-account
provisioning operation. No other trusted SQL write was executed for 4C.

## Actual pre-approval checks

- CLI reconfirmed the named target and matching local/remote migrations
  `20261120000100` and `20261120000200`; no migration is pending.
- Public Register signup succeeded, atomically provisioning exactly one active
  isolated organization, profile and fixed dealer role.
- Candidate password login, logout, refresh persistence, and dealer access to
  Catalog passed against the production build. Direct `/admin/` navigation was
  redirected to Catalog with role-restricted feedback and no Admin navigation.
- The deployed provisioning function body matches the reviewed 4A source and
  inserts the literal dealer role. Read-only privilege checks confirmed clients
  cannot insert roles, update the role column or execute the trigger function.
  The UI submits no role option. Prior 4A/4B live negative tests are recorded in
  [identity results](identity-access.md#final-demo-validation-2026-11-20) and
  [UI results](../docs/authentication-ui.md); they were not rerun as promotion tests.
- Compared complete prior application identity rows and Auth UUIDs with the
  pre-registration snapshot: all three existing accounts/organizations/profiles/
  roles were preserved. Pre-promotion counts: four active dealers and zero admins;
  products, orders and order items remain empty. Both migration files retain
  their reviewed hashes.
- `npm.cmd run build` passed all eight HTML entries. Browser checks reported no
  page errors and no product/order/Storage/Admin API requests.
- A local verification JSON file initially had a UTF-8 BOM; the reader was fixed
  and the remaining checks passed on retry, reusing the same account.

Local-only runner and redacted result record:
`.verification/register-demo-admin-candidate.mjs` and
`.verification/demo-admin-preapproval-results.json`. Session tokens stay in
memory; no credentials belong in documentation or Git.

## Actual post-approval validation

Passed on the hosted project and production-build Chrome UI:

- Immediately after execution and again after all browser tests, compared the
  complete identity-table rows, Auth UUID/email/confirmation records, public and
  private function definitions/ownership/grants, public relation RLS/grants,
  policies, column privileges and complete migration records with the immediate
  pre-execution snapshot. Exactly the approved user's role changed to `admin`.
  Final counts: four active profiles/organizations, one admin and three dealers.
  Existing dealer accounts, membership and business counts remain unchanged.
- Real password login through `/login/` returned the approved Auth user and
  routed to `/admin/`. Direct `/admin/`, page refresh, administrator navigation
  and the dashboard heading passed. Actual authenticated Data API reads returned
  the active own profile and stored `admin` role.
- Admin navigation to `/catalog/`, `/new-order/` and `/my-orders/` redirected to
  `/admin/` with restricted-role feedback. Refresh remained valid. No business
  or additional admin feature was implemented.
- Logout removed the browser session; refresh remained logged out and direct
  `/admin/` required login. A separate real login and refresh succeeded again.
- Each of the three existing dealer accounts logged in successfully, retained
  Catalog access after refresh, was redirected away from `/admin/`, and had no
  Admin navigation link. Using each actual dealer JWT, reads of the admin's
  profile, role and organization returned empty arrays. Unfiltered identity
  reads returned only that dealer's own profile and dealer role.
- Actual dealer Data API attempts to promote themselves, change the admin's
  role or insert a role all returned `403/42501`. The admin's own attempted role
  update and role insertion were also denied. Final snapshots confirmed none
  of these negative tests changed data. Client grants remain unchanged and
  public signup still uses the verified fixed-dealer trigger; there is no public
  admin-provisioning option.
- Admin product/order/order-item reads remained denied with `403/42501`.
  Browser tests had no page errors and used no Auth Admin API. No accounts were
  created or deleted after the approved candidate registration.
- Remote history still matches exactly the two original migrations, with no
  pending migration. Both migration hashes and unrelated `.mcp.json`/`.gitignore`
  hashes are unchanged. `npm.cmd run build` passed all eight HTML entries.

Local-only post-approval evidence: `.verification/demo-admin-preflight-results.json`,
`.verification/demo-admin-promotion-before.json`,
`.verification/demo-admin-promotion-after.json`, and
`.verification/demo-admin-validation-results.json`. The standalone runner is
`.verification/validate-demo-admin.mjs`; it performs no trusted role/status writes.
Passwords, emails, session tokens and the filled operator SQL are excluded from
the documentation commit. The login password remains in the ignored candidate
state file for the operator; it is never included in this record.

All applicable 4C checks passed. Email delivery/confirmation-enabled signup and
non-Chrome browser engines remain untested. Auth settings were not changed.
Catalog, orders, Storage and additional admin functionality remain deferred.

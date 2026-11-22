# Prepaid Dealer Portal: implementation plan

Implement one requested milestone at a time. Each milestone ends with its acceptance checks, a diff/security review, and a brief record of actual results. Commit only when requested, after checks pass. Dependencies listed below refer to earlier milestones.

## 1. Repository foundation: complete

Scope: initialize Git if absent; create `AGENTS.md`, `.github/copilot-instructions.md`, `docs/project-brief.md`, and this plan. Define MVP scope and explicit exclusions.

Acceptance: Git recognizes the repository; all four Markdown documents exist and agree on stack, scope, and workflow; no application files, dependencies, credentials, database resources, or features are introduced. Completion does not imply a Git commit was created.

## 2. Multi-page scaffold and local tooling: implemented; visual acceptance pending

Depends on: 1.

Scope: add npm/Vite configuration, Bootstrap, a minimal shared stylesheet and ES module structure, and eight separate HTML entry pages: Home (`/`), Login (`/login/`), Register (`/register/`), Product Catalog (`/catalog/`), New Order / review (`/new-order/`), My Orders (`/my-orders/`), Order Details (`/order-details/`), and Admin Dashboard (`/admin/`). Add shared navigation and footer, clearly labelled placeholders, `.gitignore`, an environment example with placeholders, and README setup instructions. No authentication or business logic yet.

Scope clarification: the current Milestone 2 request explicitly selects these eight routes. Separate admin product, dealer, and order management pages are deferred to milestones 8, 9, and 10 respectively; the dashboard contains placeholders only.

Acceptance: fresh dependency installation and production build succeed; all planned HTML entries are emitted and directly loadable; navigation and basic mobile/desktop layout work. Local secrets, dependencies, and build output are ignored by Git.

Verification record (2026-11-19):

- Node.js `24.17.0`, npm `11.13.0`; fresh `npm.cmd install` succeeded with Bootstrap `5.3.9` and Vite `8.3.8`. npm reported zero vulnerabilities. PowerShell blocks the `npm.ps1` launcher, so commands used `npm.cmd`; initial sandbox registry access was denied and installation succeeded after network approval.
- `npm.cmd run build` passed and emitted all eight expected HTML entries with shared bundled CSS/JavaScript and the favicon.
- `npm.cmd run preview` served the production build on `http://127.0.0.1:4173/`. `npm.cmd run check:preview` passed all eight routes, compared each response with its own emitted file, checked 18 linked routes/assets and their types, checked the order-details query URL, and confirmed an unknown route returns HTTP 404.
- Git ignore checks confirmed local `.env`, `.env.local`, `.env.production`, `node_modules/`, and `dist/` are ignored; `.env.example` remains trackable. Source/diff review found no credentials or backend/business implementation.
- Visual browser verification was attempted but not completed: the browser access host was unavailable, the first Chrome window was minimized, and computer use then stopped because it could not reliably identify the current browser URL. Mobile/desktop visual layout, interactive navigation, and keyboard walkthrough remain unverified. Do not mark this milestone fully complete until that acceptance review passes. No later milestone was started.

## 3. Database schema and synthetic seeds

Depends on: 2.

### 3A. Schema and access design: complete

Scope: finalize the accepted [database design](database-design.md) and reconcile it with [the project brief](project-brief.md) and this plan. The six core tables are `dealers`, `profiles`, `user_roles`, `products`, `orders`, and `order_items`. Organization membership determines order visibility; each signup provisions an isolated organization and fixed dealer role. `order_documents` and Supabase Storage belong to milestone 11.

Acceptance: the three documents agree on the accepted schema, relationships, RLS/permissions, protected atomic order submission, staged migrations, security risks, and unchanged exclusions; documentation validation and diff/security review pass. This milestone creates no SQL files, database resources, dependencies, or application features. Milestone 2's pending visual acceptance remains open.

Verification (2026-11-20): the user accepted the six-table baseline; the brief, design, plan, and repository milestone boundaries are reconciled. Core table sets, local links/anchors, whitespace, unchanged exclusions, stale wording, credential patterns, and documentation-only change scope were checked; diff/security review passed. No migrations, database tests, or application builds were run for this documentation milestone. Database implementation remains unstarted.

### 3B. Core schema: deployed; accepted complete by the user

Depends on: 2 acceptance and 3A. The user explicitly approved applying the prepared migration on 2026-11-20; milestone 2's visual acceptance remains open.

Scope: prepare and review a versioned migration for the six accepted core tables (`dealers`, `profiles`, `user_roles`, `products`, `orders`, `order_items`) with relationships, validation constraints, restrictive foreign keys, and appropriate indexes. Use exact numeric prices. Enable RLS and revoke client access in the same transaction; introduce policies/operations only in later milestones. The current request is schema-only: use synthetic fixtures for verification, without permanent seed data, signup provisioning, or application features. Do not create `order_documents` or configure Storage here.

Acceptance: verify the target project and remote migration history; obtain explicit user approval before applying. After approval, verify the applied migration against actual columns, constraints, indexes, default-deny RLS/client privileges, and migration history. Exercise valid/invalid synthetic data, historical-reference preservation, and denied access for both `anon` and `authenticated`. Keep all credentials outside frontend code and Git. Mark complete only after actual database verification passes.

Preparation record (2026-11-20): [initial migration](../supabase/migrations/20261120000100_core_schema.sql), [read-only inspection SQL](../supabase/verification/inspect_core_schema.sql), and [review/setup notes](../supabase/README.md) were prepared. The user selected **PrepaidDealerPortal** (`niabpabsvdgxackjjcsb`); its connection, existing schema, and remote history were unverified at preparation time. No local CLI/project link or connection environment was found then. Application and subsequent verification are recorded below.

Local preparation review: static SQL/design consistency, keys/checks/indexes, six RLS statements and client privilege revocation, read-only inspection queries, local links, ignore rules, credential patterns, and `git diff --check` passed. Windows Application Control blocked the optional PostgreSQL parser DLL, so parser validation did not run. No SQL was executed against any database during that preparation; no commit or push was requested then.

Subsequent CLI preflight (2026-11-20): installed official Supabase CLI `3.2.0` as a local development dependency; npm reported zero vulnerabilities and the application build passed. After browser authentication, verified and linked **PrepaidDealerPortal** (`niabpabsvdgxackjjcsb`), CLI environment **production**, region `eu-central-1`, PostgreSQL `17.12`, status `ACTIVE_HEALTHY`. Read-only catalog queries found no public relations/types or migration history table; required Auth table and client roles exist. Remote migration listing showed no applied versions. `db push --remote=niabpabsvdgxackjjcsb --dry-run --skip-vault` succeeded and listed only `20261120000100_core_schema.sql`, with no roles or seeds. No schema/history conflicts were identified; static SQL review agrees with the approved design. The migration file remains unchanged, and no migrations, seeds, history repairs, or Vault updates were applied. CLI login-role initialization was reported during migration inspection. Dry-run does not execute or validate the migration SQL; runtime schema/constraint/access checks remain pending explicit application approval. Milestone 2 visual acceptance remains open; milestone 4 was not started. See [CLI setup and evidence](../supabase/README.md#cli-setup-and-remote-preflight-2026-11-20).

Application and verification (2026-11-20, explicit user approval):

- Reconfirmed the exact healthy project, empty public schema, and sole pending migration. The reviewed SQL file retained SHA-256 `e6ba856b1422b95dbcd23b417047ee618ae8f2298e1cd8618fc0bfb2d66053a5`; no unexpected destructive or unrelated operations were found.
- Applied only `20261120000100_core_schema.sql` with `--skip-vault`, without roles or seeds. Verified six tables, 32 columns, 27 key/check/FK constraints (seven restrictive FKs), and eleven valid indexes against the approved design. All six tables have RLS enabled, zero policies, and zero effective table privileges for `anon`/`authenticated`.
- Remote history contains exactly `20261120000100` / `core_schema`; all eighteen normalized SQL statements match the local migration. Final dry-run reports up to date with no pending migrations.
- [Rollback-only database tests](../supabase/verification/test_core_schema.sql) passed: valid organization/product boundary fixtures and defaults; 23 invalid-data rejections; 48 direct CRUD permission denials; 48 independent RLS checks after transaction-local grants. Confirmed all six tables contain zero rows and client grants remain absent after rollback.
- Inspected an existing `public.rls_auto_enable()` event-trigger function (`ensure_rls`, pinned `search_path=pg_catalog`); it is outside the migration and was left unchanged. An initial post-test guard incorrectly assumed zero public functions; inspection resolved that guard failure without changing the database.
- `npm.cmd run build` passed for all eight entries. Staged scope/credential review passed for thirteen files; all 25 local documentation links resolved, and `git diff --cached --check` passed. MCP connection configuration and its unrelated local ignore change remain outside the commit.

Historical verification limits: successful Auth-backed profile/role/order/item fixtures, creator/request and composite-line duplicate tests, historical-reference delete/update rejection, and snapshot preservation after catalog edits were not run during 3B. No Auth identities were created or existing user data used. The user subsequently accepted milestone 3B as complete and authorized 4A; this records acceptance without claiming the omitted tests ran. Milestone 2 visual acceptance remains open.

## 4. Registration, authentication, and profile authorization

### 4A. Authentication backend and role security: complete for the approved demo configuration

Depends on: deployed 3B. The user approved applying only the reviewed 4A migration, live tests, and commit/push if all applicable checks pass.

Scope: [versioned identity migration](../supabase/migrations/20261120000200_identity_and_access.sql) with atomic Auth-insert provisioning of a new isolated dealer organization, Auth-linked profile, and fixed dealer role. Add private caller-bound actor helpers, own profile/role reads (including inactive account diagnostics), active-own-organization reads, and active users' own display-name updates through a column grant. Document trusted first-demo-admin provisioning. No table redesign/backfill, public promotion RPC, business-table access, frontend Auth, Storage, or milestone 4B.

Acceptance after approval: verify normal supported Supabase Auth signup and the three linked records; reject metadata self-promotion/organization joining, unauthorized membership/activation/role edits and cross-account reads/writes. Inactive/missing-role users retain only diagnostic identity reads. Test policy joins for recursion, private function grants, confirmation/session behavior, and catalog/order default-deny. Verify the applied migration/history and preserve all prior data.

Preparation/verification (2026-11-20): remote CLI reconfirmed **PrepaidDealerPortal** (`niabpabsvdgxackjjcsb`), healthy production target in `eu-central-1`, PostgreSQL `17.12`; only core version `20261120000100` is applied. Identity tables are empty; no Auth triggers/private schema/identity policies exist. Read-only config preview found no API differences from default exposed schemas `public`/`graphql_public`. Migration dry-run lists only `20261120000200_identity_and_access.sql`, without seeds, roles or Vault changes.

Local validation: PGlite `0.5.17` / PostgreSQL `18.7` applied both migrations in memory and passed the [rollback SQL suite](../supabase/verification/test_identity_access.sql), eight invalid-name metadata cases, fallback names, ignored metadata edits, injected late provisioning-failure atomicity, and the documented trusted-admin transaction/guards. Tests cover actor isolation, own-name updates, column protection, inactive profile/organization/admin with unchanged claims, missing role/subject, admin self-promotion denial, policy joins without recursion, private privileges, and business-table denial. The [harness](../supabase/verification/test_identity_access_local.mjs) uses a minimal Auth event stub only: no passwords, real Auth identities or remote writes. Initial test-script CASE syntax was corrected; final tests and `npm.cmd run build` passed. [Setup, review and trusted admin procedure](../supabase/identity-access.md) document behavior and remaining validation.

Deployment/verification (2026-11-20): reconfirmed the exact healthy production project, unchanged complete core schema/data baseline, reviewed SQL hash and sole pending migration, then applied only `20261120000200_identity_and_access.sql` with Vault/roles/seeds excluded. Both history SQL records and all three deployed function bodies match local source. Verified trigger, private function ownership/empty search paths/execute grants, private schema permissions, four identity RLS policies, three identity SELECT grants and profile display-name-only UPDATE. Real HTTP requests denied all three helper functions in private (`406/PGRST106`) and public (`404/PGRST202`), plus all six anonymous table reads (`401/42501`). Hosted PostgreSQL 17 rollback checks passed 21 forbidden statements and non-recursive joined identity queries for an unprovisioned subject; these are not registered-user tests. Build and local fixture simulation passed. Final dry-run reports no pending migrations.

Initial live-test limitation (resolved): reserved `.invalid`/`example.com` addresses were rejected before account creation. Automatic approval review rejected the privileged Admin API fixture alternative; it did not run. The user then temporarily disabled Confirm Email for the SoftUni demo and supplied two controlled test addresses. No Auth configuration changes were made by the assistant, and no Admin API was used. The SQL fixture suite accepts transaction-local test-email settings instead of relying on `.invalid` simulation defaults.

Final live validation (2026-11-20): both public Auth signups returned real users/sessions; separate password logins and authenticated user lookup passed. Each account has exactly one isolated active organization, profile and fixed dealer role. B's forged role/organization/activation/identity metadata was ignored. Actual JWTs enforced own-row reads, cross-account read/update denial, protected role/membership/activation fields, allowed own display-name edits, non-recursive joined RLS, and catalog/order CRUD denial. The hosted SQL rollback fixture suite also passed, including inactive admin and missing-role/subject checks. Profile and organization deactivation separately denied organization access and profile edits with the same previously issued JWT; own diagnostic profile/role reads remained. All fixture names, activation and roles were restored. Authenticated private helper RPCs were unexposed. Final counts are two active dealer Auth users/organizations/profiles/roles, zero admins and zero business rows; history remains exactly the two unchanged migrations with no pending files. `npm.cmd run build`, local SQL regression and JavaScript syntax checks passed. The live runner's initial CLI argument issue was fixed using `--`; resumed checks passed without duplicate registrations.

All applicable 4A checks pass for this demo configuration. Email confirmation is temporarily disabled by the user; email delivery and the confirmation-enabled flow are untested and must be verified if that setting is enabled later. Two active synthetic fixtures are retained for the demo; generated passwords stay only in ignored local verification state and tokens are not logged. Existing data and uncommitted MCP/configuration edits are preserved. The requested 4A commit/push follows final diff/security review. No frontend authentication or 4B work. See [final demo evidence](../supabase/identity-access.md#final-demo-validation-2026-11-20).

### 4B. Frontend authentication: complete for the approved demo configuration

Depends on: accepted 4A.

Scope: Supabase frontend configuration, register/login/logout UI, session handling and shared page guards. Handle confirmation, invalid credentials and inactive-account feedback using 4A's identity access. No new business operations or database migrations.

Acceptance: a synthetic dealer can register, log in, refresh and log out through the multi-page frontend; guards and clear feedback reflect database role/account status. Browser code contains only public configuration. The current demo has confirmation disabled by the user; confirmation-enabled delivery remains a separate untested configuration.

Implementation/verification (2026-11-20): installed Supabase JS `2.119.2` and development Playwright `1.65.1`; npm reported zero vulnerabilities. One reusable client reads the ignored `.env.local` URL/publishable key, persists/refreshes SDK sessions and rejects privileged keys. Auth forms validate bounded names, email, password and confirmation, prevent duplicate submissions, and give loading/success/error feedback. Guards validate the Auth user and read profile/role/active organization through RLS; editable metadata never grants access. Protected HTML starts hidden. Guests go to Login; active dealers/admins go to Catalog/Admin respectively. Inactive/incomplete accounts receive feedback/recheck; network failures remain closed with retry. Logout and cross-tab events clear navigation access; focus/restored pages recheck account status.

Real production-build Chrome tests passed new UI registration and automatic isolated organization/profile/dealer-role creation, password login/logout, invalid credentials/required fields/password mismatch, all protected direct URLs, refresh persistence, ordinary-dealer admin denial, authoritative server denial (`42501`), forged-metadata dealer routing, inactive profile/organization feedback and recovery, admin routing using a temporary trusted role change limited to the new fixture, shared Order Details access, network failure/retry, and cross-tab logout. Fixture role/activation were restored. No application product/order/Storage request was made. Desktop and mobile-width form screenshots were visually inspected, no horizontal overflow was found, and keyboard form order/mobile navigation passed. `npm.cmd run build` and relevant preview/diff/security checks are recorded in [4B results](authentication-ui.md).

One plus-tagged controlled synthetic fixture was added through the real Register form; earlier fixtures/data and both SQL migrations remain unchanged. No permanent admin or Auth Admin API was used. Local credentials/browser artifacts remain ignored and are not committed. No milestone 5 work. Confirmation-enabled email flow and non-Chrome browser engines remain untested; broader milestone 2 visual acceptance is not claimed.

### 4C. Initial demo administrator: complete for the approved demo configuration

Depends on: completed 4A and 4B. The user explicitly approved the exact guarded transaction, candidate UUID, project and SQL hash before execution, then requested validation and a documentation-only commit/push.

Scope: register one separate controlled synthetic account through the existing public Register UI; verify its exact Auth email/UUID, active profile, isolated organization and initial dealer role. Prepare the documented one-time trusted promotion for only that candidate. No Auth Admin API, schema migration, public promotion endpoint or new admin/business features.

Acceptance after approval: promote only the verified account; verify permanent admin login, `/admin/` access, direct navigation/refresh, dealer-route restrictions and ordinary-dealer denial through UI and RLS. Preserve all existing users/data and unrelated changes. Record actual results and review documentation for a focused commit. Do not start 5A before this setup is complete.

Pre-approval verification (2026-11-20): the pinned PrepaidDealerPortal project (`niabpabsvdgxackjjcsb`) and both applied migration versions match, with no pending migration. One candidate registered via the existing production-build UI, provisioning its own active organization/profile and fixed dealer role. Its UUID/email and isolation were verified through trusted reads. Dealer login/logout, refresh persistence and blocked `/admin/` navigation passed. The deployed fixed-dealer trigger matches source; client role INSERT/UPDATE and trigger execution are denied by grants. All three existing accounts and complete application identity rows were preserved; pre-promotion counts were four active dealers, zero admins and zero business rows. Build passed. The exact guarded transaction was prepared locally and held pending explicit approval. Confirm Email remains temporarily disabled by the user; no Auth settings were changed.

Approved execution/validation (2026-11-20): reconfirmed the healthy named target, reviewed SHA-256, exact candidate identity, active status/dealer role and zero admins. Executed only the approved transaction, promoting UUID `6c99cda5-d354-496b-ba85-0218fd9ee1af`. Before/after snapshots confirm exactly that role change; all other captured identity data, function definitions/grants, RLS/policies, column grants and migration records remain unchanged. Real admin login, `/admin/`, direct navigation/refresh, logout/relogin and exclusion from all three dealer-only pages passed. All three existing dealers retained login/Catalog access, were blocked from `/admin/`, and could not read admin profile/role/organization data through their actual JWTs. Client self-promotion, admin-role changes and role insertion were denied with `403/42501`, including attempted role changes by the admin. Admin business-table reads remain denied. Final counts: one admin, three dealers, four active profiles/organizations and zero business rows. Build, browser checks and preservation checks passed. See [4C setup and actual results](../supabase/demo-admin-setup.md). No Auth settings, migrations or additional features changed; 5A remains unstarted.

## 5. Dealer catalog and draft order

Depends on: 4.

### 5A. Product catalog database access and demo data: deployed and verified

Scope: one versioned migration allowing active authenticated dealers to read only active products, using the existing database-derived actor helper. Separate idempotent seed of twelve fictional telecom products priced in EUR, including two inactive products. Keep anonymous/inactive/admin catalog access, all product writes, orders and Storage blocked. Preserve accounts, roles and both deployed migrations. No frontend changes, seed import or migration application without explicit approval.

Acceptance: verify the exact remote project/schema/history and migration dry-run; test allowed reads, archived-product exclusion, anonymous and inactive profile/organization denial, prohibited writes, seed idempotency and preservation. Run the build. Stop for explicit approval before remote migration/seed execution, then verify hosted policy/grants, real sessions and preserved data before marking complete.

Preparation (2026-11-20): read-only CLI verified healthy PrepaidDealerPortal (`niabpabsvdgxackjjcsb`), unchanged 4C identity/schema/history baseline (one admin, three dealers), empty products with RLS enabled/no policies or client CRUD grants, and no demo SKU collisions. [Catalog migration](../supabase/migrations/20261120000300_catalog_access.sql) adds only one authenticated SELECT policy and grant. [Separate seed](../supabase/seeds/demo_products.sql) contains ten active and two inactive synthetic products; conflict handling preserves existing rows. Disposable PostgreSQL 18.7/PGlite tests passed allowed/denied reads, unchanged-claims inactive checks, 22 forbidden statements, fixture rollback, seed idempotency and edited/unrelated-row preservation. Build passed. At preparation, remote dry-run listed only `20261120000300_catalog_access.sql`, with no seeds/roles, and the migration was still local-only. No remote migration/seed or frontend changes were executed before approval; see [5A review and actual results](../supabase/catalog-access.md).

Approved deployment/validation (2026-11-20): reconfirmed the exact healthy target, both approved file hashes, unchanged baseline, sole pending migration and zero seed conflicts. Applied only the catalog migration, then imported only the approved seed. Verified stored migration statements, exact SELECT policy/grants, RLS, twelve rows (ten active/two inactive), and an exact no-op hosted seed rerun. Hosted PostgreSQL 17.12 rollback tests passed all security checks including 22 forbidden statements. Actual public Auth sessions for all three dealers read exactly the ten active products and could not read archived products or perform INSERT/UPDATE/reactivation/DELETE. Admin catalog reads returned no rows; anonymous reads were denied. The same dealer JWT lost catalog access for profile and organization deactivation separately; both were restored and access recovered. Final identity, membership, role and product snapshots match; old migrations/functions/non-product grants/policies remain unchanged, with zero orders/items. Local SQL regression and build passed. Final history matches all three migrations and dry-run reports up to date. No Auth settings, frontend, cart, orders or other features changed. All applicable 5A checks pass; commit/push is authorized for the verified 5A files only. See [actual hosted results](../supabase/catalog-access.md#actual-hosted-deployment-and-validation-2026-11-20).

### 5B. Catalog frontend and draft selection: complete for the current demo

Depends on: completed 5A. The user requested frontend-only implementation, validation and a focused commit/push.

Scope: render active products; select positive whole-number quantities and retain a local draft for the order-review page. Scope/clear draft state across users and logout. Include validation and loading/empty/error states.

Acceptance: seeded catalog data displays correctly; inactive products are excluded for dealers; draft quantities and preview totals behave correctly; anonymous/inactive access is denied. A draft has no database order or reserved stock.

Implementation/verification (2026-11-20): catalog cards use the existing authenticated client/RLS, with name/SKU/description/EUR price, search, loading/empty/error/retry and validated additions. Per-user/project local drafts persist IDs/quantities only; draft loads fetch current active products/prices, exclude unavailable lines and support edits/remove/clear with integer-cent estimates. Shared counters and cross-tab updates respect identity; logout clears only that user's draft. Four model/storage tests, the build, eight-page/20-link preview checks and three real-session Chrome tests passed. Checks covered ten active/two hidden inactive products, direct inactive-ID RLS denial, estimates, invalid input, persistence, two-account isolation, logout, cross-tab changes, failures/retries, local price tampering, storage errors and dealer/admin guards. Price/status/failure scenarios used browser mocks without database writes. Mobile screenshots were inspected; 390/320-pixel overflow checks passed. Read-only snapshots confirmed all remote data/schema/RLS/history unchanged. No submission or later milestones were implemented. See [5B functionality, actual results and limits](catalog-and-draft.md).

## 6. Atomic order submission

Depends on: 5.

### 6A. Secure atomic backend: deployed and verified for the current demo

Scope: [versioned RPC migration](../supabase/migrations/20261120000400_atomic_order_requests.sql) with separate private validation, caller authorization/locking, product snapshot locking and transactional orchestration, behind a narrow authenticated invoker wrapper. Derive all ownership/status/prices on the server. Keep direct table access default-deny; no frontend, history, admin operations or Storage.

Acceptance: test success, invalid/unauthorized inputs, full rollback, current price/snapshot integrity, caller-scoped idempotency/conflicts and actual concurrent changes. Verify the exact project and pending migration, run remote dry-run/build, and stop for explicit approval before deployment. Hosted RPC integration remains pending until approved application.

Preparation (2026-11-20): healthy PrepaidDealerPortal (`niabpabsvdgxackjjcsb`) retains one admin, three dealers, twelve products, three deployed migrations and zero orders/items. Native PostgreSQL 17.12 tests passed 24 invalid cases, late rollback, success/snapshots/idempotency and 21 authorization/helper/table denials. Genuine independent sessions observed lock waits for duplicates and price/archive/activation/role/membership races in both directions, with correct snapshots/rejections. Catalog regression, four draft tests and eight-entry build passed. Migration adds functions/grants only; no table redesign/data/seed changes. Remote dry-run lists only `20261120000400_atomic_order_requests.sql`, still local-only, with no seeds/roles/Vault changes. See [API contract and actual checks](../supabase/order-submission.md). Nothing applied or committed for 6A.

Approved deployment/validation (2026-11-20): reconfirmed target/hash/sole pending migration and unchanged baseline, then applied only the reviewed migration. Deployed bodies/security and history SQL match source; original functions, table grants/RLS/policies, accounts, roles, products and prior history remain unchanged. Hosted rollback tests passed success, 24 invalid cases, late rollback, snapshot integrity/idempotency and 21 denials. Actual public Auth/RPC calls by all three dealers created three retained synthetic orders/four snapshot items; server ownership/status/current prices were verified. Simultaneous/reordered retries returned the same UUID, conflicts failed, and cross-account keys stayed isolated. Anonymous/admin/inactive calls and direct table CRUD were denied; private RPC helpers remain API-excluded. Temporary activation tests restored original values. Native concurrency/catalog regression, draft tests and build passed again. Final history matches all four versions and dry-run reports up to date. The user authorized a focused commit/push of verified 6A files. No 6B/history/admin/Storage work. See [actual hosted results and remaining limits](../supabase/order-submission.md#actual-hosted-deployment-and-verification-2026-11-20).

### 6B. Frontend submission: complete for the current demo

Depends on: deployed/verified 6A and a separate user request.

Scope: connect the existing draft/review UI to the deployed 6A RPC without duplicating server logic. Retain a request UUID with its canonical payload for retries; handle loading, success and actionable errors. Treat client validation/totals only as convenience/estimates. No direct table writes or history queries.

Acceptance: a valid draft submits once through 6A, with server-derived ownership/status/snapshots. Invalid/inactive selections and unauthorized callers receive clear feedback without partial writes; repeated clicks/network retries keep one order and conflicting reuse fails. Confirmed success clears the draft and displays the acknowledged UUID. Saved-order history/read navigation is deferred to milestone 7.

Implementation/verification (2026-11-20): New Order now calls the existing authenticated RPC with only IDs/quantities, note and generated UUID. Small modules separate request validation/storage, cross-tab locking, retry/confirmation and UI. Pending requests lock draft edits and retain their exact payload through errors, refresh, logout and account switching; confirmed receipts precede matching-draft cleanup. Seven submission unit tests, four draft tests, three submission browser tests, three catalog regressions, native SQL/security/concurrency regressions, build and eight-page/20-link preview checks passed. Two real synthetic multi-product orders/four items were retained; trusted read-only checks verified current server prices, snapshots and request uniqueness. Double clicks/two tabs made one attempt; a deliberately lost real commit response recovered the same UUID on retry. Inactive/invalid/storage/network UI scenarios used mocks without changing hosted accounts. Admin guards and mobile checks passed. Final snapshots preserve original data, identities, schema/RLS/grants/history and configuration; five orders/eight items now exist. Confirm Email remains disabled. No history/admin/Storage/migration work. See [actual results and remaining limits](order-submission-ui.md).

## 7. Dealer order history and details

Depends on: 6.

Scope: add organization-based order/item read policies, dealer organization order history, and order details with saved snapshots, quantities, derived totals, and status. Documents remain a placeholder until milestone 11.

Acceptance: two synthetic users in organization A can read each other's organization orders/items; a user in organization B cannot, including through direct API calls, joins, and changed URL IDs. Profiles remain individually private except to admins. Product changes do not alter historical snapshots/totals; empty/error states work; dealers cannot change submitted orders or status.

### 7A. Secure dealer history access: deployed and verified for the current demo

Scope: SELECT-only organization-scoped order/item RLS and grants. Reuse the active-dealer helper; preserve snapshots, existing RPC/idempotency/data and all write denials. No admin-wide reads, frontend or Storage.

Preparation (2026-11-21): verified healthy PrepaidDealerPortal (`niabpabsvdgxackjjcsb`), four applied migrations and the sole pending `20261121000500_order_read_access.sql`. Native PostgreSQL 17.12 tests passed shared-organization/cross-organization reads, direct UUIDs, joins, snapshots after catalog edits, inactive/role/membership restrictions, denied writes and unchanged RPC retries/rollback/concurrency. Real public Auth sessions for three isolated dealers and the admin confirmed hosted baseline denials, including every existing order/item UUID. Anonymous denial and read-only preservation checks passed. Four draft tests, seven submission tests and the eight-entry build passed. Remote dry-run listed only the new migration, with no seeds/roles. Six current orders/eleven items and all existing accounts, products, migrations and unrelated configuration are preserved. Nothing applied or committed. New hosted positive-access tests remain pending approval; shared-organization/inactive hosted fixtures would need separate authorization. See [review, actual results and pending checks](../supabase/order-read-access.md).

Approved deployment/verification (2026-11-21): reconfirmed exact target/hash/sole pending migration and unchanged baseline, then applied only the approved SQL. Five migration versions and deployed SQL match source; RLS and authenticated SELECT-only privileges are verified. Real sessions for all three dealers passed organization lists, own/cross UUIDs, saved snapshots, product filters and nested reads. Admin-wide and anonymous reads and all tested direct client writes remain denied. Guarded temporary profile/organization deactivation denied reads and replay with the same JWT; restoration recovered access. Archiving the referenced synthetic product hid its catalog row while snapshots and the original idempotent RPC result stayed accessible. All flags were restored and six orders/eleven items, identities, products, RPCs, other grants/policies and schema remain unchanged. Native SQL/concurrency, eleven JavaScript tests, build and eight-page/20-link preview checks passed. Final dry-run is up to date. Shared-organization membership remains a local-only test; existing hosted memberships were preserved. No 7B/frontend/admin/Storage work. User authorized a focused commit/push of verified 7A files. See [actual hosted results and limits](../supabase/order-read-access.md#actual-hosted-deployment-and-verification-2026-11-21).

### 7B. Dealer history and details UI: complete for the current demo

Depends on deployed and verified 7A and a separate request. Implement history/details pages and UI states only when requested; no frontend work is part of 7A.

Implementation/verification (2026-11-21): organization history now displays newest-first paged cards with dates/status/item counts and saved EUR totals. UUID details show saved names/SKUs/quantities/unit prices, note and totals, using exact integer cents without catalog reads. Invalid/hidden UUIDs, loading/empty/denied/error/retry states, aborted stale loads and dealer-only guards are covered. Confirmed submissions offer View order without changing the retry contract. Four history unit tests, eleven existing unit tests, four history browser tests and six submission/catalog browser regressions passed. Real dealer history/details, SQL-derived expected totals, refresh, account switching and direct unfiltered cross-organization API denials passed; failure/inactive/paging/XSS/large-value scenarios used browser-only mocks. GET-only 7A RLS regressions, build, eight-page/22-link checks and mobile review passed. Exact before/after snapshots preserve six orders/eleven items, identities, catalog, five migrations/security and configuration; submission regressions replayed existing IDs only. No database/fixture/order changes or later features. See [actual results and limitations](order-history-ui.md).

## 8. Admin product management

Depends on: 7.

Scope: implement the admin overview/navigation shell and product create/edit/archive operations with admin-only policies and validation. Retain referenced products and their historical relationships.

Acceptance: an admin manages a synthetic product; a dealer cannot perform the same writes through the API; archived products disappear from the dealer catalog while existing orders remain readable.

### 8A. Admin product database access: deployed and verified

Backend-only scope: [minimal product migration](../supabase/migrations/20261121000600_admin_product_access.sql)
adds active-admin read/create/edit/archive policies and editable-column grants,
reusing existing validation and identity helpers. Dealer catalog access stays
read-only; hard deletion and all unrelated admin operations stay denied.

Preparation before approval (2026-11-21): healthy production target `niabpabsvdgxackjjcsb` verified;
five migrations were applied. Remote dry-run listed only version `20261121000600`,
without seeds/roles/Vault updates. Native PostgreSQL 17.12 tests pass admin CRUD,
constraints, denied actors/writes, archived-product visibility, historical
snapshots, idempotency and concurrency; existing 7A SQL regressions, nineteen
JavaScript unit tests and the build pass. All remote operations are read-only
or dry-run; hosted CRUD/deployment were deferred until approval.
See [actual results, hash and pending checks](../supabase/admin-products.md).
Frontend product management (8B) is not started.

Deployment/verification (2026-11-21): after explicit approval, reconfirmed project,
approved hash and sole pending file, then applied only `20261121000600` without
seeds/roles/Vault changes. All six migration versions and stored statements
match local source. Existing admin public Auth/Data API create/read/edit/archive,
validation and DELETE denial pass; three dealers, anonymous and inactive
dealer/admin profiles/organizations cannot write. Same-JWT inactivity checks
restore all fixture states. Real archive/rename/repricing preserves order
snapshots; own/cross UUID history regressions remain isolated. Original eleven
accounts, twelve products, eight orders/fourteen items, functions and unrelated
security are preserved. One new synthetic CRUD product remains archived
(thirteen total, ten active/three inactive); no users/orders were created.
Native SQL/concurrency regressions, nineteen unit tests and build pass. Final
dry-run has no pending migration. No frontend or later milestone implementation.

### 8B. Admin product UI: deployed and verified

The ninth HTML page `/admin/products/` is linked from the dashboard. Small model,
service, editor and rendering modules support all-product cards, search/status
filters, create/edit and confirmed archive/reactivation with EUR validation and
duplicate/access/error feedback. Only the new route is added to the existing
admin guard; Auth/session logic and all database migrations/policies are unchanged.

Four new real-account browser cases, sixteen existing browser regressions,
twenty-two unit tests, native 8A SQL/concurrency checks and nine-route/24-link
checks pass. Desktop and 320/390 layouts are verified. Exact comparison preserves
original rows, historical snapshots and security. Two new synthetic test products
remain archived (one from an initial network-interceptor error); reruns reuse
them, leaving ten active products. No Auth users or orders were created.
See [actual checks and limitations](admin-products-ui.md).

Commit `e988ca6` was automatically published from `main`: the new route changed
from 404 to its own HTML at `2026-11-21T12:22:50Z`, without a manual deploy.
All four UI browser cases pass on Netlify too, reusing the recorded product.
Final read-only comparisons preserve existing records, snapshots, six migrations
and security. Fifteen products remain, ten active/five inactive, with two new
archived synthetic fixtures documented. No users/orders or later features were
added. The existing Supabase public configuration is unchanged.

## 9. Admin dealer management

Depends on: 8.

Scope: manage dealer organization names/activation and inspect profiles; activate/deactivate individual profiles through narrowly authorized operations. Keep role changes, membership reassignment, and Supabase Auth account administration outside this UI.

Acceptance: an admin can create/edit a synthetic organization and deactivate/reactivate organizations and profiles; dealer users cannot change roles, membership, or activation. Profile deactivation blocks that user; organization deactivation blocks all its dealer users, including existing sessions. Reactivation restores otherwise permitted access. Existing orders remain intact.

### 9A. Admin dealer backend: deployed and verified

The [minimal migration](../supabase/migrations/20261121000700_admin_dealer_access.sql)
adds admin organization/profile/role reads, organization name/activation column
grants and a narrow dealer-profile activation RPC. Existing dealer self-access
stays intact; role, membership, direct profile-status writes and hard deletion
remain prohibited. No existing data or order/product/Auth implementation changes.

Preparation (2026-11-21): verified healthy production target
`niabpabsvdgxackjjcsb`, six matching applied versions and only `20261121000700`
pending in the remote dry-run, excluding seeds/roles/Vault updates. PostgreSQL
17.12 tests pass admin operations, denials, same-claims activation effects,
colleague isolation, preserved snapshots and actual activation/order/authority
lock races. Existing SQL regressions, 22 unit tests and build pass. Hosted JWT/API
checks were deferred until explicit approval; preparation used no remote writes.
See [actual results, hash and pending checks](../supabase/admin-dealers.md).
Frontend 9B, order processing and Storage remain deferred.

Deployment/verification (2026-11-22): reconfirmed healthy target, exact approved
hash and sole pending version, then applied only `20261121000700`. Seven local/
remote versions and stored bodies match; no migrations remain pending. Real
admin organization CRUD/activation and profile/role reads, dealer-profile RPC,
ordinary/anonymous/inactive denials, private-schema exposure checks and same-JWT
business restrictions pass. Roles/membership/direct profile activation and DELETE
remain protected. All temporary status changes are restored; eleven existing
users, fifteen products, eight orders/fourteen items and eleven original
organizations remain unchanged. One empty synthetic organization is retained
inactive (twelve total); no user/product/order creation. Native regressions, 22
unit tests and production build pass. No frontend or later features implemented.

### 9B. Admin dealer UI: deployed and verified

On 2026-11-22, added the tenth HTML page at `/admin/dealers/`, linked from
Admin Dashboard. Existing active-admin guards and current-session JWT reads
protect organization/profile/role inspection, organization create/rename/status
and the narrow dealer-profile activation RPC. Separate search/status filters,
counts, confirmation, responsive cards and explicit error/reload feedback are
included. No Auth emails, role/membership editing or direct profile activation.

Four real-account production-build browser cases, 27 unit tests, six existing
session browser regressions, the build and ten-page route checks pass. Same-JWT
business denials after profile/organization deactivation and subsequent recovery
are verified. Existing records and all seven migrations/security definitions are
preserved. One new empty synthetic organization is retained inactive; no users,
products or orders were created. Commit `0595c8b` was automatically published
from GitHub `main`; all four focused cases also pass on Netlify. All ten live
entries and seventeen assets match the build (accounting for Netlify's injected
markup), eighteen private/source/unknown paths remain denied, and the final
data/security preservation comparison passes. See
[actual results and limitations](admin-dealers-ui.md).

## 10. Admin order processing

Depends on: 9.

Scope: implement admin order list/details and permitted status transitions from the brief. Enforce transitions in the database and show current status in dealer views.

Acceptance: an admin can process orders across dealers; permitted transitions succeed and invalid transitions fail through the API as well as the UI. Dealers cannot update status. Terminal orders cannot be reopened.

### 10A. Admin order backend: deployed and verified

On 2026-11-22, applied 20261122000800 after exact target/health/hash/pending checks.
It adds active-admin order/item reads and a narrowly guarded status RPC; dealer
organization access, snapshots and direct-write prohibitions remain intact.
All sixteen status pairs passed on three controlled hosted fixtures. Native
expected-status/authority/order lock races and existing regressions also passed.

Initial hosted stale testing exposed PostgREST 14.18 retrying SQLSTATE 40001.
After separate approval and preflight (including no active retrying RPC), applied
only 20261122000900, changing the private conflict code to PT409. No other function,
policy, grant or persistent row changed. Seven actual stale/duplicate/conflicting
requests returned HTTP 409/PT409 in 48-554 ms; no timeouts or remaining active RPCs.
Real admin/dealer/inactive/anonymous authorization and direct-write restrictions
pass again. Terminal fixtures were reused; successful winning races and the full
post-correction transition matrix are rechecked locally rather than resetting them.

All nine local/remote versions and stored SQL bodies match, with nothing pending.
All eight original orders/statuses/fourteen items and existing users/data remain
unchanged. The same three synthetic terminal orders/four items remain; no new
fixtures in 009. Native SQL/concurrency regressions, 27 unit tests and production
build pass. See [actual results, hashes and test limits](../supabase/admin-orders.md).
Frontend 10B and Storage remain deferred.

### 10B. Admin order UI: deployed and verified

On 2026-11-22, added `/admin/orders/` and admin UUID details on the same HTML
entry. It uses current-session RLS reads, server search/status/pagination and
shared saved-snapshot totals/rendering. Confirmed changes use only the 10A RPC;
terminal states are read-only. PT409 and uncertain responses reload current
order state without automatically retrying the mutation. Existing guards remain.

Four focused browser cases (including real controlled status updates and a
stale expected-status conflict), 32 unit tests, six existing session browser
regressions, eleven-page route checks and production build pass. All eleven
pre-existing orders/eighteen items and nine migrations/security definitions
remain unchanged. Two new synthetic preview orders/three items are retained
terminal; no accounts/products/organizations changed. Commit `f9a036a` was
automatically published from main; all four browser cases also pass on Netlify,
including real successful transitions, genuine PT409 recovery and no mutation
retry. Three additional controlled live orders/four items are retained terminal,
giving five UI fixtures/seven items in total. All eleven pre-existing orders/
eighteen items are unchanged. Eleven live entries and nineteen assets match the
build; eighteen private/source/unknown paths are denied. Final comparisons
preserve identities, profiles, roles, organizations, products and all nine
migrations/security definitions. See [actual evidence and limits](admin-orders-ui.md).
No Storage or unrelated features.

## 11. Private order documents

Depends on: 10.

Scope: add `order_documents` in a versioned migration with order/uploading-admin references, private object path, and file metadata. Enable RLS; configure a private Supabase Storage bucket and version its policies. Implement admin PDF upload, metadata persistence, document listing, and downloads authorized against the order's organization. Choose/document file size limits, validate types, use unique object paths, and handle partial upload/metadata failures without exposing orphaned files.

Acceptance: an admin uploads a synthetic PDF; active users in the order's active organization can download it. Anonymous users, inactive profiles/organizations, and users from another organization cannot access the file/metadata or obtain a download link; dealers cannot upload. Invalid files are rejected; simulated failure cleanup works. Document short-lived link expiry behavior.

## 12. Responsive and accessibility review

Depends on: 11.

Scope: review all implemented screens on phone and desktop widths; refine keyboard navigation, labels, focus, readable validation, and loading/empty/error feedback. Fix issues within the MVP only.

Acceptance: primary dealer/admin workflows work at both viewport sizes without horizontal overflow; forms and navigation work by keyboard; no unresolved console errors occur in the walkthrough.

## 13. Capstone documentation and release

Depends on: 12.

Scope: finalize README and setup/security/demo documentation, SQL migration and seed instructions, trusted admin provisioning, Netlify multi-page build configuration, and deployment environment guidance. Prepare and review the public repository and live deployment; publish only when requested. Use synthetic accounts and files for the walkthrough.

Acceptance: a clean checkout can install/build and reproduce database setup from documentation; all pages load directly on Netlify; deployed Auth redirect URLs and private Storage access work. Review tracked files/history for secrets before public release. Record actual public GitHub and live Netlify URLs after publication, then run the dealer/admin walkthrough and denied-access checks against the deployment.

## Verification across later milestones

Focused Netlify verification requested after 7B (2026-11-21): the user deployed
`https://prepaiddealersportal.netlify.app`. This review is limited to deployment
checks and confirmed fixes, not the start/completion of another milestone.
See [actual deployment results and pending checks](../public/deployment-verification.md).

- Use focused manual checks and meaningful automated checks appropriate to each change. Record actual commands and outcomes; do not claim unrun checks passed.
- Verify permissions through Supabase/API behavior, not just hidden controls. Use separate synthetic dealers and an admin for role/ownership scenarios.
- Re-run relevant build checks after application/configuration changes, and review staged changes before any requested commit.
- Document any necessary change in scope or milestone dependencies before implementing it. Keep out-of-scope work out of the MVP.

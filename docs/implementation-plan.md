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

### 3B. Schema implementation: not started

Depends on: 2 acceptance and 3A. Begin only when separately requested.

Scope: create migrations for the six accepted core tables (`dealers`, `profiles`, `user_roles`, `products`, `orders`, `order_items`) with relationships and integrity constraints. Enable RLS and revoke client access in the same migration; introduce policies/operations only in their relevant later milestones. Document local Supabase setup and use reproducible synthetic catalog/organization seeds; provision test Auth identities through supported local tooling. Store monetary values with an exact database numeric type. Do not create `order_documents` or configure Storage here.

Acceptance: migrations and seeds apply to a fresh database; foreign keys and invalid quantity/price constraints are exercised; anonymous API reads/writes are denied. No public remote setup or privileged credentials are required in source.

## 4. Registration, authentication, and profile authorization

Depends on: 3B.

Scope: add Supabase client configuration, register/login/logout, session handling, and atomic signup provisioning of an isolated `dealers` organization, linked `profiles` row, and fixed dealer `user_roles` row. Add shared page guards, own profile/role and organization read policies, limited display-name updates, and trusted admin provisioning instructions. Account for email confirmation and inactive profiles/organizations. Keep unimplemented business operations default-deny.

Acceptance: register a synthetic dealer into a fresh organization, log in, refresh, and log out; invalid credentials/confirmation requirements have clear feedback. Signup metadata cannot grant admin or existing-organization membership. Anonymous business access, client role/membership/activation writes, and unauthorized profile reads/edits fail at the database boundary. Inactive profiles/organizations cannot access dealer business data with an existing session. Admin setup is reproducible without browser-side privileged keys.

## 5. Dealer catalog and draft order

Depends on: 4.

Scope: add active-product read policies and catalog rendering; select positive whole-number quantities and retain a local draft for the order-review page. Scope/clear draft state across users and logout. Include validation and loading/empty/error states.

Acceptance: synthetic catalog data displays correctly; inactive products are excluded for dealers; draft quantities and preview totals behave correctly; anonymous/inactive access is denied. A draft has no database order or reserved stock.

## 6. Atomic order submission

Depends on: 5.

Scope: add protected database-side order creation and review/submit behavior. Validate the authenticated dealer role and active profile/organization; derive creator, organization, and submitted status on the database side. Validate active products, quantities, and current database prices; save order/items and price/SKU/name snapshots atomically. Keep direct client order/item writes denied. Define behavior for concurrent price/availability/activation changes and prevent duplicate orders from repeated submission of the same request.

Acceptance: a multi-item request saves as `submitted` for the caller's organization; invalid/inactive products, invalid quantities, and inactive callers leave no partial order. Forged creator/organization/status/price/total and direct client writes are ineffective. Repeated submission creates one order; reuse of a request ID with different contents fails. Success clears the draft; saved-order navigation/read access is completed in milestone 7.

## 7. Dealer order history and details

Depends on: 6.

Scope: add organization-based order/item read policies, dealer organization order history, and order details with saved snapshots, quantities, derived totals, and status. Documents remain a placeholder until milestone 11.

Acceptance: two synthetic users in organization A can read each other's organization orders/items; a user in organization B cannot, including through direct API calls, joins, and changed URL IDs. Profiles remain individually private except to admins. Product changes do not alter historical snapshots/totals; empty/error states work; dealers cannot change submitted orders or status.

## 8. Admin product management

Depends on: 7.

Scope: implement the admin overview/navigation shell and product create/edit/archive operations with admin-only policies and validation. Retain referenced products and their historical relationships.

Acceptance: an admin manages a synthetic product; a dealer cannot perform the same writes through the API; archived products disappear from the dealer catalog while existing orders remain readable.

## 9. Admin dealer management

Depends on: 8.

Scope: manage dealer organization names/activation and inspect profiles; activate/deactivate individual profiles through narrowly authorized operations. Keep role changes, membership reassignment, and Supabase Auth account administration outside this UI.

Acceptance: an admin can create/edit a synthetic organization and deactivate/reactivate organizations and profiles; dealer users cannot change roles, membership, or activation. Profile deactivation blocks that user; organization deactivation blocks all its dealer users, including existing sessions. Reactivation restores otherwise permitted access. Existing orders remain intact.

## 10. Admin order processing

Depends on: 9.

Scope: implement admin order list/details and permitted status transitions from the brief. Enforce transitions in the database and show current status in dealer views.

Acceptance: an admin can process orders across dealers; permitted transitions succeed and invalid transitions fail through the API as well as the UI. Dealers cannot update status. Terminal orders cannot be reopened.

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

- Use focused manual checks and meaningful automated checks appropriate to each change. Record actual commands and outcomes; do not claim unrun checks passed.
- Verify permissions through Supabase/API behavior, not just hidden controls. Use separate synthetic dealers and an admin for role/ownership scenarios.
- Re-run relevant build checks after application/configuration changes, and review staged changes before any requested commit.
- Document any necessary change in scope or milestone dependencies before implementing it. Keep out-of-scope work out of the MVP.

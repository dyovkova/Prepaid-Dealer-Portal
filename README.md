# Prepaid Dealer Portal

A SoftUni **Software Technologies with AI** capstone for prepaid dealer order requests.
Built with HTML, CSS, vanilla JavaScript ES modules, Bootstrap, Node.js, npm, and Vite.

Live demo: [prepaiddealersportal.netlify.app](https://prepaiddealersportal.netlify.app).
See the [production deployment verification](public/deployment-verification.md)
for actual checks, confirmed corrections and any outstanding production checks.

## Current scope

Milestone 2 provides a genuine multi-page skeleton: eight independent HTML entries,
shared responsive navigation and footer, and clearly labelled placeholder screens.
Links perform normal document navigation; there is no SPA router or history fallback.

Milestone 4B provides working registration, login, logout, persistent Supabase
sessions, role-based navigation guards and inactive-account feedback. Account
roles/status come from database rows protected by the deployed 4A RLS policies.
Milestone 5B provides a live dealer catalog and editable local order draft.
Search active products, choose quantities and review current EUR estimates.
Drafts are scoped to the verified user and persist across refresh. Prices are
rechecked on draft load. Milestone 6B connects New Order to the verified atomic
`submit_order` RPC, with an optional note, duplicate-click protection, confirmed
order UUID and exact durable retries after uncertain outcomes. Pending requests
and their drafts survive logout; normal drafts clear on logout. Documents and
dealer/order management actions remain placeholders. See
[5B results](docs/catalog-and-draft.md) and [6B results/limits](docs/order-submission-ui.md).

Milestone 7A adds RLS-protected, read-only organization access to saved orders
and items. Milestone 7B provides organization history, UUID details with saved
snapshots/totals and a View order link after confirmed submission. See
[database checks](supabase/order-read-access.md) and [7B results/limits](docs/order-history-ui.md).

Milestones 8A/8B provide RLS-protected admin product management at
`/admin/products/`: search/filter all products, create/edit, and confirm
archive/reactivation. The dashboard links to this ninth HTML page. Existing
order snapshots and dealer restrictions remain intact. See
[backend checks](supabase/admin-products.md) and [UI results/limits](docs/admin-products-ui.md).

Milestone 3A's database design is accepted. Milestone 3B's approved six-table schema
is applied to `niabpabsvdgxackjjcsb`, establishing the initial default-deny baseline. Catalog,
constraint-rejection, and authorization checks passed; Auth-backed fixture acceptance
tests remain outstanding. See [Supabase setup and verification](supabase/README.md).
The user accepted milestone 3B as complete. Milestone 4A's database-only identity
migration is [applied and validated for the demo](supabase/identity-access.md).
Public signup/login, isolated dealer provisioning, registered-user RLS, protected
fields and inactive-session restrictions passed. Confirm Email is temporarily
disabled by the user for this SoftUni demo; email confirmation delivery was not
tested. See [working authentication UI and verification](docs/authentication-ui.md)
for the completed 4B scope and its actual browser/database checks.

## Local setup

Use Node.js **22.12+ (22.x) or 24+** and the bundled npm. Create an ignored
`.env.local` using `.env.example`, then fill in the Supabase URL and public
publishable key for the deployed identity backend. Never use secret/service-role
keys in browser configuration. Restart Vite after editing the file.

```sh
npm install
npm run dev
```

Open the Local URL printed by Vite (normally `http://127.0.0.1:5173/`).
On Windows PowerShell, if execution policy blocks `npm.ps1`, use `npm.cmd` in
place of `npm`, for example `npm.cmd install` and `npm.cmd run dev`.

The tracked `.env.example` contains placeholders only. Local `.env` variants,
dependencies and build output are ignored by Git. Vite includes the public URL/key
in its browser bundle; RLS enforces access. Hosted builds need the same public
build variables. No privileged keys, test passwords or sessions are committed.

## Routes

| URL | HTML entry | Page module |
| --- | --- | --- |
| `/` | `index.html` | `src/pages/home.js` |
| `/login/` | `login/index.html` | `src/pages/login.js` |
| `/register/` | `register/index.html` | `src/pages/register.js` |
| `/catalog/` | `catalog/index.html` | `src/pages/catalog.js` |
| `/new-order/` | `new-order/index.html` | `src/pages/new-order.js` |
| `/my-orders/` | `my-orders/index.html` | `src/pages/my-orders.js` |
| `/order-details/` | `order-details/index.html` | `src/pages/order-details.js` |
| `/admin/` | `admin/index.html` | `src/pages/admin.js` |
| `/admin/products/` | `admin/products/index.html` | `src/pages/admin-products.js` |

Home is public. Login/Register route active authenticated users to their workspace.
Catalog, New Order, My Orders and Order Details require an active dealer; Admin
requires an active admin. Protected content stays hidden while account access
is checked. Order Details accepts `?id=<order-UUID>`; admin-wide order access
and management remain deferred.

## Production build and preview

```sh
npm run build
npm run preview
```

The build emits all nine HTML files and bundled local assets into `dist/`.
The preview serves that output at `http://127.0.0.1:4173/` and fails if the port
is already occupied. It does not run the development server or deploy anything.

With the preview running, use a second terminal:

```sh
npm run check:preview
```

This check verifies the exact emitted HTML file set, directly requests every route,
compares responses to their own built entries, checks linked routes/assets and asset
types, tests an order-details query URL, and confirms unknown routes return 404.
An alternate preview origin can be passed as `npm run check:preview -- http://127.0.0.1:4174`.

For a repeatable lockfile-based dependency installation, use `npm ci`.
Browser authentication verification is documented in [the 4B checks](docs/authentication-ui.md).
The opt-in `npm run test:auth-ui` suite uses real Supabase signup/login and isolated
Chrome contexts; it requires approved controlled fixture addresses/local state and
restores any temporary fixture role/status changes. Trace/video capture is disabled
to protect credentials.

For frontend-only catalog/draft validation, use `npm run test:draft` and the
separate opt-in `npm run test:catalog-ui` suite documented in the 5B results.
For submission, use `npm run test:submission` and the separate opt-in
`npm run test:submission-ui`; [6B instructions](docs/order-submission-ui.md)
describe the two retained synthetic orders and request manifest needed for reruns.
The historical 4B suite changes trusted fixture roles/status and is not required
for frontend-only regressions.

History checks use `npm run test:history` and the separate opt-in
`npm run test:history-ui`; see [7B test fixtures and actual results](docs/order-history-ui.md).

## Source organization

- `src/pages/`: one initialization module per HTML entry.
- `src/components/`: shared header and footer.
- `src/utils/`: shared page initialization and navigation helpers.
- `src/services/`: the reusable Supabase client, Auth/identity, products, order RPC and history reads.
- `src/draft/`: per-user local selections, estimates and shared draft UI.
- `src/orders/`: durable submission requests, retry coordination, saved-order validation and UI.
- `src/auth/`: guards, feedback, form submission and validation.
- `src/admin-products/`: product editor, validation, filtering and card/dialog rendering.
- `tests/`: opt-in real-browser authentication/security checks.
- `src/styles/`: shared Bootstrap overrides and responsive application styles.
- `public/`: static favicon, copied into the build.
- `scripts/`: production preview verification.
- `vite.config.js`: explicit multi-page build inputs and MPA serving mode.

See [the project brief](docs/project-brief.md) for full MVP scope and
[the implementation plan](docs/implementation-plan.md) for milestone order and
recorded acceptance checks. Dealer/order management, documents and final release
checks remain later milestones.

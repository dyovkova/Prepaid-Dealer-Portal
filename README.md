# Prepaid Dealer Portal

A SoftUni **Software Technologies with AI** capstone for prepaid dealer order requests.
Built with HTML, CSS, vanilla JavaScript ES modules, Bootstrap, Node.js, npm, and Vite.

## Current scope

Milestone 2 provides a genuine multi-page skeleton: eight independent HTML entries,
shared responsive navigation and footer, and clearly labelled placeholder screens.
Links perform normal document navigation; there is no SPA router or history fallback.

Milestone 4B provides working registration, login, logout, persistent Supabase
sessions, role-based navigation guards and inactive-account feedback. Account
roles/status come from database rows protected by the deployed 4A RLS policies.
Milestone 5B provides a live dealer catalog and editable local order draft.
Search active products, choose quantities and review current EUR estimates.
Drafts are scoped to the verified user, persist across refresh and clear on
logout. Prices are rechecked on draft load; no orders are submitted. Order
history, documents and admin-management actions remain placeholders. See
[5B results and limits](docs/catalog-and-draft.md).

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

Home is public. Login/Register route active authenticated users to their workspace.
Catalog, New Order and My Orders require an active dealer; Admin requires an active
admin. The Order Details placeholder allows both roles. Protected content stays
hidden while account access is checked. No order lookup or management is implemented.

## Production build and preview

```sh
npm run build
npm run preview
```

The build emits all eight HTML files and bundled local assets into `dist/`.
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
restores any temporary fixture role/status changes. Authentication forms are active;
order submission remains disabled. Trace/video capture is disabled to protect credentials.

For frontend-only catalog/draft validation, use `npm run test:draft` and the
separate opt-in `npm run test:catalog-ui` suite documented in the 5B results.
The historical 4B suite changes trusted fixture roles/status and is not a 5B check.

## Source organization

- `src/pages/`: one initialization module per HTML entry.
- `src/components/`: shared header and footer.
- `src/utils/`: shared page initialization and navigation helpers.
- `src/services/`: the reusable Supabase client and Auth/identity data access.
- `src/auth/`: guards, feedback, form submission and validation.
- `tests/`: opt-in real-browser authentication/security checks.
- `src/styles/`: shared Bootstrap overrides and responsive application styles.
- `public/`: static favicon, copied into the build.
- `scripts/`: production preview verification.
- `vite.config.js`: explicit multi-page build inputs and MPA serving mode.

See [the project brief](docs/project-brief.md) for full MVP scope and
[the implementation plan](docs/implementation-plan.md) for milestone order and
recorded acceptance checks. Business-data features and deployment remain later milestones.

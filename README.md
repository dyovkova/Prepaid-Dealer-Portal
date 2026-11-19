# Prepaid Dealer Portal

A SoftUni **Software Technologies with AI** capstone for prepaid dealer order requests.
Built with HTML, CSS, vanilla JavaScript ES modules, Bootstrap, Node.js, npm, and Vite.

## Current scope

Milestone 2 provides a genuine multi-page skeleton: eight independent HTML entries,
shared responsive navigation and footer, and clearly labelled placeholder screens.
Links perform normal document navigation; there is no SPA router or history fallback.

Authentication, Supabase, database resources, order logic, and admin operations are
not implemented. Forms and business-action buttons are disabled. All example product
content is synthetic, and no accounts, requests, or files are saved.

## Local setup

Use Node.js **22.12+ (22.x) or 24+** and the bundled npm. No environment variables
or external services are required for this milestone.

```sh
npm install
npm run dev
```

Open the Local URL printed by Vite (normally `http://127.0.0.1:5173/`).
On Windows PowerShell, if execution policy blocks `npm.ps1`, use `npm.cmd` in
place of `npm`, for example `npm.cmd install` and `npm.cmd run dev`.

The tracked `.env.example` contains only commented placeholders for future public
configuration. Do not put credentials in it. Local `.env` variants, dependencies,
and generated build output are ignored by Git. Client-visible configuration is not
an authorization boundary; future database and Storage access must enforce policies.

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

All routes are publicly viewable layout previews. The admin link does not provide
admin privileges or implement authorization. Separate admin management pages remain
in their later milestones.

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
For browser verification, visit every route directly, use the navigation and cross-page
links, and check the collapsed menu at a phone width. Confirm forms and business actions
remain disabled, keyboard focus is visible, and the pages have no horizontal overflow.

## Source organization

- `src/pages/`: one initialization module per HTML entry.
- `src/components/`: shared header and footer.
- `src/utils/`: shared page initialization and navigation helpers.
- `src/services/`: reserved for future data access; no service is connected yet.
- `src/styles/`: shared Bootstrap overrides and responsive application styles.
- `public/`: static favicon, copied into the build.
- `scripts/`: production preview verification.
- `vite.config.js`: explicit multi-page build inputs and MPA serving mode.

See [the project brief](docs/project-brief.md) for full MVP scope and
[the implementation plan](docs/implementation-plan.md) for milestone order and
recorded acceptance checks. Deployment and backend implementation belong to later milestones.

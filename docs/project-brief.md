# Prepaid Dealer Portal: project brief

## Purpose

A self-service portal for registered prepaid dealers to browse products, submit order requests, and track progress. Administrators maintain products and dealer access, process orders, and attach documents. This is a SoftUni "Software Technologies with AI" capstone using synthetic demo data only.

## Technology and delivery constraints

- HTML, CSS, vanilla JavaScript ES modules, and Bootstrap.
- Node.js, npm, and Vite for local development and multi-page production builds.
- Supabase PostgreSQL Database, Auth, and Storage.
- Git and a public GitHub repository; a live Netlify deployment.
- No React, Vue, or TypeScript.
- Versioned SQL migrations and reproducible setup documentation.

## Roles

| Visitor or role | Allowed behavior |
| --- | --- |
| Visitor | Register and log in; cannot access dealer or admin data. |
| Active dealer | Browse active products, submit orders, and read their organization's orders and associated documents. Requires an active profile and organization. |
| Inactive dealer | May authenticate, but cannot access portal business data or submit orders. Receives an account-inactive message. |
| Administrator | Manage products, view dealer profiles and activate/deactivate dealer access, manage all orders, and upload/download order documents. |

Each registration creates a new isolated dealer organization, a profile linked to the Auth user and that organization, and a fixed `dealer` role in `user_roles`. Signup metadata cannot select a role or join an existing organization. Admin provisioning and additional organization membership require trusted setup outside the public registration flow; no invitation or role-management UI is included. Profile and organization activation control access without deleting Supabase Auth users.

## MVP scope

- Register with email/password and basic dealer profile details; log in and log out using Supabase Auth.
- Enforce dealer/admin roles, organization membership, and profile/organization activation in the database through RLS and protected operations, in addition to UI navigation guards. Extend the same boundary to Storage in milestone 11.
- Display active products with SKU, name, description, and unit price in one configured demo currency.
- Let a dealer build an order request from one or more active products with positive whole-number quantities and an optional note.
- Validate current prices and products on submission; create the order and its items atomically. Save unit price snapshots so later product edits cannot change existing orders.
- Show the dealer organization's order history and individual order details, including items, total, and status. Members of the same organization share order visibility; profiles remain individually private except to admins.
- Allow admins to create/edit/archive products, create/edit/deactivate dealer organizations, inspect dealer profiles and activate/deactivate accounts, and inspect and process all orders. Role changes and membership reassignment remain outside the UI.
- Use statuses `submitted`, `processing`, `completed`, and `rejected`. New orders start as `submitted`; admins may move them to `processing` or `rejected`, then from `processing` to `completed` or `rejected`. Completed and rejected orders are terminal.
- In milestone 11, add `order_documents` and private Supabase Storage: admins upload synthetic PDFs, and active dealers download documents associated with their organization's orders. Define and enforce file size and type limits in that milestone.
- Provide responsive, accessible screens with basic validation and loading, empty, error, and success feedback.

Submitted orders are read-only for dealers. Product archival and dealer deactivation preserve historical records. Orders record requests only: completing a request does not represent payment, shipment, or prepaid credit activation.

## Planned screens

Each screen uses its own HTML entry page and URL; shared JavaScript modules support common layout and data access. This is a genuine multi-page application, not a single page with simulated routes.

1. Login.
2. Registration.
3. Product catalog and draft order selection.
4. Order review and submission.
5. Dealer order history.
6. Order details and documents, restricted by organization ownership or admin role.
7. Admin overview.
8. Admin product management.
9. Admin dealer management.
10. Admin order management.

## Accepted core data model

Milestone 3A accepts six core tables. See [the database design](database-design.md) for columns, relationships, permissions, protected operations, migration outline, and security tests, and [the implementation plan](implementation-plan.md) for delivery order.

| Table | Purpose and relationships |
| --- | --- |
| `dealers` | Dealer organizations with business name and active status; each organization can have multiple profiles and orders. |
| `profiles` | One profile per `auth.users` account; stores display name, organization membership, and account active status. |
| `user_roles` | One dealer/admin role per profile; protected from client role assignment. |
| `products` | Unique SKU, description, price, and archive/active state. |
| `orders` | References the owning organization and creating profile; stores status, note, request ID, and timestamps. |
| `order_items` | References `orders` and `products`; stores quantity and price/SKU/name snapshots. |

`order_documents` is a later addition in milestone 11, referencing an order and its uploading admin and storing private Storage path/file metadata. It is not part of the six core tables or milestone 3B.

Foreign keys, uniqueness, quantity/price checks, and delete restrictions protect consistency. Historical products and orders are retained. Totals are derived from saved line quantities and prices. The exact SQL and column definitions belong to the database milestone.

All six core tables require RLS. Dealers may read only their own profile/role and their active organization's business data; product reads are limited to active products. They cannot read another organization's orders/items, reassign membership, self-promote, or change account/organization activation. Admin permissions must be explicit. Order submission derives ownership, status, and prices in a trusted database transaction; direct client order/item writes are denied. Inactive accounts or organizations lose dealer business-data access. In milestone 11, `order_documents` RLS and private Storage policies enforce equivalent organization/role restrictions; use short-lived authorized download links and document that issued links may remain usable until expiry.

## Explicitly out of scope

- Real dealer/customer data, real financial documents, or production prepaid transactions.
- Payment processing, invoicing/tax calculation, credit balances, discounts, commissions, multiple currencies, or refunds.
- Inventory reservations, warehouses, shipping, fulfillment integrations, telecom APIs, or automatic prepaid activation.
- Bulk import/export, advanced search/reporting, analytics dashboards, and scheduled jobs.
- Dealer invitations/approval workflows, public admin signup, role editing in the UI, Auth account deletion, and password recovery UI.
- Dealer order editing/cancellation, order reopening, per-item fulfillment, and a complete audit-history system.
- Dealer document uploads, document editing/deletion workflows, email/SMS order notifications, and real-time updates.
- Product image uploads, localization, native mobile applications, and additional frontend frameworks.

## Capstone completion evidence

- At least five separately addressable, responsive screens in the deployed multi-page build.
- Six related core tables with migrations, constraints, RLS, and synthetic seed data; add order document metadata and private Storage in milestone 11.
- Demonstrated registration/login/logout and dealer/admin authorization, including denied unauthorized access.
- Working admin product, dealer, order, and document workflows.
- Admin file upload and authorized dealer file download.
- Public GitHub repository, working Netlify URL, and documented local setup, Supabase configuration, migration/seed steps, trusted admin setup, deployment, and demo walkthrough.

Milestones 1 and 2 supply the project guidance and eight-page UI skeleton; milestone 2's visual acceptance remains pending. Milestone 3A completes the accepted schema/access documentation only. Database tables, authentication, business workflows, and Storage are not implemented; later work follows the implementation plan.

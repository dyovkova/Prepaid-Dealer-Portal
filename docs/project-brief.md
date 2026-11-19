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
| Active dealer | Browse active products, submit orders, and read their own orders and associated documents. |
| Inactive dealer | May authenticate, but cannot access portal business data or submit orders. Receives an account-inactive message. |
| Administrator | Manage products, view dealer profiles and activate/deactivate dealer access, manage all orders, and upload/download order documents. |

Registration creates a dealer account. Admin provisioning is a documented trusted setup operation, outside the public registration flow. Dealer access status belongs to the portal profile; it does not require deleting or administratively editing Supabase Auth users from the browser.

## MVP scope

- Register with email/password and basic dealer profile details; log in and log out using Supabase Auth.
- Enforce dealer/admin roles and account status in the database and Storage, in addition to UI navigation guards.
- Display active products with SKU, name, description, and unit price in one configured demo currency.
- Let a dealer build an order request from one or more active products with positive whole-number quantities and an optional note.
- Validate current prices and products on submission; create the order and its items atomically. Save unit price snapshots so later product edits cannot change existing orders.
- Show the dealer's order history and individual order details, including items, total, status, and attached documents.
- Allow admins to create/edit/archive products, inspect dealer profiles and activate/deactivate dealer access, and inspect and process all orders.
- Use statuses `submitted`, `processing`, `completed`, and `rejected`. New orders start as `submitted`; admins may move them to `processing` or `rejected`, then from `processing` to `completed` or `rejected`. Completed and rejected orders are terminal.
- Allow admins to upload synthetic PDF documents to orders; active dealers can download documents belonging to their own orders. Store files privately and provide authorized downloads. Define and enforce file size and type limits in the documents milestone.
- Provide responsive, accessible screens with basic validation and loading, empty, error, and success feedback.

Submitted orders are read-only for dealers. Product archival and dealer deactivation preserve historical records. Orders record requests only: completing a request does not represent payment, shipment, or prepaid credit activation.

## Planned screens

Each screen uses its own HTML entry page and URL; shared JavaScript modules support common layout and data access. This is a genuine multi-page application, not a single page with simulated routes.

1. Login.
2. Registration.
3. Product catalog and draft order selection.
4. Order review and submission.
5. Dealer order history.
6. Order details and documents, restricted by ownership or admin role.
7. Admin overview.
8. Admin product management.
9. Admin dealer management.
10. Admin order management.

## Proposed related data model

| Table | Purpose and relationships |
| --- | --- |
| `profiles` | One portal profile per `auth.users` account; stores dealer display/business details, role, and active status. |
| `products` | Unique SKU, description, price, and archive/active state. |
| `orders` | References the requesting dealer's `profiles` row; stores status, note, and timestamps. |
| `order_items` | References `orders` and `products`; stores quantity and unit price snapshot. |
| `order_documents` | References `orders` and the uploading admin's `profiles` row; stores private Storage path and file metadata. |

Foreign keys, uniqueness, quantity/price checks, and delete restrictions protect consistency. Historical products and orders are retained. Totals are derived from saved line quantities and prices. The exact SQL and column definitions belong to the database milestone.

All five application tables require RLS. Dealers must not read another dealer's profile, orders, items, or documents, or change their own role/account status. Admin permissions must be explicit. Inactive accounts must lose business-data and file access. Storage must enforce equivalent ownership and role restrictions; a private bucket alone is insufficient. Use short-lived authorized download links, and document that already-issued links may remain usable until expiry.

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
- Five related tables with migrations, constraints, RLS, and synthetic seed data.
- Demonstrated registration/login/logout and dealer/admin authorization, including denied unauthorized access.
- Working admin product, dealer, order, and document workflows.
- Admin file upload and authorized dealer file download.
- Public GitHub repository, working Netlify URL, and documented local setup, Supabase configuration, migration/seed steps, trusted admin setup, deployment, and demo walkthrough.

This milestone supplies planning documents only. The proposed screens, tables, and workflows are not implemented yet.

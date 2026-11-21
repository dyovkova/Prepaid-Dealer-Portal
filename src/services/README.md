# Data services

`supabase.js` lazily creates the application's single Supabase client from the
public `.env.local` URL/publishable key. Supabase Auth owns session persistence,
refresh, registration, login and logout; there is no separate credential system.

`session.js` waits for the SDK's current session and supplies its JWT for each
protected database read. Identity/history reads also check the expected user.
A missing or changed session fails locally instead of allowing the SDK to fall
back to anonymous access. Tokens are never cached in shared headers. See
[the session fix and verification](../../docs/session-auth-fix.md).
Identity verification uses the same Supabase Auth `/user` endpoint and JWT as a
stateless read: a delayed rejection cannot sign out a newer SDK session. Auth
events trigger a current-session check; their payloads never delete drafts.

`auth.js` calls Auth and reads the caller's profile, database role and active
organization through existing RLS. Admins require an active profile, not dealer
organization access. Editable Auth metadata never grants permissions.

`products.js` performs SELECT-only active-product queries through the same
authenticated client/RLS, validates results and converts current EUR prices to
integer cents. An optional ID filter revalidates draft selections.

`orders.js` verifies the current Auth owner and calls only the existing
`submit_order` RPC, binding the attempt to that owner's JWT. It sends IDs,
quantities, note and request UUID, with no client prices/totals/ownership/status.

`order-history.js` uses authenticated SELECTs on orders with nested saved items,
an explicit organization filter and existing RLS. It reads 20 orders per page
plus one continuation row, or one UUID for details. It never queries products
or writes orders. Validation/totals come from saved snapshots, with exact cents
across the database numeric range. See [7B results](../../docs/order-history-ui.md).

`admin-products.js` uses the same session/JWT client for all-product reads and
8A-authorized create/edit/archive/reactivation. Only editable product columns
are sent; no DELETE exists. Zero affected rows fail explicitly. Shared product
validation, editor and card/dialog rendering live in `src/admin-products/`.

UI guards and form validation live in `src/auth/`. Local draft validation,
storage and UI helpers live in `src/draft/`. `src/orders/` owns durable requests,
cross-tab submission coordination, exact retries and confirmed cleanup; browser
state never authorizes orders. See [6B behavior and checks](../../docs/order-submission-ui.md).
History model/rendering helpers also live in `src/orders/`. Storage, dealer
management and order-processing services remain deferred.

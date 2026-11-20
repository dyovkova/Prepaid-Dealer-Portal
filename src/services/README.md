# Data services

`supabase.js` lazily creates the application's single Supabase client from the
public `.env.local` URL/publishable key. Supabase Auth owns session persistence,
refresh, registration, login and logout; there is no separate credential system.

`auth.js` calls Auth and reads the caller's profile, database role and active
organization through existing RLS. Admins require an active profile, not dealer
organization access. Editable Auth metadata never grants permissions.

`products.js` performs SELECT-only active-product queries through the same
authenticated client/RLS, validates results and converts current EUR prices to
integer cents. An optional ID filter revalidates draft selections.

UI guards and form validation live in `src/auth/`. Local draft validation,
storage and UI helpers live in `src/draft/`; browser state never authorizes
orders. No submission, Storage or admin-management service is implemented.

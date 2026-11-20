# Data services

`supabase.js` lazily creates the application's single Supabase client from the
public `.env.local` URL/publishable key. Supabase Auth owns session persistence,
refresh, registration, login and logout; there is no separate credential system.

`auth.js` calls Auth and reads the caller's profile, database role and active
organization through existing RLS. Admins require an active profile, not dealer
organization access. Editable Auth metadata never grants permissions.

UI guards/feedback and form validation live in `src/auth/`. No product, order,
Storage or admin-management service is implemented in milestone 4B.

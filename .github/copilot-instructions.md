# Prepaid Dealer Portal: Copilot instructions

Read [AGENTS.md](../AGENTS.md), the [project brief](../docs/project-brief.md), and the [implementation plan](../docs/implementation-plan.md) before working.

- Implement only the milestone requested by the user. Inspect the workspace and Git changes first; preserve existing user work.
- Use HTML, CSS, vanilla JavaScript ES modules, Bootstrap, Node.js, npm, Vite, and Supabase Database, Auth, and Storage. Do not introduce React, Vue, or TypeScript.
- Build a genuine multi-page application with separate HTML entry pages, shared modules, and responsive layouts. Keep modules small and organized by responsibility.
- Use only synthetic demo data. Never commit credentials, real dealer information, or privileged Supabase keys. Browser code may use only the public project URL and publishable/anon key; RLS must enforce access.
- Treat database policies and Storage policies as the authorization boundary. Hiding admin controls is not access control. Never trust browser-supplied roles, ownership, prices, or totals.
- Version schema, policies, constraints, and database functions in SQL migrations. Make registration default to the dealer role; provision admins only through a trusted process.
- Keep changes small and independently testable. Run applicable checks and review the diff before each commit. Report what actually ran; never invent tests, commits, or results.
- Update documentation when behavior or setup changes. Do not add dependencies or features outside the agreed milestone without a concrete need.

Milestones 4B, 4C, 5A, 5B, 6A, 6B and 7A are complete for the demo. Authentication, catalog/drafts, atomic submission and dealer organization SELECT-only order/item access are verified; see `supabase/order-read-access.md` and `docs/order-submission-ui.md`. Preserve all accounts, five migrations, twelve products, six existing orders/eleven items, later legitimate data and unrelated configuration edits. Temporary 7A activation/archive flags were restored. Do not rerun admin provisioning or delete data without authorization. Server ownership/status/prices come only from the RPC. Retain exact pending request UUIDs/payloads and drafts through ambiguous errors, refresh and logout; clear matching drafts only after confirmation. Cross-organization/inactive/anonymous/admin-wide order reads and direct writes remain denied, as do anonymous/inactive/admin dealer submissions. Do not start 7B history UI, Admin Panel, Storage or unrelated features until requested. Confirm Email remains temporarily disabled; confirmation-enabled delivery is untested. Commit/push only when requested; Auth settings or privileged Admin API creation require separate authorization.

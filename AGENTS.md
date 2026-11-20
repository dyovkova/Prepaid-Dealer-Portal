# Repository working agreement

## Project and source of truth

Prepaid Dealer Portal is a SoftUni "Software Technologies with AI" capstone. Use [docs/project-brief.md](docs/project-brief.md) for scope and [docs/implementation-plan.md](docs/implementation-plan.md) for milestone order and acceptance checks. The user's current instructions determine the work authorized for this session.

## Before changing files

- Inspect the workspace, relevant files, and `git status`/diff. Read applicable repository instructions.
- Identify the requested milestone and its acceptance criteria. Implement only that milestone.
- Preserve unrelated changes. Do not reset, discard, overwrite, or commit user work unintentionally.
- Resolve routine implementation choices with the simplest maintainable approach. Ask only when missing information materially blocks the requested work.

## Implementation conventions

- Stack: HTML, CSS, vanilla JavaScript ES modules, Bootstrap, Node.js, npm, Vite, Supabase Database/Auth/Storage, Git/GitHub, and Netlify.
- No React, Vue, or TypeScript. Use separate HTML entry pages for the multi-page application, with shared styles and modules.
- Keep page initialization, reusable UI, validation, and data access separate where useful. Avoid monolithic files and speculative abstractions.
- Use semantic HTML, accessible form labels, clear feedback, and responsive layouts.
- Make failure, loading, empty, and success states explicit when implementing a screen.

## Data and security

- Use synthetic demo data only, including files and screenshots. Never expose privileged credentials in source, browser code, logs, documentation, or commits.
- Store local configuration outside version control once configuration is introduced; example files contain placeholders only. A Supabase publishable/anon key is public configuration, not an authorization boundary.
- Enforce ownership, roles, account status, and allowed operations through database RLS, constraints, trusted database functions where needed, and Storage policies.
- Default new accounts to dealer. Never derive admin privileges from editable signup metadata or permit self-promotion.
- Never trust client-provided prices, totals, ownership, or order status. Order creation must validate products and save price snapshots atomically on the database side.
- Keep order documents in a private bucket and authorize upload and download against the associated order.
- Version database changes in SQL migrations. Do not use the dashboard as the only record of schema or policy changes.

## Verification and Git

- Work in small, independently testable milestones. Add meaningful verification appropriate to the change; do not create tests that merely mirror implementation.
- Run available relevant checks and inspect the diff before each commit. Check for secrets and unrelated changes.
- For authorization changes, verify both allowed actions and denied cross-account/role actions. UI checks alone are insufficient.
- Report checks actually performed, failures, and limitations accurately. Never fabricate results or commits.
- Do not commit, push, publish, or deploy unless requested. When a commit is requested, stage only intended files and use a descriptive message.
- Keep setup instructions and the implementation plan aligned with completed work. Mark milestones complete only after their acceptance criteria are met.

## Current boundary

Milestones 3B and 4A are complete for the current SoftUni demo configuration on PrepaidDealerPortal (`niabpabsvdgxackjjcsb`). Real public signup/login, isolated fixed-dealer provisioning, registered-user RLS, protected fields, inactive sessions, private API exclusion and database checks passed. Confirm Email is temporarily disabled by the user for the demo; confirmation-enabled delivery remains untested. Preserve both applied migrations, existing data, two active dealer fixtures and unrelated MCP/configuration edits. Catalog/orders/Storage stay default-deny. Do not start frontend authentication or milestone 4B until requested. Commit/push only when requested. Auth configuration changes or privileged Admin API account creation require separate explicit authorization.

# Recruitment Hub: authenticated shared database

Status: CODE PREPARED, NOT LIVE. The two sites will continue to use their current browser-only data until the database is configured. No user data is migrated automatically.

## 1. Create and secure Supabase

1. Create a private Supabase project for this workspace. Enable email/password sign-in.
2. Disable public/self-service signups. Require strong passwords, enable MFA for CSP users if available.
3. In Supabase SQL Editor, execute \`supabase/recruitment_hub.sql\`. This creates \`rh_members\`, \`rh_jobs\`, \`rh_history\`, read-only row-level security for active members, and an audited, optimistic-concurrency RPC.
4. Under Authentication > Users, invite the four CSPs, each with their own email account. Assign each Auth user's UUID to Rafal, Tanja, Daim, or Ivana in \`rh_members\` using the example SQL at the bottom of the migration.
5. In Project Settings / Connect, copy the project URL and **publishable/anon** API key. Never use the \`service_role\` or \`secret\` key in client-side code.
6. Edit \`assets/js/recruitment-cloud-config.js\` in both repos to include the project URL and publishable key. At that point the cloud login mode is enabled. The app no longer silently saves writes to separate local browser stores.
7. Configure Auth redirect URL allowlist for both \`https://www.rafalwilkai.com\` and \`https://gingerek.github.io\` origins if using recovery links, and set the site's canonical redirect URL in Supabase as appropriate.

## 2. Importing pre-existing data

The local browser contains any existing jobs/notes. **Before enabling cloud mode**, open Recruitment Hub on the browser holding the data, choose Backup JSON, and keep that backup safe. All original notes and edits are included. After configuring the backend, sign in as admin in that same browser and use the dedicated \`Import local workspace\` action. It is permitted only when the server job table is empty. This avoids overwriting another user's shared data.

## 3. Collaboration and security

- All active team members can view/edit each CSP job, regardless of its owner.
- Editor identity is derived from an authenticated Supabase user and membership table, not the editable \`Editing as\` dropdown.
- The server records UTC timestamps, verified editor names and every successful job write. Each job uses an incrementing version to prevent silent overwrites when two team members edit the same job.
- New/edited notes live in job records, and history rows are stored separately. Supplier Update CSV/PDF continue to omit notes, history and candidate details.
- Direct INSERT/UPDATE/DELETE from browser roles is denied. Writes go through \`rh_apply_change\`.
- A failed write or version conflict is **not** reported as saved. The interface offers JSON backup for unsynced changes.
- For high-assurance organizations, add verified SSO/MFA, audit retention policy, GDPR DPIA, data processing agreement and backups before adding real candidate personal information.

## 4. Testing

Verify in two different browsers with different invited CSP accounts: create a job as Rafal, edit it as Tanja, append a note as Daim and edit that note as Ivana. Confirm the same data is shown after refresh on both sites, and that actor names come from authenticated membership. Verify stale-version conflicts and that an uninvited user gets no access.

This repository does not contain private user passwords, secret credentials, or a production-ready Supabase project. No backend can be activated until a project owner completes the connection and membership setup.

# Recruitment Hub: authenticated shared database

Status: CODE PREPARED, NOT LIVE. The two sites will continue to use their current browser-only data until the database is configured. No user data is migrated automatically.

## 1. Create and secure Supabase

1. Create a private Supabase project for this workspace. Enable email/password sign-in.
2. Disable public/self-service signups. Require strong passwords, enable MFA for CSP users if available.
3. In Supabase SQL Editor, execute `supabase/recruitment_hub.sql`. This creates `rh_members`, `rh_jobs`, `rh_history`, read-only row-level security for active members, and an audited, optimistic-concurrency RPC.
4. Under Authentication > Users, invite the four CSPs, each with their own email account. Assign each Auth user's UUID to Rafal, Tanja, Daim, or Ivana in `rh_members` using the example SQL at the bottom of the migration.
5. In Project Settings / Connect, copy the project URL and **publishable/anon** API key. Never use the `service_role` or `secret` key in client-side code.
6. Edit `assets/js/recruitment-cloud-config.js` in both repos to include the project URL and publishable key. At that point the cloud login mode is enabled. The app no longer silently saves writes to separate local browser stores.
7. Configure Auth redirect URL allowlist for both `https://www.rafalwilkai.com` and `https://gingerek.github.io` origins if using recovery links, and set the site's canonical redirect URL in Supabase as appropriate.

## 2. Importing pre-existing data

The local browser contains any existing jobs/notes. **Before enabling cloud mode**, open Recruitment Hub on the browser holding the data, choose Backup JSON, and keep that backup safe. All original notes and edits are included. After configuring the backend, sign in as admin and use **Import local workspace into cloud** on the same browser and website origin, or **Import saved JSON backup into cloud** to upload a backup from another browser/domain. Import is permitted only when the shared database is empty, so teammates' records are not overwritten. Per-job notes and prior note revisions are transferred. The old browser-only Activity history remains in the original JSON backup, not in the verified server audit log.

## 3. Collaboration and security

- All active team members can view/edit each CSP job, regardless of its owner.
- Editor identity is derived from an authenticated Supabase user and membership table, not the editable `Editing as` dropdown.
- The server records UTC timestamps, verified editor names and every successful job write. Each job uses an incrementing version to prevent silent overwrites when two team members edit the same job.
- New/edited notes live in job records, and history rows are stored separately. Supplier Update CSV/PDF continue to omit notes, history and candidate details.
- Direct INSERT/UPDATE/DELETE from browser roles is denied. Writes go through `rh_apply_change`.
- A failed write or version conflict is **not** reported as saved. The interface offers JSON backup for unsynced changes.
- For high-assurance organizations, add verified SSO/MFA, audit retention policy, GDPR DPIA, data processing agreement and backups before adding real candidate personal information.

## 4. Testing

Verify in two different browsers with different invited CSP accounts: create a job as Rafal, edit it as Tanja, append a note as Daim and edit that note as Ivana. Confirm the same data is shown after refresh on both sites, and that actor names come from authenticated membership. Verify stale-version conflicts and that an uninvited user gets no access.

This repository does not contain private user passwords, secret credentials, or a production-ready Supabase project. No backend can be activated until a project owner completes the connection and membership setup.

## 5. Password setup and recovery

Invited users can click **Set or reset account password** in the sign-in screen. Supabase sends an email with a secure link to choose a password (12+ characters). Add both full callback URLs to the Auth redirect allowlist: `https://www.rafalwilkai.com/modules/recruitment-hub.html` and `https://gingerek.github.io/rafal-wilk-ai/modules/recruitment-hub.html`. Configure SMTP to deliver invitations and password reset emails reliably. Choose an EU project region for candidate data and confirm the organization's data protection requirements before production use.

## 6. Weekly Saturday archive (enabled in browser; cloud scheduler requires setup)
Recruitment Hub now keeps newly completed jobs (Filled, Closed, Canceled) on their CSP card for at least 168 hours. They move to Closed on the first Saturday at 12:00 Europe/Amsterdam after that eligibility threshold. Daylight saving changes are handled. Rejected records retain their existing archive behavior, and old already-archived completed jobs remain in Closed.

**Current local-only deployment:** The module checks the weekly archive when opened and every 60 seconds while it stays open. It catches up overdue records on the next visit. Because each origin/browser has its own localStorage, no scheduled operation can run on a switched-off device or archive another device's local jobs. The two sites do not automatically share data in local mode.

**To enable true unattended, shared scheduling:** Create the private Supabase project, execute the base supabase/recruitment_hub.sql, then execute supabase/recruitment_weekly_archive.sql from the SQL Editor as the project administrator. Enable pg_cron if prompted. Configure assets/js/recruitment-cloud-config.js on both websites with the project's public URL and publishable/anon key. Invite CSP users and securely migrate existing job data as described above. Check the named job rh-saturday-noon-archive under Supabase Cron and verify a test run plus its audit log. This script evaluates eligibility every minute in the database, so it archives at Saturday 12:00 Amsterdam time even if nobody opens the browser, and catches up following interruptions. It marks the archive in the shared record; it does not delete jobs.

Do not consider the server-side scheduler live until the Supabase project is actually configured and its cron job reports successful runs. No Supabase credentials or production connection are stored in these repositories.

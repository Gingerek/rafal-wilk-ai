-- Recruitment Hub: Saturday 12:00 Europe/Amsterdam weekly archive.
-- Run AFTER supabase/recruitment_hub.sql in the same Supabase project.
-- Completed statuses stay on CSP cards for at least 168 hours, until the
-- first Saturday at 12:00 Europe/Amsterdam. Legacy completed jobs with
-- no finalizedAt remain archived (no retroactive moves).
-- The minute scheduler catches up safely if the database was briefly offline.

-- System audit events do not have an authenticated human actor.
alter table public.rh_history alter column actor_id drop not null;

create or replace function public.rh_archive_due_jobs()
returns integer
language plpgsql
security definer
set search_path = ''
as $archive$
declare
  v_job record;
  v_now timestamptz := clock_timestamp();
  v_eligible_local timestamp;
  v_saturday date;
  v_run_local timestamp;
  v_due_at timestamptz;
  v_count integer := 0;
begin
  for v_job in
    select job_id, data from public.rh_jobs
    where data->>'status' in ('Filled','Closed','Canceled')
      and coalesce(data->>'finalizedAt','') <> ''
      and coalesce(data->>'archivedAt','') = ''
    for update skip locked
  loop
    begin
      v_eligible_local :=
        ((v_job.data->>'finalizedAt')::timestamptz + interval '168 hours')
        at time zone 'Europe/Amsterdam';
    exception
      when invalid_datetime_format or datetime_field_overflow then
        continue;
    end;
    v_saturday := v_eligible_local::date +
      ((6 - extract(dow from v_eligible_local)::integer + 7) % 7);
    v_run_local := v_saturday::timestamp + interval '12 hours';
    if v_run_local < v_eligible_local then
      v_run_local := v_run_local + interval '7 days';
    end if;
    v_due_at := v_run_local at time zone 'Europe/Amsterdam';
    if v_due_at > v_now then
      continue;
    end if;

    update public.rh_jobs
      set data = jsonb_set(data,'{archivedAt}',to_jsonb(v_now),true),
          version = version + 1,
          updated_at = v_now,
          updated_by = null
      where job_id = v_job.job_id;

    insert into public.rh_history
      (job_id,job_number,owner_name,actor_id,actor_name,action,details,created_at)
    values
      (v_job.job_id,coalesce(v_job.data->>'number',''),
       coalesce(v_job.data->>'owner',''),null,'System automation',
       'Archived',
       'Moved to Closed after 7 full days; first Saturday 12:00 Europe/Amsterdam',
       v_now);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$archive$;

-- Don't permit a browser user to invoke the privileged scheduled function.
revoke all on function public.rh_archive_due_jobs() from public, anon, authenticated;

-- Supabase Cron: one-minute trigger, due time calculated in Amsterdam
-- timezone inside the function, including daylight-saving changes.
-- Calling it frequently provides catch-up after interruptions and is
-- idempotent: archived records are skipped.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule(
  'rh-saturday-noon-archive',
  '* * * * *',
  'select public.rh_archive_due_jobs();'
);

-- Verify scheduler status in the Supabase Cron dashboard.
-- Optional safe manual dry check after enabling (no change before due):
-- select public.rh_archive_due_jobs();

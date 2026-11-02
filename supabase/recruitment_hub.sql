-- Recruitment Hub: shared CSP workspace (Supabase, PostgreSQL)
-- Run once in the project's SQL Editor as its administrator.
-- Keep email signup DISABLED; invite users manually under Authentication.
-- Members are assigned by the administrator, NEVER from browser-supplied metadata.

create table if not exists public.rh_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  csp_name text not null check (csp_name in ('Rafal','Tanja','Daim','Ivana')),
  role text not null default 'editor' check (role in ('admin','editor')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.rh_jobs (
  job_id text primary key check (char_length(job_id) between 1 and 128),
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  version bigint not null default 1 check (version > 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create table if not exists public.rh_history (
  id bigint generated always as identity primary key,
  job_id text not null,
  job_number text not null default '',
  owner_name text not null default '',
  actor_id uuid not null references auth.users(id),
  actor_name text not null,
  action text not null,
  details text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists rh_history_newest on public.rh_history(created_at desc);
create index if not exists rh_history_job on public.rh_history(job_id,created_at desc);

alter table public.rh_members enable row level security;
alter table public.rh_jobs enable row level security;
alter table public.rh_history enable row level security;

drop policy if exists rh_members_self on public.rh_members;
create policy rh_members_self on public.rh_members for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists rh_jobs_team_read on public.rh_jobs;
create policy rh_jobs_team_read on public.rh_jobs for select to authenticated
  using (exists (select 1 from public.rh_members m
    where m.user_id = (select auth.uid()) and m.active = true));

drop policy if exists rh_history_team_read on public.rh_history;
create policy rh_history_team_read on public.rh_history for select to authenticated
  using (exists (select 1 from public.rh_members m
    where m.user_id = (select auth.uid()) and m.active = true));

-- No browser can write a job or falsify audit logs with direct table access.
revoke all on public.rh_members, public.rh_jobs, public.rh_history from public, anon, authenticated;
grant select on public.rh_members, public.rh_jobs, public.rh_history to authenticated;
revoke all on sequence public.rh_history_id_seq from public, anon, authenticated;

create or replace function public.rh_apply_change(
  p_job_id text,
  p_data jsonb,
  p_expected_version bigint,
  p_action text default 'Updated',
  p_details text default ''
) returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_now timestamptz := clock_timestamp();
  v_old_data jsonb;
  v_new_data jsonb;
  v_version bigint;
  v_action text;
  v_number text;
  v_owner text;
begin
  select m.csp_name into v_name
    from public.rh_members m
    where m.user_id = (select auth.uid()) and m.active = true;
  if v_name is null then
    raise exception 'NOT_AUTHORIZED: an active CSP membership is required'
      using errcode = '42501';
  end if;

  if p_job_id is null or char_length(p_job_id) not between 1 and 128
    or p_expected_version is null or p_expected_version < 0 then
    raise exception 'INVALID_JOB_ID_OR_VERSION' using errcode = '22023';
  end if;
  if char_length(coalesce(p_details,'')) > 12000 then
    raise exception 'DETAIL_TOO_LARGE' using errcode = '22023';
  end if;

  if p_data is not null then
    if jsonb_typeof(p_data) <> 'object'
       or p_data->>'id' is distinct from p_job_id
       or p_data->>'owner' not in ('Rafal','Tanja','Daim','Ivana')
       or coalesce(char_length(p_data->>'number'),0) = 0
       or coalesce(char_length(p_data->>'title'),0) = 0
       or pg_catalog.octet_length(p_data::text) > 1000000 then
      raise exception 'INVALID_JOB_DATA' using errcode = '22023';
    end if;
    -- Server-verified editor and timestamp, not browser-submitted metadata.
    v_new_data := pg_catalog.jsonb_set(
      pg_catalog.jsonb_set(p_data,'{lastEditedBy}', pg_catalog.to_jsonb(v_name),true),
      '{lastEditedAt}',pg_catalog.to_jsonb(v_now),true);
  end if;

  if p_expected_version = 0 and p_data is not null then
    insert into public.rh_jobs(job_id,data,version,updated_at,updated_by)
      values(p_job_id,v_new_data,1,v_now,(select auth.uid()))
      on conflict do nothing
      returning version into v_version;
    if v_version is null then
      raise exception 'VERSION_CONFLICT: job already exists' using errcode = '40001';
    end if;
    v_action := 'Created';
    v_number := coalesce(v_new_data->>'number','');
    v_owner := coalesce(v_new_data->>'owner','');
  elsif p_expected_version > 0 and p_data is not null then
    update public.rh_jobs
       set data=v_new_data,version=version+1,updated_at=v_now,updated_by=(select auth.uid())
     where job_id=p_job_id and version=p_expected_version
     returning version into v_version;
    if v_version is null then
      raise exception 'VERSION_CONFLICT: this job was edited by another CSP' using errcode = '40001';
    end if;
    v_action := left(coalesce(nullif(p_action,''),'Updated'),80);
    v_number := coalesce(v_new_data->>'number','');
    v_owner := coalesce(v_new_data->>'owner','');
  elsif p_expected_version > 0 and p_data is null then
    delete from public.rh_jobs where job_id=p_job_id and version=p_expected_version
      returning data into v_old_data;
    if v_old_data is null then
      raise exception 'VERSION_CONFLICT: job already changed or deleted' using errcode = '40001';
    end if;
    v_action := 'Deleted';
    v_number := coalesce(v_old_data->>'number','');
    v_owner := coalesce(v_old_data->>'owner','');
    v_version := -1;
  else
    raise exception 'INVALID_OPERATION' using errcode = '22023';
  end if;

  insert into public.rh_history(job_id,job_number,owner_name,actor_id,actor_name,action,details,created_at)
  values(p_job_id,v_number,v_owner,(select auth.uid()),v_name,v_action,
         left(coalesce(p_details,''),12000),v_now);
  return v_version;
end;
$$;

revoke all on function public.rh_apply_change(text,jsonb,bigint,text,text)
  from public, anon, authenticated;
grant execute on function public.rh_apply_change(text,jsonb,bigint,text,text)
  to authenticated;

-- After inviting each colleague and creating their Auth user in the Dashboard,
-- assign the real auth.users UUID (not an email or a name from JavaScript):
--
-- insert into public.rh_members(user_id,csp_name,role)
-- values
--  ('<UUID_OF_RAFAL>','Rafal','admin'),
--  ('<UUID_OF_TANJA>','Tanja','editor'),
--  ('<UUID_OF_DAIM>','Daim','editor'),
--  ('<UUID_OF_IVANA>','Ivana','editor')
-- on conflict(user_id) do update set
--  csp_name=excluded.csp_name,role=excluded.role,active=true;
--
-- Do not publish service_role/secret API keys.

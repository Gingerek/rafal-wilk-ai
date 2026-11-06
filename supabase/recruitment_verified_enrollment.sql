-- Recruitment Hub verified account bootstrap and one-time team invitations.
-- Only the verified organization-owner email can claim the initial admin role.
-- Every other CSP needs a single-use, randomly generated, expiring invitation.
create unique index if not exists rh_members_one_account_per_csp
  on public.rh_members(csp_name);

create schema if not exists rh_private;
revoke all on schema rh_private from public, anon, authenticated;
create table if not exists rh_private.rh_invites (
  token uuid primary key default pg_catalog.gen_random_uuid(),
  csp_name text not null check (csp_name in ('Tanja','Daim','Ivana')),
  created_at timestamptz not null default pg_catalog.now(),
  expires_at timestamptz not null default (pg_catalog.now() + interval '14 days'),
  claimed_by uuid unique references auth.users(id),
  claimed_at timestamptz
);
revoke all on rh_private.rh_invites from public, anon, authenticated;

create or replace function public.rh_claim_owner()
returns boolean language plpgsql security definer set search_path = ''
as $f$
declare
  v_user uuid := auth.uid();
  v_email text;
  v_verified timestamptz;
begin
  if v_user is null then return false; end if;
  select lower(email), email_confirmed_at into v_email,v_verified
    from auth.users where id = v_user;
  if v_email <> 'rafalw898@gmail.com' or v_verified is null then return false; end if;
  perform pg_catalog.pg_advisory_xact_lock(804635202);
  if exists(select 1 from public.rh_members where user_id=v_user and active=true and csp_name='Rafal' and role='admin') then
    return true;
  end if;
  if exists(select 1 from public.rh_members) then return false; end if;
  insert into public.rh_members(user_id,csp_name,role,active)
  values(v_user,'Rafal','admin',true);
  return true;
end;
$f$;

create or replace function public.rh_create_invite(p_csp_name text)
returns uuid language plpgsql security definer set search_path = ''
as $f$
declare v_token uuid;
begin
  if not exists(
    select 1 from public.rh_members m
      where m.user_id=auth.uid() and m.active=true and m.role='admin'
  ) then raise exception 'ADMIN_ONLY' using errcode='42501'; end if;
  if p_csp_name not in ('Tanja','Daim','Ivana') then
    raise exception 'INVALID_CSP' using errcode='22023';
  end if;
  if exists(select 1 from public.rh_members m where m.csp_name=p_csp_name and m.active=true) then
    raise exception 'CSP_ALREADY_REGISTERED' using errcode='23505';
  end if;
  insert into rh_private.rh_invites(csp_name) values(p_csp_name)
    returning token into v_token;
  return v_token;
end;
$f$;

create or replace function public.rh_claim_invite(p_code text)
returns boolean language plpgsql security definer set search_path = ''
as $f$
declare
  v_user uuid := auth.uid();
  v_verified timestamptz;
  v_name text;
begin
  if v_user is null then return false; end if;
  select email_confirmed_at into v_verified from auth.users where id=v_user;
  if v_verified is null then return false; end if;
  if p_code is null or p_code !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return false;
  end if;
  update rh_private.rh_invites
    set claimed_by=v_user, claimed_at=pg_catalog.now()
    where token=p_code::uuid and claimed_by is null and expires_at>pg_catalog.now()
    returning csp_name into v_name;
  if v_name is null then return false; end if;
  insert into public.rh_members(user_id,csp_name,role,active)
    values(v_user,v_name,'editor',true);
  return true;
end;
$f$;

revoke all on function public.rh_claim_owner() from public,anon,authenticated;
revoke all on function public.rh_create_invite(text) from public,anon,authenticated;
revoke all on function public.rh_claim_invite(text) from public,anon,authenticated;
grant execute on function public.rh_claim_owner() to authenticated;
grant execute on function public.rh_create_invite(text) to authenticated;
grant execute on function public.rh_claim_invite(text) to authenticated;

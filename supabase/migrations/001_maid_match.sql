begin;
-- Independent names: safe to install beside Quotient. Never revokes another app's grants.
create table public.mm_organizations(id uuid primary key default gen_random_uuid(),name text not null check(length(name) between 2 and 80),brief jsonb not null default '{}',version integer not null default 1,plan text not null default 'starter' check(plan in ('starter','pro')),subscription_status text not null default 'trial' check(subscription_status in ('trial','active','trialing','past_due','unpaid','paused','incomplete','incomplete_expired','canceled','none')),trial_end timestamptz not null default now()+interval '14 days',stripe_customer_id text unique,stripe_subscription_id text unique,period_start timestamptz,period_end timestamptz,cancel_at_period_end boolean not null default false,billing_synced_at timestamptz,created_at timestamptz not null default now());
create table public.mm_memberships(organization_id uuid references public.mm_organizations on delete cascade,user_id uuid references auth.users on delete cascade,role text not null check(role in ('owner','member')),primary key(organization_id,user_id));
create unique index mm_one_owner on public.mm_memberships(organization_id) where role='owner';
create index mm_membership_user on public.mm_memberships(user_id);
-- Imported by service_role after explicit consent. No fabricated verification flags or public contact details.
create table public.mm_maids(id uuid primary key default gen_random_uuid(),name text not null check(length(name) between 2 and 80),location text not null,rate numeric not null check(rate>0),currency text not null check(currency in ('USD','PKR','AED')),skills text[] not null,languages text[] not null default '{}',days text[] not null,hours integer not null check(hours between 1 and 16),arrangement text not null check(arrangement in ('live-in','live-out')),experience integer not null check(experience between 0 and 60),bio text not null check(length(bio)<=1500),available boolean not null default true,consent boolean not null default false,created_at timestamptz not null default now());
create table public.mm_saved(organization_id uuid references public.mm_organizations on delete cascade,maid_id uuid references public.mm_maids on delete cascade,status text not null default 'saved' check(status in ('saved','interview','hired','closed')),interview_at timestamptz,note text not null default '' check(length(note)<=2000),version integer not null default 1,updated_at timestamptz not null default now(),primary key(organization_id,maid_id));
create index mm_saved_interviews on public.mm_saved(organization_id,interview_at) where status='interview';
create table public.mm_audit(id uuid primary key default gen_random_uuid(),organization_id uuid references public.mm_organizations on delete cascade,actor uuid references auth.users on delete set null,event text not null,created_at timestamptz not null default now());
create index mm_audit_recent on public.mm_audit(organization_id,created_at desc);
create table public.mm_invitations(id uuid primary key default gen_random_uuid(),organization_id uuid references public.mm_organizations on delete cascade,email text not null,token_hash text not null unique,expires_at timestamptz not null default now()+interval '7 days',accepted_at timestamptz,revoked boolean not null default false,created_at timestamptz not null default now());
create table public.mm_ai_usage(organization_id uuid references public.mm_organizations on delete cascade,day date not null,used integer not null check(used>=0),primary key(organization_id,day));
create table public.mm_billing_locks(organization_id uuid primary key references public.mm_organizations on delete cascade,token uuid not null,expires_at timestamptz not null);
create table public.mm_stripe_events(id text primary key,organization_id uuid references public.mm_organizations on delete cascade,created_at timestamptz not null default now());
create function public.mm_member(org uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.mm_memberships where organization_id=org and user_id=auth.uid())$$;
create function public.mm_owner(org uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.mm_memberships where organization_id=org and user_id=auth.uid() and role='owner')$$;
create function public.mm_entitled(o public.mm_organizations) returns boolean language sql stable set search_path='' as $$select (o.stripe_subscription_id is null and o.subscription_status='trial' and o.trial_end>now()) or (o.subscription_status in ('active','trialing') and o.period_end>now())$$;
create function public.mm_require(org uuid,owner_only boolean default false,paid boolean default true) returns public.mm_organizations language plpgsql security definer set search_path='' as $$declare o public.mm_organizations;begin
 if auth.uid() is null or not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then raise exception 'Sign in with a verified email';end if;
 if not public.mm_member(org) or (owner_only and not public.mm_owner(org)) then raise exception 'Only authorized family members can do this';end if;
 select * into o from public.mm_organizations where id=org for update;
 if paid and not public.mm_entitled(o) then raise exception 'Your plan expired. The owner can renew in Billing.';end if;return o;end$$;
create function public.mm_mutate(m jsonb) returns jsonb language plpgsql security definer set search_path='' as $$declare
 org uuid; o public.mm_organizations; action text:=m->>'action'; target uuid; b jsonb; s public.mm_saved; inv public.mm_invitations; c integer; result jsonb:='{}';
 begin
 if auth.uid() is null or not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then raise exception 'Sign in with a verified email';end if;
 if action='create' then
 perform pg_advisory_xact_lock(hashtext(auth.uid()::text));
 if (select count(*) from public.mm_memberships where user_id=auth.uid() and role='owner')>=5 then raise exception 'Family workspace limit reached';end if;
 if length(trim(m->>'name')) not between 2 and 80 then raise exception 'Family name must be 2 to 80 characters';end if;
 insert into public.mm_organizations(name) values(trim(m->>'name')) returning * into o;
 insert into public.mm_memberships values(o.id,auth.uid(),'owner');org:=o.id;result:=jsonb_build_object('organization',org);
 elsif action='accept' then
 select * into inv from public.mm_invitations where token_hash=m->>'token_hash' for update;
 if not found or inv.revoked or inv.accepted_at is not null or inv.expires_at<=now() or inv.email is distinct from lower((select email from auth.users where id=auth.uid())) then raise exception 'Invitation invalid, expired, or belongs to another email';end if;
 org:=inv.organization_id;select * into o from public.mm_organizations where id=org for update;
 if not public.mm_entitled(o) then raise exception 'This family plan has expired';end if;
 if not public.mm_member(org) then
 if (select count(*) from public.mm_memberships where organization_id=org)>=(case o.plan when 'pro' then 10 else 3 end) then raise exception 'Family member limit reached';end if;
 insert into public.mm_memberships values(org,auth.uid(),'member');end if;
 update public.mm_invitations set accepted_at=now() where id=inv.id;result:=jsonb_build_object('organization',org);
 else
 org:=(m->>'organization')::uuid;o:=public.mm_require(org,action in ('invite','revoke','remove'),action not in ('revoke','remove','delete'));
 if action='brief' then
 b:=m->'brief';
 if b is null or not b ?& array['location','budget','currency','hours','householdSize','arrangement','skills','schedule','languages','startDate'] or exists(select 1 from jsonb_each(b) x where x.value='null'::jsonb) then raise exception 'Missing household fields';end if;
 if jsonb_typeof(b->'budget')<>'number' or jsonb_typeof(b->'hours')<>'number' or jsonb_typeof(b->'householdSize')<>'number' or jsonb_typeof(b->'currency')<>'string' or jsonb_typeof(b->'arrangement')<>'string' then raise exception 'Invalid household field types';end if;
 if (b->>'hours')::numeric<>trunc((b->>'hours')::numeric) or (b->>'householdSize')::numeric<>trunc((b->>'householdSize')::numeric) then raise exception 'Whole numbers required';end if;
 if jsonb_typeof(b->'startDate')<>'string' or (b->>'startDate'<>'' and (b->>'startDate' !~ '^\d{4}-\d{2}-\d{2}$' or (b->>'startDate')::date is null)) then raise exception 'Invalid start date';end if;

 if jsonb_typeof(b) is distinct from 'object' or jsonb_typeof(b->'location') is distinct from 'string' or length(trim(b->>'location')) not between 1 and 100 or (b->>'budget')::numeric<=0 or (b->>'budget')::numeric>10000000 or b->>'currency' not in ('USD','PKR','AED') or (b->>'hours')::integer not between 1 and 16 or (b->>'householdSize')::integer not between 1 and 30 or b->>'arrangement' not in ('live-in','live-out') or jsonb_typeof(b->'skills') is distinct from 'array' or jsonb_array_length(b->'skills') not between 1 and 6 or jsonb_typeof(b->'schedule') is distinct from 'array' or jsonb_array_length(b->'schedule') not between 1 and 7 or jsonb_typeof(b->'languages') is distinct from 'array' or jsonb_array_length(b->'languages')>5 then raise exception 'Invalid household requirements';end if;
 if exists(select 1 from jsonb_array_elements_text(b->'skills') v where v not in ('Cleaning','Cooking','Laundry','Childcare','Elderly assistance','Pet care')) or exists(select 1 from jsonb_array_elements_text(b->'schedule') v where v not in ('Mon','Tue','Wed','Thu','Fri','Sat','Sun')) then raise exception 'Invalid skills or schedule';end if;
 if exists(select 1 from jsonb_array_elements(b->'languages') v where jsonb_typeof(v)<>'string' or length(trim(v#>>'{}')) not between 1 and 40) or (select count(*) from jsonb_array_elements(b->'skills'))<>(select count(distinct v) from jsonb_array_elements(b->'skills') v) or (select count(*) from jsonb_array_elements(b->'schedule'))<>(select count(distinct v) from jsonb_array_elements(b->'schedule') v) then raise exception 'Invalid duplicate preferences or languages';end if;
 if o.version is distinct from (m->>'version')::integer then raise exception 'Household changed. Reload before saving';end if;
 update public.mm_organizations set brief=b,version=version+1 where id=org;
 elsif action in ('save','update','delete') then
 target:=(m->>'maid')::uuid;
 select * into s from public.mm_saved where organization_id=org and maid_id=target;
 if action='delete' then delete from public.mm_saved where organization_id=org and maid_id=target;
 elsif action='save' then
 if not exists(select 1 from public.mm_maids where id=target and consent and available) then raise exception 'Maid profile unavailable';end if;
 if s.maid_id is null then
 if (select count(*) from public.mm_saved where organization_id=org)>=(case o.plan when 'pro' then 100 else 20 end) then raise exception 'Saved match limit reached';end if;
 insert into public.mm_saved(organization_id,maid_id) values(org,target);end if;
 else
 if s.maid_id is null or s.version is distinct from (m->>'version')::integer then raise exception 'Saved match changed. Reload before saving';end if;
 if m->>'status' is null or m->>'status' not in ('saved','interview','hired','closed') or length(m->>'note')>2000 then raise exception 'Invalid match update';end if;
 if m->>'status'='interview' and ((m->>'interview_at') is null or (m->>'interview_at')::timestamptz<=now()) then raise exception 'Choose a future interview time';end if;
 update public.mm_saved set status=m->>'status',note=coalesce(m->>'note',''),interview_at=case when m->>'status'='interview' then (m->>'interview_at')::timestamptz else null end,version=version+1,updated_at=now() where organization_id=org and maid_id=target;
 end if;
 elsif action='invite' then
 if m->>'email' is null or length(m->>'email')>254 or m->>'email' !~ '^[^ @]+@[^ @]+\.[^ @]+$' or m->>'token_hash' !~ '^[a-f0-9]{64}$' then raise exception 'Invalid invitation';end if;
 if (select count(*) from public.mm_memberships where organization_id=org)+(select count(*) from public.mm_invitations where organization_id=org and not revoked and accepted_at is null and expires_at>now()) >= (case o.plan when 'pro' then 10 else 3 end) then raise exception 'Family invitation limit reached';end if;
 insert into public.mm_invitations(organization_id,email,token_hash) values(org,lower(m->>'email'),m->>'token_hash');
 elsif action='revoke' then update public.mm_invitations set revoked=true where organization_id=org and id=(m->>'invitation')::uuid;
 elsif action='remove' then delete from public.mm_memberships where organization_id=org and user_id=(m->>'user')::uuid and role='member';
 else raise exception 'Unknown action';end if;
 end if;
 insert into public.mm_audit(organization_id,actor,event) values(org,auth.uid(),action);return result;
 end$$;
create function public.mm_reserve_ai(org uuid) returns void language plpgsql security definer set search_path='' as $$declare o public.mm_organizations; n integer;begin
 o:=public.mm_require(org);insert into public.mm_ai_usage values(org,(now() at time zone 'UTC')::date,0) on conflict do nothing;
 update public.mm_ai_usage set used=used+1 where organization_id=org and day=(now() at time zone 'UTC')::date and used<(case o.plan when 'pro' then 25 else 5 end) returning used into n;
 if n is null then raise exception 'Daily AI limit reached';end if;
 insert into public.mm_audit(organization_id,actor,event) values(org,auth.uid(),'ai.explanation');end$$;
create function public.mm_billing_lease(org uuid,lease uuid) returns boolean language plpgsql security definer set search_path='' as $$declare n integer;begin
 insert into public.mm_billing_locks values(org,lease,clock_timestamp()+interval '120 seconds') on conflict(organization_id) do update set token=excluded.token,expires_at=excluded.expires_at where mm_billing_locks.expires_at<clock_timestamp();get diagnostics n=row_count;return n=1;end$$;
create function public.mm_set_customer(org uuid,lease uuid,customer text) returns void language plpgsql security definer set search_path='' as $$begin
 perform 1 from public.mm_billing_locks where organization_id=org and token=lease and expires_at>clock_timestamp() for update;if not found then raise exception 'Billing lease expired';end if;
 update public.mm_organizations set stripe_customer_id=customer where id=org and (stripe_customer_id is null or stripe_customer_id=customer);if not found then raise exception 'Stripe customer mismatch';end if;end$$;
create function public.mm_sync_billing(org uuid,lease uuid,event_id text,customer text,subscription text,new_plan text,new_status text,start_at timestamptz,end_at timestamptz,cancel_pending boolean) returns void language plpgsql security definer set search_path='' as $$declare o public.mm_organizations;begin
 perform 1 from public.mm_billing_locks where organization_id=org and token=lease and expires_at>clock_timestamp() for update;if not found then raise exception 'Billing lease expired';end if;
 select * into strict o from public.mm_organizations where id=org for update;
 if o.stripe_customer_id is distinct from customer then raise exception 'Stripe customer mismatch';end if;
 if exists(select 1 from public.mm_stripe_events where id=event_id and organization_id=org) then return;end if;
 if new_plan not in ('starter','pro') or new_status not in ('active','trialing','past_due','unpaid','paused','incomplete','incomplete_expired','canceled','none') or (subscription is not null and (end_at is null or start_at is null or end_at<=start_at)) then raise exception 'Invalid billing state';end if;
 update public.mm_organizations set stripe_subscription_id=subscription,plan=new_plan,subscription_status=new_status,period_start=start_at,period_end=end_at,cancel_at_period_end=cancel_pending,billing_synced_at=now() where id=org;
 insert into public.mm_stripe_events(id,organization_id) values(event_id,org);insert into public.mm_audit(organization_id,event) values(org,'billing.reconciled');end$$;
do $$declare t text;begin foreach t in array array['mm_organizations','mm_memberships','mm_maids','mm_saved','mm_audit','mm_invitations','mm_ai_usage','mm_billing_locks','mm_stripe_events'] loop
 execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from anon,authenticated',t);execute format('grant all on public.%I to service_role',t);end loop;end$$;
grant select on public.mm_organizations,public.mm_memberships,public.mm_maids,public.mm_saved,public.mm_audit,public.mm_invitations,public.mm_ai_usage to authenticated;
create policy mm_org_read on public.mm_organizations for select to authenticated using(public.mm_member(id));
create policy mm_members_read on public.mm_memberships for select to authenticated using(public.mm_member(organization_id));
create policy mm_maids_read on public.mm_maids for select to authenticated using(consent and available and exists(select 1 from public.mm_memberships where user_id=auth.uid()));
create policy mm_saved_read on public.mm_saved for select to authenticated using(public.mm_member(organization_id));
create policy mm_audit_read on public.mm_audit for select to authenticated using(public.mm_member(organization_id));
create policy mm_invite_read on public.mm_invitations for select to authenticated using(public.mm_owner(organization_id));
create policy mm_usage_read on public.mm_ai_usage for select to authenticated using(public.mm_member(organization_id));
-- Revoke only Maid-Match functions, preserving other apps on a shared project.
do $$declare f record;begin for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on p.pronamespace=n.oid where n.nspname='public' and p.proname like 'mm\_%' escape '\' loop execute format('revoke all on function %s from public,anon,authenticated',f.signature);execute format('grant execute on function %s to service_role',f.signature);end loop;end$$;
grant execute on function public.mm_member(uuid),public.mm_owner(uuid),public.mm_mutate(jsonb),public.mm_reserve_ai(uuid) to authenticated;
commit;

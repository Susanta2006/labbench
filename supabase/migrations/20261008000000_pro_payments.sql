create table if not exists public.razorpay_orders (
  order_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount integer not null,
  currency text not null,
  paid_at timestamptz
);

create table if not exists public.pro_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_daily_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null default (now() at time zone 'utc')::date,
  used integer not null default 0 check (used >= 0),
  primary key (user_id, usage_date)
);

alter table public.razorpay_orders enable row level security;
alter table public.pro_entitlements enable row level security;
alter table public.ai_daily_usage enable row level security;
grant all on public.razorpay_orders, public.pro_entitlements, public.ai_daily_usage to service_role;

create policy "Users can read their own Pro status" on public.pro_entitlements
  for select to authenticated using (auth.uid() = user_id);
create policy "Users can read their own AI usage" on public.ai_daily_usage
  for select to authenticated using (auth.uid() = user_id);
revoke all on public.razorpay_orders, public.pro_entitlements, public.ai_daily_usage from anon, authenticated;
grant select on public.pro_entitlements, public.ai_daily_usage to authenticated;

create or replace function public.grant_pro_from_payment(p_order_id text, p_payment_id text, p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_expires timestamptz;
begin
  update public.razorpay_orders set paid_at = now()
  where order_id = p_order_id and user_id = p_user_id and paid_at is null;
  if not found then
    if exists (select 1 from public.razorpay_orders where order_id = p_order_id and user_id = p_user_id and paid_at is not null) then return; end if;
    raise exception 'Invalid or already claimed order';
  end if;
  select greatest(expires_at, now()) + interval '1 month' into v_expires
  from public.pro_entitlements where user_id = p_user_id for update;
  if v_expires is null then v_expires := now() + interval '1 month'; end if;
  insert into public.pro_entitlements(user_id, expires_at, updated_at)
  values (p_user_id, v_expires, now())
  on conflict (user_id) do update set expires_at = excluded.expires_at, updated_at = now();
end;
$$;
revoke all on function public.grant_pro_from_payment(text, text, uuid) from public, anon, authenticated;
grant execute on function public.grant_pro_from_payment(text, text, uuid) to service_role;

create or replace function public.consume_ai_credit(p_user_id uuid)
returns table(allowed boolean, remaining integer) language plpgsql security definer set search_path = '' as $$
declare v_used integer;
begin
  if exists (select 1 from public.pro_entitlements where user_id = p_user_id and expires_at > now()) then
    return query select true, -1; return;
  end if;
  insert into public.ai_daily_usage(user_id, usage_date, used) values (p_user_id, (now() at time zone 'utc')::date, 0)
  on conflict (user_id, usage_date) do nothing;
  update public.ai_daily_usage set used = used + 1
  where user_id = p_user_id and usage_date = (now() at time zone 'utc')::date and used < 5 returning used into v_used;
  if v_used is null then
    select used into v_used from public.ai_daily_usage where user_id = p_user_id and usage_date = (now() at time zone 'utc')::date;
    return query select false, greatest(0, 5 - v_used);
  else
    return query select true, greatest(0, 5 - v_used);
  end if;
end;
$$;
revoke all on function public.consume_ai_credit(uuid) from public, anon, authenticated;
grant execute on function public.consume_ai_credit(uuid) to service_role;

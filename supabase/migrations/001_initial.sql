-- LocalRank: Initial Schema
-- Run in Supabase SQL Editor or via supabase db push

-- ─── Profiles (extends auth.users) ───
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text not null,
  full_name     text,
  avatar_url    text,
  stripe_customer_id    text unique,
  stripe_subscription_id text,
  stripe_subscription_status text,
  plan          text not null default 'free',  -- 'free' | 'pro'
  scans_used_this_month  int not null default 0,
  scans_limit   int not null default 3,
  scans_reset_at timestamptz default date_trunc('month', now()),
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- Auto-create profile on user signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─── Scans ───
create table if not exists public.scans (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references public.profiles(id) on delete cascade,
  place_url       text not null,
  place_name      text,
  place_address   text,
  score           int,
  grade           text,
  scan_data       jsonb,      -- full category breakdown
  pdf_generated   boolean default false,
  pdf_url         text,
  created_at      timestamptz default now()
);

-- ─── Stripe Checkout Sessions ───
create table if not exists public.checkout_sessions (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid references public.profiles(id) on delete set null,
  stripe_session_id     text unique not null,
  stripe_subscription_id text,
  plan                  text not null,    -- 'report_payg' | 'pro_monthly' | 'pro_yearly'
  amount_cents          int,
  currency              text default 'gbp',
  status                text not null default 'pending',
  metadata              jsonb,
  created_at            timestamptz default now()
);

-- ─── Row Level Security ───
alter table public.profiles enable row level security;
alter table public.scans enable row level security;
alter table public.checkout_sessions enable row level security;

-- profiles: users own their row; service role can read all
create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- scans: users own their scans
create policy "Users can read own scans"
  on public.scans for select
  using (auth.uid() = user_id);

create policy "Users can insert own scans"
  on public.scans for insert
  with check (auth.uid() = user_id);

create policy "Service role can read/write scans"
  on public.scans for all
  using (auth.role() = 'service_role');

-- checkout_sessions: no direct client access (only via edge functions)
-- service role can do everything
create policy "Service role full access"
  on public.checkout_sessions for all
  using (auth.role() = 'service_role');

-- ─── Indexes ───
create index if not exists scans_user_id_idx    on public.scans(user_id);
create index if not exists scans_created_at_idx  on public.scans(created_at desc);
create index if not exists checkout_sessions_user_id_idx on public.checkout_sessions(user_id);
create index if not exists checkout_sessions_stripe_id_idx on public.checkout_sessions(stripe_session_id);
create index if not exists profiles_stripe_customer_idx on public.profiles(stripe_customer_id);

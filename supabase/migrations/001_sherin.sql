-- ═══════════════════════════════════════════════════════════
-- SHERIN SCHEMA
-- ═══════════════════════════════════════════════════════════
--
-- Single-user creative workspace. The owner email is
-- enforced in the app layer, but RLS still scopes every row
-- to the authenticated user that created it. Includes
-- per-owner storage-quota tracking (storage_bytes) and retry
-- scheduling (retry_not_before). Provider resume identifiers are stored
-- outside user-editable metadata and managed by the service-role worker.

-- ───────────────────────────────────────────────────────────
-- EXTENSION
-- ───────────────────────────────────────────────────────────

create extension if not exists "pgcrypto";

-- ───────────────────────────────────────────────────────────
-- TABLE
-- ───────────────────────────────────────────────────────────

create table if not exists public.generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'succeeded', 'failed', 'unavailable')),
  inference_provider text not null check (inference_provider in ('alibaba-cloud', 'babysea')),
  provider_generation_id text
    check (
      provider_generation_id is null
      or char_length(provider_generation_id) between 1 and 255
    ),
  storage_provider text not null check (storage_provider in ('aws-s3', 'backblaze-b2', 'cloudflare-r2', 'supabase-storage', 'vercel-blob')),
  metadata jsonb not null default '{}'::jsonb,
  error text,
  storage_bytes bigint not null default 0 check (storage_bytes >= 0),
  retry_not_before timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.generations enable row level security;

-- Keep only one queued/running generation per owner.
lock table public.generations in share row exclusive mode;

with ranked_active_generations as (
  select
    id,
    row_number() over (partition by user_id order by created_at desc, id desc) as active_rank
  from public.generations
  where status in ('queued', 'running')
)
update public.generations
set
  status = 'failed',
  error = coalesce(error, 'Superseded by a newer active generation.'),
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'sherin_stage', 'failed',
    'sherin_failed_stage', 'database',
    'sherin_error', coalesce(error, 'Superseded by a newer active generation.'),
    'sherin_failed_at', now()
  )
where id in (
  select id
  from ranked_active_generations
  where active_rank > 1
);

-- ───────────────────────────────────────────────────────────
-- INDEX
-- ───────────────────────────────────────────────────────────

create index if not exists generations_user_created_at_idx
  on public.generations (user_id, created_at desc);

create index if not exists generations_user_status_idx
  on public.generations (user_id, status);

create index if not exists generations_provider_generation_id_idx
  on public.generations (inference_provider, provider_generation_id)
  where provider_generation_id is not null;

create index if not exists generations_metadata_gin_idx
  on public.generations using gin (metadata jsonb_path_ops);

create index if not exists generations_user_storage_bytes_idx
  on public.generations (user_id, storage_bytes)
  where storage_bytes > 0;

create index if not exists generations_user_retry_not_before_idx
  on public.generations (user_id, retry_not_before, created_at)
  where status = 'queued';

create unique index if not exists generations_one_active_per_user_idx
  on public.generations (user_id)
  where status in ('queued', 'running');

create index if not exists generations_user_active_updated_at_idx
  on public.generations (user_id, updated_at)
  where status in ('queued', 'running');

-- ───────────────────────────────────────────────────────────
-- FUNCTION
-- ───────────────────────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.protect_generation_provider_state()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    if tg_op = 'INSERT' and new.provider_generation_id is not null then
      raise exception 'provider_generation_id is managed by Sherin';
    end if;

    if tg_op = 'UPDATE' and new.provider_generation_id is distinct from old.provider_generation_id then
      raise exception 'provider_generation_id is managed by Sherin';
    end if;
  end if;

  return new;
end;
$$;

-- ───────────────────────────────────────────────────────────
-- TRIGGER
-- ───────────────────────────────────────────────────────────

drop trigger if exists set_generations_updated_at on public.generations;
create trigger set_generations_updated_at
  before update on public.generations
  for each row execute function public.set_updated_at();

drop trigger if exists protect_generations_provider_state on public.generations;
create trigger protect_generations_provider_state
  before insert or update of provider_generation_id on public.generations
  for each row execute function public.protect_generation_provider_state();

-- ───────────────────────────────────────────────────────────
-- POLICY
-- ───────────────────────────────────────────────────────────

drop policy if exists "owner reads own generations" on public.generations;
create policy "owner reads own generations"
  on public.generations
  for select
  using (auth.uid() = user_id);

drop policy if exists "owner inserts own generations" on public.generations;
create policy "owner inserts own generations"
  on public.generations
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "owner updates own generations" on public.generations;
create policy "owner updates own generations"
  on public.generations
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "owner deletes own generations" on public.generations;
create policy "owner deletes own generations"
  on public.generations
  for delete
  using (auth.uid() = user_id);

-- ───────────────────────────────────────────────────────────
-- STORAGE
-- ───────────────────────────────────────────────────────────
--
-- Private storage bucket. The supabase-storage adapter writes
-- signed URLs at read time, so generated assets never become
-- public unless the owner chooses a different storage provider.

insert into storage.buckets (id, name, public)
values ('sherin-generations', 'sherin-generations', false)
on conflict (id) do update set public = excluded.public;

drop policy if exists "owner reads sherin storage" on storage.objects;
create policy "owner reads sherin storage"
  on storage.objects
  for select
  using (
    bucket_id = 'sherin-generations'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "owner writes sherin storage" on storage.objects;
create policy "owner writes sherin storage"
  on storage.objects
  for insert
  with check (
    bucket_id = 'sherin-generations'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "owner deletes sherin storage" on storage.objects;
create policy "owner deletes sherin storage"
  on storage.objects
  for delete
  using (
    bucket_id = 'sherin-generations'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
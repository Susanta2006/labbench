-- Large guest uploads are private and are addressed only by random server-issued IDs.
create table if not exists public.temporary_uploads (
  id uuid primary key default gen_random_uuid(),
  object_path text not null unique,
  file_name text not null,
  mime_type text not null default 'application/octet-stream',
  file_size bigint not null check (file_size > 0 and file_size <= 52428800),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

alter table public.temporary_uploads enable row level security;
revoke all on public.temporary_uploads from anon, authenticated;
grant all on public.temporary_uploads to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('labbench-temporary-uploads', 'labbench-temporary-uploads', false, 52428800, null)
on conflict (id) do update set public = false, file_size_limit = 52428800, allowed_mime_types = null;

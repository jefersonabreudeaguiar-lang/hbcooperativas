-- Tokens de recuperação de senha (cooperados)
create table if not exists public.password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.app_users(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  ip text,
  created_at timestamptz not null default now()
);

create unique index if not exists password_reset_tokens_hash_idx on public.password_reset_tokens (token_hash);
create index if not exists password_reset_tokens_user_idx on public.password_reset_tokens (user_id);
create index if not exists password_reset_tokens_expires_idx on public.password_reset_tokens (expires_at);

alter table public.password_reset_tokens enable row level security;

drop policy if exists password_reset_tokens_service_only on public.password_reset_tokens;
create policy password_reset_tokens_service_only on public.password_reset_tokens
  for all
  to service_role
  using (true)
  with check (true);

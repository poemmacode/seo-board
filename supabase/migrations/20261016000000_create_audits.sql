-- SEOBoard · Módulo 1: Auditoría On-Page
-- Aplicar desde el SQL Editor del dashboard o con: supabase db push

create table if not exists public.audits (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  domain text not null,
  status_code int not null,
  response_time_ms double precision not null,
  canonical_url text null,
  is_redirect boolean not null default false,
  redirect_url text null,
  title text null,
  title_length int not null default 0,
  description text null,
  description_length int not null default 0,
  robots_meta text null,
  viewport_meta text null,
  open_graph jsonb not null default '{}'::jsonb,
  headings jsonb not null default '[]'::jsonb,
  headings_summary jsonb not null default '{}'::jsonb,
  images_summary jsonb not null default '{}'::jsonb,
  links_summary jsonb not null default '{}'::jsonb,
  structured_data jsonb not null default '{}'::jsonb,
  content_stats jsonb not null default '{}'::jsonb,
  issues jsonb not null default '[]'::jsonb,
  ai_analysis jsonb null,
  created_at timestamptz not null default now()
);

create index if not exists audits_url_idx on public.audits (url);
create index if not exists audits_domain_idx on public.audits (domain);
create index if not exists audits_created_at_idx on public.audits (created_at desc);

-- RLS activado. Política permisiva porque SEOBoard es una suite interna
-- monousuario sin Auth: todo el acceso pasa por los Route Handlers del
-- servidor (las keys publicables nunca exponen más que esta tabla).
-- Si en el futuro añades Supabase Auth multiusuario, sustituye esta
-- política por reglas por usuario (auth.uid()).
alter table public.audits enable row level security;

drop policy if exists "internal_full_access" on public.audits;
create policy "internal_full_access"
  on public.audits
  for all
  to anon, authenticated
  using (true)
  with check (true);

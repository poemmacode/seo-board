-- SEOBoard · Proyectos por dominio
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  domain text unique not null,
  root_domain text not null,
  audits_count int not null default 0,
  last_score int null,
  last_audit_at timestamptz null,
  created_at timestamptz not null default now()
);
create index if not exists projects_root_domain_idx on public.projects (root_domain);
alter table public.audits
  add column if not exists project_id uuid null references public.projects(id) on delete set null;
create index if not exists audits_project_id_idx on public.audits (project_id);
alter table public.projects enable row level security;
drop policy if exists "internal_full_access" on public.projects;
create policy "internal_full_access"
  on public.projects
  for all
  to anon, authenticated
  using (true)
  with check (true);

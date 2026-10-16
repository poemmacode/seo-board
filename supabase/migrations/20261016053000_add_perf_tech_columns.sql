-- SEOBoard · CWV + tech: columnas de resúmenes en audits
alter table public.audits
  add column if not exists perf_summary jsonb null,
  add column if not exists tech_summary jsonb not null default '{}'::jsonb,
  add column if not exists crawl_summary jsonb not null default '{}'::jsonb;

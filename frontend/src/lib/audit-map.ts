import type { AuditRow } from "./supabase";
import type { AuditResponse, AuditSummary } from "./types";
import { calculateScoreFromCounts } from "./score";

export function rowToResponse(row: AuditRow): AuditResponse {
  return {
    id: row.id,
    url: row.url,
    domain: row.domain,
    status_code: row.status_code,
    response_time_ms: row.response_time_ms,
    canonical_url: row.canonical_url,
    is_redirect: row.is_redirect,
    redirect_url: row.redirect_url,
    title: row.title,
    title_length: row.title_length ?? 0,
    description: row.description,
    description_length: row.description_length ?? 0,
    robots_meta: row.robots_meta,
    viewport_meta: row.viewport_meta,
    open_graph: row.open_graph ?? {},
    headings: row.headings ?? [],
    headings_summary: row.headings_summary,
    images_summary: row.images_summary,
    links_summary: row.links_summary,
    structured_data: row.structured_data,
    content_stats: row.content_stats,
    issues: row.issues ?? [],
    ai_analysis: row.ai_analysis,
    tech_summary: row.tech_summary ?? {
      is_https: false,
      redirected_to_https: false,
      analytics: [],
      schema_types: [],
      hreflang: [],
    },
    crawl_summary: row.crawl_summary ?? {
      robots: { found: false, allows_page: null, blocks_ai_bots: [], ai_bots_allowed: [], sitemaps_declared: [] },
      sitemap: { checked: false, sitemap_url: null, url_included: null, urls_count: null },
      indexability: { verdict: "indexable", reasons: [] },
      ai_readiness: { ready: false, notes: [] },
    },
    perf_summary: row.perf_summary ?? null,
    project_id: row.project_id ?? null,
    project_slug: null,
    created_at: row.created_at,
  };
}

export function rowToSummary(row: AuditRow): AuditSummary {
  const issues = row.issues ?? [];
  const critical = issues.filter((i) => i.severity === "critical").length;
  const warning = issues.filter((i) => i.severity === "warning").length;
  return {
    id: row.id,
    url: row.url,
    domain: row.domain,
    status_code: row.status_code,
    response_time_ms: row.response_time_ms,
    title: row.title,
    word_count: row.content_stats?.word_count ?? 0,
    score: calculateScoreFromCounts(critical, warning).score,
    issues_critical_count: critical,
    issues_warning_count: warning,
    has_ai_analysis: Boolean(row.ai_analysis),
    created_at: row.created_at,
  };
}

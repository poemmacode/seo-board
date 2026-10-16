import type { AuditRow } from "./supabase";
import type { AuditResponse, AuditSummary } from "./types";

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
    created_at: row.created_at,
  };
}

export function rowToSummary(row: AuditRow): AuditSummary {
  const issues = row.issues ?? [];
  return {
    id: row.id,
    url: row.url,
    domain: row.domain,
    status_code: row.status_code,
    response_time_ms: row.response_time_ms,
    title: row.title,
    word_count: row.content_stats?.word_count ?? 0,
    issues_critical_count: issues.filter((i) => i.severity === "critical").length,
    issues_warning_count: issues.filter((i) => i.severity === "warning").length,
    has_ai_analysis: Boolean(row.ai_analysis),
    created_at: row.created_at,
  };
}

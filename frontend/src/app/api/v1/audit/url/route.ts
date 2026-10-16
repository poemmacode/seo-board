import { NextResponse } from "next/server";
import { fetchAndExtract, CrawlerException } from "@/lib/crawler";
import { analyzeAudit } from "@/lib/ai";
import { fetchPerfSummary, perfIssues } from "@/lib/perf";
import { analyzeCrawlability } from "@/lib/crawlability";
import { calculateScoreFromCounts } from "@/lib/score";
import { upsertProject, updateProjectStats } from "@/lib/projects";
import { getSupabase, type AuditRow } from "@/lib/supabase";
import { rowToResponse } from "@/lib/audit-map";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    return await runAudit(req);
  } catch (e) {
    console.error("[audit/url]", e);
    return NextResponse.json(
      { detail: "Error interno al auditar. Revisa los logs del servidor." },
      { status: 500 }
    );
  }
}

async function runAudit(req: Request) {
  let body: { url?: string; include_ai?: boolean };
  try {
    body = (await req.json()) as { url?: string; include_ai?: boolean };
  } catch {
    return NextResponse.json({ detail: "Cuerpo JSON inválido." }, { status: 400 });
  }

  const rawUrl = (body.url ?? "").trim();
  if (!rawUrl) {
    return NextResponse.json({ detail: "La URL es obligatoria." }, { status: 422 });
  }
  const includeAi = body.include_ai ?? true;

  // 1. Crawling on-demand
  let data;
  try {
    data = await fetchAndExtract(rawUrl);
  } catch (e) {
    if (e instanceof CrawlerException) {
      return NextResponse.json({ detail: e.message }, { status: 502 });
    }
    throw e;
  }

  const isNoindex = (data.robots_meta ?? "").toLowerCase().includes("noindex");

  // 2. CWV (PageSpeed) + crawleabilidad + IA en paralelo. Nada de esto bloquea la auditoría.
  const [perf, crawl, aiAnalysis] = await Promise.all([
    fetchPerfSummary(data.url),
    analyzeCrawlability({
      pageUrl: data.url,
      isNoindex,
      canonicalUrl: data.canonical_url,
      schemaTypes: data.structured_data.detected_types,
      wordCount: data.content_stats.word_count,
    }),
    includeAi
      ? analyzeAudit({
          url: data.url,
          title: data.title,
          description: data.description,
          headings: data.headings,
          contentSnippet: data.content_stats.text_snippet,
          wordCount: data.content_stats.word_count,
        }).catch(() => null)
      : Promise.resolve(null),
  ]);

  const issues = [...data.issues, ...perfIssues(perf), ...crawl.issues];
  const critical = issues.filter((i) => i.severity === "critical").length;
  const warning = issues.filter((i) => i.severity === "warning").length;
  const score = calculateScoreFromCounts(critical, warning).score;

  // 3. Proyecto por dominio + persistencia en Supabase
  const supabase = getSupabase();
  const project = await upsertProject(supabase, data.url);

  const rawLower = rawUrl.toLowerCase();
  const finalLower = data.url.toLowerCase();
  const techSummary = {
    is_https: finalLower.startsWith("https://"),
    redirected_to_https:
      (rawLower.startsWith("http://") || !/^[a-z]+:\/\//.test(rawLower)) &&
      finalLower.startsWith("https://") &&
      data.is_redirect,
    analytics: data.analytics_summary.detected,
    schema_types: data.structured_data.detected_types,
    hreflang: data.hreflang,
    local: {
      has_local_presence: data.local_presence.has_local_presence,
      signals: data.local_presence.signals,
    },
  };

  const { data: row, error } = await supabase
    .from("audits")
    .insert({
      url: data.url,
      domain: data.domain,
      status_code: data.status_code,
      response_time_ms: data.response_time_ms,
      canonical_url: data.canonical_url,
      is_redirect: data.is_redirect,
      redirect_url: data.redirect_url,
      title: data.title,
      title_length: data.title_length,
      description: data.description,
      description_length: data.description_length,
      robots_meta: data.robots_meta,
      viewport_meta: data.viewport_meta,
      open_graph: data.open_graph,
      headings: data.headings,
      headings_summary: data.headings_summary,
      images_summary: data.images_summary,
      links_summary: data.links_summary,
      structured_data: data.structured_data,
      content_stats: data.content_stats,
      issues,
      ai_analysis: aiAnalysis,
      tech_summary: techSummary,
      crawl_summary: crawl.summary,
      perf_summary: perf,
      project_id: project?.id ?? null,
    })
    .select()
    .single();

  if (error || !row) {
    return NextResponse.json(
      { detail: `No se pudo persistir la auditoría: ${error?.message ?? "error desconocido"}` },
      { status: 500 }
    );
  }

  if (project) await updateProjectStats(supabase, project.id, score);

  return NextResponse.json(
    { ...rowToResponse(row as AuditRow), project_slug: project?.slug ?? null },
    { status: 201 }
  );
}

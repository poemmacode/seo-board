import { NextResponse } from "next/server";
import { fetchAndExtract, CrawlerException } from "@/lib/crawler";
import { analyzeAudit } from "@/lib/ai";
import { getSupabase, type AuditRow } from "@/lib/supabase";
import { rowToResponse } from "@/lib/audit-map";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
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

  // 2. Capa IA opcional (nunca bloquea la auditoría si falla)
  let aiAnalysis: AuditRow["ai_analysis"] = null;
  if (includeAi) {
    try {
      aiAnalysis = await analyzeAudit({
        url: data.url,
        title: data.title,
        description: data.description,
        headings: data.headings,
        contentSnippet: data.content_stats.text_snippet,
        wordCount: data.content_stats.word_count,
      });
    } catch {
      aiAnalysis = null;
    }
  }

  // 3. Persistencia en Supabase
  const supabase = getSupabase();
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
      issues: data.issues,
      ai_analysis: aiAnalysis,
    })
    .select()
    .single();

  if (error || !row) {
    return NextResponse.json(
      { detail: `No se pudo persistir la auditoría: ${error?.message ?? "error desconocido"}` },
      { status: 500 }
    );
  }

  return NextResponse.json(rowToResponse(row as AuditRow), { status: 201 });
}

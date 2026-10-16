import { NextResponse } from "next/server";
import { analyzeAudit } from "@/lib/ai";
import { getSupabase, type AuditRow } from "@/lib/supabase";
import { rowToResponse } from "@/lib/audit-map";
import { resolveLocale, localeFromRequest } from "@/lib/locale";
import { srv, fill } from "@/lib/srv";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Params {
  params: { id: string };
}

export async function POST(req: Request, { params }: Params) {
  const fallback = localeFromRequest(req);
  let locale = fallback;
  try {
    const body = (await req.json()) as { locale?: string };
    locale = resolveLocale(body?.locale ?? fallback);
  } catch {
    /* empty body: keep header locale */
  }
  const A = srv(locale).api;
  const supabase = getSupabase();
  const { data: existing, error } = await supabase
    .from("audits")
    .select("*")
    .eq("id", params.id)
    .single();

  if (error || !existing) {
    return NextResponse.json({ detail: A.notFound }, { status: 404 });
  }
  const row = existing as AuditRow;

  const aiAnalysis = await analyzeAudit(
    {
      url: row.url,
      title: row.title,
      description: row.description,
      headings: row.headings ?? [],
      contentSnippet: row.content_stats?.text_snippet ?? "",
      wordCount: row.content_stats?.word_count ?? 0,
    },
    locale
  );

  const { data: updated, error: updateError } = await supabase
    .from("audits")
    .update({ ai_analysis: aiAnalysis })
    .eq("id", params.id)
    .select()
    .single();

  if (updateError || !updated) {
    return NextResponse.json(
      { detail: fill(A.aiSaveFail, { err: updateError?.message ?? "?" }) },
      { status: 500 }
    );
  }

  return NextResponse.json(rowToResponse(updated as AuditRow));
}

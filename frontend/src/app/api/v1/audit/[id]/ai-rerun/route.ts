import { NextResponse } from "next/server";
import { analyzeAudit } from "@/lib/ai";
import { getSupabase, type AuditRow } from "@/lib/supabase";
import { rowToResponse } from "@/lib/audit-map";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Params {
  params: { id: string };
}

export async function POST(_req: Request, { params }: Params) {
  const supabase = getSupabase();
  const { data: existing, error } = await supabase
    .from("audits")
    .select("*")
    .eq("id", params.id)
    .single();

  if (error || !existing) {
    return NextResponse.json({ detail: "Auditoría no encontrada." }, { status: 404 });
  }
  const row = existing as AuditRow;

  const aiAnalysis = await analyzeAudit({
    url: row.url,
    title: row.title,
    description: row.description,
    headings: row.headings ?? [],
    contentSnippet: row.content_stats?.text_snippet ?? "",
    wordCount: row.content_stats?.word_count ?? 0,
  });

  const { data: updated, error: updateError } = await supabase
    .from("audits")
    .update({ ai_analysis: aiAnalysis })
    .eq("id", params.id)
    .select()
    .single();

  if (updateError || !updated) {
    return NextResponse.json(
      { detail: `No se pudo guardar el análisis: ${updateError?.message ?? "error desconocido"}` },
      { status: 500 }
    );
  }

  return NextResponse.json(rowToResponse(updated as AuditRow));
}

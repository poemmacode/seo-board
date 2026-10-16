import { NextResponse } from "next/server";
import { getSupabase, type AuditRow } from "@/lib/supabase";
import { rowToResponse } from "@/lib/audit-map";
import { calculateScoreFromCounts } from "@/lib/score";
import { localeFromRequest } from "@/lib/locale";
import { srv, fill } from "@/lib/srv";

export const dynamic = "force-dynamic";

interface Params {
  params: { id: string };
}

export async function GET(req: Request, { params }: Params) {
  const A = srv(localeFromRequest(req)).api;
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("audits")
    .select("*")
    .eq("id", params.id)
    .single();

  if (error || !data) {
    return NextResponse.json({ detail: A.notFound }, { status: 404 });
  }
  return NextResponse.json(rowToResponse(data as AuditRow));
}

export async function DELETE(req: Request, { params }: Params) {
  const A = srv(localeFromRequest(req)).api;
  const supabase = getSupabase();

  const { data: existing } = await supabase
    .from("audits")
    .select("project_id")
    .eq("id", params.id)
    .single();
  const projectId = (existing as { project_id?: string | null } | null)?.project_id ?? null;

  const { error } = await supabase.from("audits").delete().eq("id", params.id);

  if (error) {
    return NextResponse.json(
      { detail: fill(A.deleteFail, { err: error.message }) },
      { status: 500 }
    );
  }

  if (projectId) await refreshProjectStats(supabase, projectId);

  return NextResponse.json({ deleted: true, id: params.id });
}

async function refreshProjectStats(
  supabase: ReturnType<typeof getSupabase>,
  projectId: string
): Promise<void> {
  try {
    const { data } = await supabase
      .from("audits")
      .select("issues,created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    const rows = ((data ?? []) as { issues?: { severity?: string }[]; created_at?: string }[]);
    if (rows.length === 0) {
      await supabase
        .from("projects")
        .update({ audits_count: 0, last_score: null, last_audit_at: null })
        .eq("id", projectId);
      return;
    }
    const latest = rows[0].issues ?? [];
    const critical = latest.filter((i) => i.severity === "critical").length;
    const warning = latest.filter((i) => i.severity === "warning").length;
    await supabase
      .from("projects")
      .update({
        audits_count: rows.length,
        last_score: calculateScoreFromCounts(critical, warning).score,
        last_audit_at: rows[0].created_at ?? new Date().toISOString(),
      })
      .eq("id", projectId);
  } catch {
    /* best-effort */
  }
}

import { NextResponse } from "next/server";
import { getSupabase, type AuditRow } from "@/lib/supabase";
import { rowToSummary } from "@/lib/audit-map";
import type { Project } from "@/lib/types";

export const dynamic = "force-dynamic";

interface Params {
  params: { slug: string };
}

export async function GET(_req: Request, { params }: Params) {
  const supabase = getSupabase();
  const { data: project, error } = await supabase
    .from("projects")
    .select("*")
    .eq("slug", params.slug)
    .single();

  if (error || !project) {
    return NextResponse.json({ detail: "Proyecto no encontrado." }, { status: 404 });
  }

  const { data: audits, error: auditsError } = await supabase
    .from("audits")
    .select("*")
    .eq("project_id", (project as Project).id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (auditsError) {
    return NextResponse.json({ detail: `No se pudo leer el historial: ${auditsError.message}` }, { status: 500 });
  }

  return NextResponse.json({
    project: project as Project,
    audits: ((audits ?? []) as AuditRow[]).map(rowToSummary),
  });
}

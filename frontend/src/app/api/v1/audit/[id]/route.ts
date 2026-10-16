import { NextResponse } from "next/server";
import { getSupabase, type AuditRow } from "@/lib/supabase";
import { rowToResponse } from "@/lib/audit-map";

export const dynamic = "force-dynamic";

interface Params {
  params: { id: string };
}

export async function GET(_req: Request, { params }: Params) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("audits")
    .select("*")
    .eq("id", params.id)
    .single();

  if (error || !data) {
    return NextResponse.json({ detail: "Auditoría no encontrada." }, { status: 404 });
  }
  return NextResponse.json(rowToResponse(data as AuditRow));
}

export async function DELETE(_req: Request, { params }: Params) {
  const supabase = getSupabase();
  const { error } = await supabase.from("audits").delete().eq("id", params.id);

  if (error) {
    return NextResponse.json(
      { detail: `No se pudo eliminar: ${error.message}` },
      { status: 500 }
    );
  }
  return NextResponse.json({ deleted: true, id: params.id });
}

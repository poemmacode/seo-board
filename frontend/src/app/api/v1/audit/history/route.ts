import { NextResponse } from "next/server";
import { getSupabase, type AuditRow } from "@/lib/supabase";
import { rowToSummary } from "@/lib/audit-map";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 10, 1), 50);

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("audits")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json(
      { detail: `No se pudo leer el historial: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json((data as AuditRow[]).map(rowToSummary));
}

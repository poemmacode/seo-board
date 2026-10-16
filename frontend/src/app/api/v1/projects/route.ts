import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import type { Project } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .order("last_audit_at", { ascending: false, nullsFirst: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ detail: `No se pudieron leer los proyectos: ${error.message}` }, { status: 500 });
  }
  return NextResponse.json((data ?? []) as Project[]);
}

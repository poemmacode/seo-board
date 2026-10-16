import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { localeFromRequest } from "@/lib/locale";
import { srv, fill } from "@/lib/srv";
import type { Project } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const A = srv(localeFromRequest(req)).api;
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("projects")
    .select("id,slug,domain,root_domain,audits_count,last_score,last_audit_at,created_at")
    .order("last_audit_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error(`[projects/list] ${error.code ?? ""} ${error.message}`.trim());
    return NextResponse.json({ detail: fill(A.projectsFail, { err: error.message }) }, { status: 500 });
  }
  return NextResponse.json((data ?? []) as Project[]);
}

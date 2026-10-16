import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    module: "serp-tracking",
    status: "roadmap",
    message: "Módulo desacoplado, pendiente de implementación.",
  });
}

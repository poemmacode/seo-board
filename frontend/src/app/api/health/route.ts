import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    ai_provider: process.env.AI_PROVIDER ?? "openai",
  });
}

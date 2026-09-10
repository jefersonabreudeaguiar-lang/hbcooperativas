import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** MFA desligado temporariamente — rota inativa. */
export async function GET() {
  return NextResponse.json({ enabled: false, error: "MFA desligado temporariamente." }, { status: 404 });
}

export async function POST() {
  return GET();
}

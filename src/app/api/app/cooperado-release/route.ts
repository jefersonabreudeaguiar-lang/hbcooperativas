import { NextResponse } from "next/server";
import { resolveCooperadoReleasePolicy } from "@/lib/cooperado/cooperadoReleasePolicy";

export async function GET() {
  const policy = resolveCooperadoReleasePolicy();
  return NextResponse.json({
    ok: true,
    ...policy,
  });
}

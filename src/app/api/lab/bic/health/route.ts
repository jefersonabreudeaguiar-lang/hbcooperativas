import { NextResponse } from "next/server";
import { checkBicLabMirrorHealth } from "@/lib/lab/bicLabMirrorConfig";
import { isBicLabPageReachableServer } from "@/lib/lab/bicLabGate";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isBicLabPageReachableServer()) {
    return NextResponse.json({ ok: false, error: "BIC_LAB_DISABLED" }, { status: 404 });
  }

  const health = await checkBicLabMirrorHealth();
  return NextResponse.json(health);
}

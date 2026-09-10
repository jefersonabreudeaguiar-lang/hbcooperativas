import { NextResponse } from "next/server";
import { canRunMirrorSync, runProdMirrorSync } from "@/lib/lab/hobeliscoMirrorSync";

function authorizeCron(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) return false;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${cronSecret}`;
}

export const dynamic = "force-dynamic";

/** Cron Fase 1 — espelho prod→LAB (read-only, anonimizado) — só LAB */
export async function GET(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ ok: false, error: "Não autorizado." }, { status: 401 });
  }

  const gate = canRunMirrorSync();
  if (!gate.allowed) {
    return NextResponse.json(
      { ok: false, blocked: true, reason: gate.reason, phase: "1-mirror-sync" },
      { status: 403 }
    );
  }

  try {
    const result = await runProdMirrorSync();
    if (!result.ok) {
      return NextResponse.json(
        { blocked: result.blocked, reason: result.reason, phase: "1-mirror-sync", ok: false },
        { status: result.blocked ? 403 : 500 }
      );
    }
    return NextResponse.json({ ok: true, phase: "1-mirror-sync", snapshot: result.snapshot });
  } catch (e) {
    const message = e instanceof Error ? e.message : "mirror_sync_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return GET(request);
}

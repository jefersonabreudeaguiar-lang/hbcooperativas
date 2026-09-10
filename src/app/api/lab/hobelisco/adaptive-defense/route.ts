import { NextResponse } from "next/server";
import { loadAdaptiveDefenseFlags } from "@lab/hobelisco-hx/config";
import { runAdaptiveDefenseCampaign } from "@lab/hobelisco-hx/adaptive-defense/CampaignRunner";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const flags = loadAdaptiveDefenseFlags();
  if (!flags.enabled) {
    return NextResponse.json({ ok: false, skipped: "adaptive_defense_disabled" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { count?: number; seed?: number; mode?: string };
  const report = runAdaptiveDefenseCampaign({
    count: body.count ?? flags.maxScenarios,
    seed: body.seed ?? flags.defaultSeed,
    mode: (body.mode as "FULL" | undefined) ?? "FULL",
  });

  return NextResponse.json({ ok: report.status !== "RED", report });
}

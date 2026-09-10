import { NextResponse } from "next/server";
import { runArenaSimulation } from "@lab/hobelisco-hx/arena/SimulationRunner";
import { getHobeliscoCore } from "@lab/hobelisco-hx/core/HobeliscoCore";
import { isHobeliscoLabEnabledServer } from "@/lib/lab/hobeliscoLabGate";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isHobeliscoLabEnabledServer()) {
    return NextResponse.json({ error: "Lab indisponível" }, { status: 404 });
  }

  const core = getHobeliscoCore();
  core.perceive({});
  const snapshot = core.snapshot();

  return NextResponse.json(snapshot, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST() {
  if (!isHobeliscoLabEnabledServer()) {
    return NextResponse.json({ error: "Lab indisponível" }, { status: 404 });
  }

  const report = runArenaSimulation();
  return NextResponse.json(report, {
    headers: { "Cache-Control": "no-store" },
  });
}

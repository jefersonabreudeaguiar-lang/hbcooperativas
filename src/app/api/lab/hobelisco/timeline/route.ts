import { NextResponse } from "next/server";
import {
  buildSnapshotView,
  getLifeTransitions,
  getTimelineEntries,
  populateDemoTimeline,
  replayTimelineIncident,
} from "@lab/hobelisco-hx/organism/TimelineCollector";
import type { TimelineFilterCategory } from "@lab/hobelisco-hx/organism/TimelineTypes";
import { getHobeliscoRuntime, resetHobeliscoRuntime } from "@lab/hobelisco-hx/runtime/HobeliscoRuntime";
import { isHobeliscoLabEnabledServer } from "@/lib/lab/hobeliscoLabGate";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isHobeliscoLabEnabledServer()) {
    return NextResponse.json({ error: "Lab indisponível" }, { status: 404 });
  }

  const url = new URL(request.url);
  const filter = (url.searchParams.get("filter") ?? "ALL") as TimelineFilterCategory;
  const runtime = getHobeliscoRuntime();
  const entries = getTimelineEntries(filter);

  return NextResponse.json({
    entries,
    lifeTransitions: getLifeTransitions(),
    snapshot: buildSnapshotView(runtime),
    filter,
  });
}

export async function POST(request: Request) {
  if (!isHobeliscoLabEnabledServer()) {
    return NextResponse.json({ error: "Lab indisponível" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as { action?: string; entryId?: string };
  const runtime = resetHobeliscoRuntime();

  if (body.action === "replay" && body.entryId) {
    populateDemoTimeline(runtime);
    const comparison = replayTimelineIncident(body.entryId, runtime);
    return NextResponse.json({ comparison, entries: getTimelineEntries() });
  }

  const entries = populateDemoTimeline(runtime);
  return NextResponse.json({
    entries,
    lifeTransitions: getLifeTransitions(),
    snapshot: buildSnapshotView(runtime),
  });
}

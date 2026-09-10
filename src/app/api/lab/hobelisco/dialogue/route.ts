import { NextResponse } from "next/server";
import { hobeliscoDialogue } from "@lab/hobelisco-hx/dialogue/HobeliscoDialogue";
import { getHobeliscoCore } from "@lab/hobelisco-hx/core/HobeliscoCore";
import { isHobeliscoLabEnabledServer } from "@/lib/lab/hobeliscoLabGate";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isHobeliscoLabEnabledServer()) {
    return NextResponse.json({ error: "Lab indisponível" }, { status: 404 });
  }

  let body: { message?: string };
  try {
    body = (await req.json()) as { message?: string };
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const message = body.message?.trim() ?? "";
  if (message.length > 500) {
    return NextResponse.json({ error: "Mensagem longa demais" }, { status: 400 });
  }

  const core = getHobeliscoCore();
  const snapshot = core.snapshot();
  const reply = hobeliscoDialogue(message, snapshot);

  return NextResponse.json({ ok: true, reply, snapshot: { state: snapshot.state, health: snapshot.health.overall } });
}

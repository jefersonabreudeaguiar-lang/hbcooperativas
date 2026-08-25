import { NextResponse } from "next/server";
import { assertLabEnabledServer } from "@/modules/hb-credit-lab/config";
import { authorizeLabPayment, getLabIntent, parseLabQrPayload } from "@/modules/hb-credit-lab/server/labStore";

export async function POST(request: Request) {
  try {
    assertLabEnabledServer();
  } catch {
    return NextResponse.json({ error: "Laboratório desativado." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });

  if (body.action === "validate") {
    const parsed = parseLabQrPayload(String(body.qrPayload ?? ""));
    if (!parsed) return NextResponse.json({ error: "QR experimental inválido." }, { status: 400 });
    const intent = getLabIntent(parsed.intentId);
    if (!intent) return NextResponse.json({ error: "Cobrança não encontrada." }, { status: 404 });
    if (intent.nonce !== parsed.nonce) {
      return NextResponse.json({ error: "QR não confere com a cobrança." }, { status: 400 });
    }
    return NextResponse.json({ labOnly: true, intent, valid: intent.status === "pending" });
  }

  const intentId = String(body.intentId ?? "");
  const nonce = String(body.nonce ?? "");
  const idempotencyKey = String(body.idempotencyKey ?? `lab_${Date.now()}`);

  try {
    const result = authorizeLabPayment({ intentId, nonce, idempotencyKey });
    return NextResponse.json({ labOnly: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Pagamento não autorizado." },
      { status: 400 }
    );
  }
}

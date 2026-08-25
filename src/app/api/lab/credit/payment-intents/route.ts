import { NextResponse } from "next/server";
import { assertLabEnabledServer } from "@/modules/hb-credit-lab/config";
import {
  buildLabQrPayload,
  createLabPaymentIntent,
  getLabIntent,
  getLabMarkets,
} from "@/modules/hb-credit-lab/server/labStore";

export async function GET(request: Request) {
  try {
    assertLabEnabledServer();
  } catch {
    return NextResponse.json({ error: "Laboratório desativado." }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (id) {
    const intent = getLabIntent(id);
    if (!intent) return NextResponse.json({ error: "Intent não encontrado." }, { status: 404 });
    return NextResponse.json({ labOnly: true, intent, qrPayload: buildLabQrPayload(intent) });
  }

  return NextResponse.json({ labOnly: true, markets: getLabMarkets() });
}

export async function POST(request: Request) {
  try {
    assertLabEnabledServer();
  } catch {
    return NextResponse.json({ error: "Laboratório desativado." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  if (!body?.marketId || body.amountReais == null) {
    return NextResponse.json({ error: "marketId e amountReais são obrigatórios." }, { status: 400 });
  }

  try {
    const intent = createLabPaymentIntent({
      marketId: String(body.marketId),
      amountReais: Number(body.amountReais),
      descricao: body.descricao ? String(body.descricao) : undefined,
    });
    return NextResponse.json({
      labOnly: true,
      intent,
      qrPayload: buildLabQrPayload(intent),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro ao criar cobrança lab." },
      { status: 400 }
    );
  }
}

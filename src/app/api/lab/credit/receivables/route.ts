import { NextResponse } from "next/server";
import { assertLabEnabledServer } from "@/modules/hb-credit-lab/config";
import { getLabReceivables } from "@/modules/hb-credit-lab/server/labStore";

export async function GET(request: Request) {
  try {
    assertLabEnabledServer();
  } catch {
    return NextResponse.json({ error: "Laboratório desativado." }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const marketId = searchParams.get("marketId") ?? undefined;
  return NextResponse.json({ labOnly: true, receivables: getLabReceivables(marketId) });
}

import { NextResponse } from "next/server";
import { assertLabEnabledServer } from "@/modules/hb-credit-lab/config";
import { getLabAccount, getLabActivities, getLabLedger } from "@/modules/hb-credit-lab/server/labStore";

export async function GET(request: Request) {
  try {
    assertLabEnabledServer();
  } catch {
    return NextResponse.json({ error: "Laboratório desativado." }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const view = searchParams.get("view");

  if (view === "ledger") {
    return NextResponse.json({ labOnly: true, ledger: getLabLedger() });
  }

  return NextResponse.json({
    labOnly: true,
    account: getLabAccount(),
    activities: getLabActivities(15),
  });
}

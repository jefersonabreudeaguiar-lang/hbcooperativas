import { NextResponse } from "next/server";
import { isHbCreditLabEnabledServer } from "@/modules/hb-credit-lab/config";
import { getLabAccount, getLabActivities } from "@/modules/hb-credit-lab/server/labStore";

export async function GET() {
  if (!isHbCreditLabEnabledServer()) {
    return NextResponse.json({ enabled: false, labOnly: true }, { status: 404 });
  }

  const account = getLabAccount();
  const activities = getLabActivities(5);

  return NextResponse.json({
    enabled: true,
    labOnly: true,
    namespace: "LAB_ONLY",
    account,
    activities,
  });
}

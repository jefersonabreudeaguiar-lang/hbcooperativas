import { NextResponse } from "next/server";
import { isHbCreditEnabledServer } from "@/modules/hb-credit/config";

export async function GET() {
  return NextResponse.json({
    enabled: isHbCreditEnabledServer(),
    module: "conta-coop",
    version: 1,
  });
}

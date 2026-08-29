import { NextResponse } from "next/server";
import {
  isHbCreditEnabledServer,
  isHbCreditOperationsEnabled,
} from "@/modules/hb-credit/config";
import { isApiSecurityEnforced } from "@/lib/security/env";

export async function GET() {
  const enabled = isHbCreditEnabledServer();
  return NextResponse.json({
    enabled,
    operationsEnabled: isHbCreditOperationsEnabled(),
    securityEnforced: isApiSecurityEnforced(),
    module: "conta-coop",
    version: 1,
  });
}

"use client";

import { useEffect } from "react";
import { markPwaRepairSessionForBuild } from "@/lib/pwa/cooperadoPwaInstallPrepare";
import { isAppStandalone } from "@/services/cooperadoAppInstallService";

/** Após o app carregar no ícone, marca reparo/build para os guards inline não reentrar em loop. */
export function PwaStandaloneRepairAck() {
  useEffect(() => {
    if (!isAppStandalone()) return;
    markPwaRepairSessionForBuild();
  }, []);

  return null;
}

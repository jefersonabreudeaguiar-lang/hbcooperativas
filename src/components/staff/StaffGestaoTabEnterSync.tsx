"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { scheduleStaffResponsavelTabEnterSync } from "@/lib/staff/staffResponsavelTabEnterSync";

type Props = { enabled: boolean };

/** PC/celular gestão — ao mudar de rota, puxa tier leve da aba (após warmup). */
export function StaffGestaoTabEnterSync({ enabled }: Props) {
  const pathname = usePathname();
  useEffect(() => {
    if (!enabled) return;
    scheduleStaffResponsavelTabEnterSync(pathname);
  }, [enabled, pathname]);
  return null;
}

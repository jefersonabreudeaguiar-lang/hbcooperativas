"use client";

import { useEffect } from "react";
import { useAuth } from "@/modules/auth/AuthProvider";
import { isV2HbOnlyClient, resolveAppHomePath } from "@/lib/product/v2HbOnly";
import { scheduleSafeAppNavigation } from "@/lib/pwa/safeDocumentNavigation";
import { normalizeUserRole } from "@/permissions";

/** V2: `/dashboard` legado redireciona para home HB (cooperado / responsável). */
export function V2HbOnlyDashboardRedirect() {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading || !user || !isV2HbOnlyClient()) return;
    const role = normalizeUserRole(user.role);
    if (role === "cooperado") return;
    const home = resolveAppHomePath(user.role, "/dashboard");
    if (home === "/dashboard") return;
    scheduleSafeAppNavigation(home, 280);
  }, [user, loading, user?.role]);

  return null;
}

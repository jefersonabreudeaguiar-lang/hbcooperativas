"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/modules/auth/AuthProvider";
import { isV2HbOnlyClient, resolveAppHomePath } from "@/lib/product/v2HbOnly";

/** V2: `/dashboard` legado redireciona para home HB (cooperado / responsável). */
export function V2HbOnlyDashboardRedirect() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading || !user || !isV2HbOnlyClient()) return;
    const home = resolveAppHomePath(user.role, "/dashboard");
    if (home === "/dashboard") return;
    router.replace(home);
  }, [user, loading, router]);

  return null;
}

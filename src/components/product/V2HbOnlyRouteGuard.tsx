"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/modules/auth/AuthProvider";
import { isV2HbOnlyClient, resolveAppHomePath } from "@/lib/product/v2HbOnly";
import { isPathAllowedInV2HbOnly } from "@/lib/product/v2HbOnlyRoutes";

/** App oficial V2: bloqueia URLs legadas (entregas, ficha, etc.) fora do menu HB. */
export function V2HbOnlyRouteGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading || !user || !isV2HbOnlyClient()) return;
    if (isPathAllowedInV2HbOnly(pathname, user.role)) return;
    const home = resolveAppHomePath(user.role, "/dashboard");
    router.replace(home);
  }, [loading, user, user?.role, pathname, router]);

  return <>{children}</>;
}

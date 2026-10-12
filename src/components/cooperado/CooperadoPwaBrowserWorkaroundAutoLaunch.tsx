"use client";

import { useLayoutEffect, useRef } from "react";
import { useAuth } from "@/modules/auth/AuthProvider";
import {
  launchCooperadoPwaBrowserWorkaround,
  shouldCooperadoPwaUseBrowserWorkaround,
} from "@/lib/pwa/cooperadoPwaBrowserWorkaround";
import { userToCloudProfile } from "@/lib/security/clientSession";

/** Fallback se o script inline do <head> não redirecionar a tempo. */
export function CooperadoPwaBrowserWorkaroundAutoLaunch() {
  const { user, loading } = useAuth();
  const launchedRef = useRef(false);

  useLayoutEffect(() => {
    if (loading || launchedRef.current) return;
    if (!user || user.role !== "cooperado") return;
    if (!shouldCooperadoPwaUseBrowserWorkaround()) return;

    launchedRef.current = true;
    launchCooperadoPwaBrowserWorkaround(userToCloudProfile(user));
  }, [loading, user]);

  return null;
}

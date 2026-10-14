"use client";

import { useEffect, useState } from "react";
import {
  embeddedCooperadoReleasePolicy,
  mergeCooperadoReleasePolicy,
  type CooperadoReleasePolicy,
} from "@/lib/cooperado/cooperadoReleasePolicy";
import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";

const CACHE_MS = 60_000;

let shared: CooperadoReleasePolicy | null = null;
let sharedAt = 0;
let inflight: Promise<CooperadoReleasePolicy> | null = null;

async function fetchPolicy(): Promise<CooperadoReleasePolicy> {
  try {
    const res = await fetch("/api/app/cooperado-release", { cache: "no-store" });
    if (!res.ok) return embeddedCooperadoReleasePolicy();
    const data = (await res.json()) as CooperadoReleasePolicy & { ok?: boolean };
    return mergeCooperadoReleasePolicy({
      minBuild: data.minBuild,
      recommendedBuild: data.recommendedBuild,
      releaseEpoch: data.releaseEpoch,
      message: data.message,
      serverBuild: data.serverBuild,
    });
  } catch {
    return embeddedCooperadoReleasePolicy();
  }
}

export function useCooperadoReleasePolicy(): {
  policy: CooperadoReleasePolicy | null;
  loading: boolean;
  clientBuild: number;
} {
  const [policy, setPolicy] = useState<CooperadoReleasePolicy | null>(shared);
  const [loading, setLoading] = useState(!shared);

  useEffect(() => {
    const now = Date.now();
    if (shared && now - sharedAt < CACHE_MS) {
      setPolicy(shared);
      setLoading(false);
      return;
    }
    const fallbackTimer = window.setTimeout(() => {
      const embedded = embeddedCooperadoReleasePolicy();
      shared = embedded;
      sharedAt = Date.now();
      setPolicy(embedded);
      setLoading(false);
    }, 6_000);
    if (!inflight) {
      inflight = fetchPolicy()
        .then((p) => {
          shared = p;
          sharedAt = Date.now();
          return p;
        })
        .finally(() => {
          inflight = null;
        });
    }
    void inflight.then((p) => {
      window.clearTimeout(fallbackTimer);
      setPolicy(p);
      setLoading(false);
    });
    return () => window.clearTimeout(fallbackTimer);
  }, []);

  return { policy, loading, clientBuild: APP_BUILD_VERSION };
}

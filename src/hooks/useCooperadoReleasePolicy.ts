"use client";

import { useEffect, useState } from "react";
import type { CooperadoReleasePolicy } from "@/lib/cooperado/cooperadoReleasePolicy";
import { APP_BUILD_VERSION } from "@/lib/appBuildVersion";

const CACHE_MS = 60_000;

let shared: CooperadoReleasePolicy | null = null;
let sharedAt = 0;
let inflight: Promise<CooperadoReleasePolicy> | null = null;

async function fetchPolicy(): Promise<CooperadoReleasePolicy> {
  const res = await fetch("/api/app/cooperado-release", { cache: "no-store" });
  if (!res.ok) {
    return {
      minBuild: APP_BUILD_VERSION,
      recommendedBuild: APP_BUILD_VERSION,
      releaseEpoch: 1,
      message: "",
      serverBuild: APP_BUILD_VERSION,
    };
  }
  const data = (await res.json()) as CooperadoReleasePolicy & { ok?: boolean };
  return {
    minBuild: data.minBuild ?? APP_BUILD_VERSION,
    recommendedBuild: data.recommendedBuild ?? APP_BUILD_VERSION,
    releaseEpoch: data.releaseEpoch ?? 1,
    message: data.message ?? "",
    serverBuild: data.serverBuild ?? APP_BUILD_VERSION,
  };
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
      setPolicy(p);
      setLoading(false);
    });
  }, []);

  return { policy, loading, clientBuild: APP_BUILD_VERSION };
}

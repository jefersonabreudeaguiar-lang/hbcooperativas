"use client";

import { useState, useEffect, useCallback } from "react";
import { getData, subscribe } from "@/services/dataStore";
import type { AppData } from "@/types";

export function useAppData(): AppData | null {
  const [data, setData] = useState<AppData | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      return getData();
    } catch {
      return null;
    }
  });

  const load = useCallback(() => {
    setData(getData());
  }, []);

  useEffect(() => {
    load();
    return subscribe(load);
  }, [load]);

  return data;
}

export function useDataRefresh() {
  const [, setTick] = useState(0);
  useEffect(() => subscribe(() => setTick((t) => t + 1)), []);
}

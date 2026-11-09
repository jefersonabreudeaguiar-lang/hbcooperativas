'use client';
import { useEffect, useState } from 'react';
import { fetchPlatformBillingOverview, PLATFORM_BILLING_CHANGED, type PlatformBillingOverview } from '@/services/platformBillingClient';
export function usePlatformBillingOverview() {
  const [overview, setOverview] = useState<PlatformBillingOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true, busy = false, queued = false;
    const refresh = async () => {
      if (!active || document.hidden) return;
      if (busy) { queued = true; return; }
      busy = true;
      try { const next = await fetchPlatformBillingOverview(); if (active) { setOverview(next); setError(null); } }
      catch (e) { if (active) setError(e instanceof Error ? e.message : 'Cobrança indisponível.'); }
      finally { busy = false; if (queued && active) { queued = false; void refresh(); } }
    };
    void refresh();
    const tick = () => { void refresh(); };
    const timer = window.setInterval(tick, 60_000);
    window.addEventListener('focus', tick); window.addEventListener(PLATFORM_BILLING_CHANGED, tick);
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', tick); window.removeEventListener(PLATFORM_BILLING_CHANGED, tick); };
  }, []);
  return { overview, error };
}

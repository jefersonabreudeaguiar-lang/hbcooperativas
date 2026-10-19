/**
 * Loop discreto da gestão — só intervalo, sem poll imediato (abertura já sincroniza).
 */
export function scheduleStaffGestaoLiveSyncLoop(opts: {
  pollIntervalMs: number;
  onPoll: () => void;
  onVisible: () => void;
}): () => void {
  if (opts.pollIntervalMs <= 0 || typeof window === "undefined") return () => undefined;

  const onVisible = () => {
    if (document.hidden) return;
    opts.onVisible();
  };
  document.addEventListener("visibilitychange", onVisible);

  const intervalId = window.setInterval(() => {
    if (document.hidden) return;
    opts.onPoll();
  }, opts.pollIntervalMs);

  return () => {
    document.removeEventListener("visibilitychange", onVisible);
    window.clearInterval(intervalId);
  };
}

/** Let React and the browser display the next delivery before heavy persistence. */
export function conferenciaAfterPaint(job: () => void): void {
  const idle = () => {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(() => job(), { timeout: 1800 });
    else setTimeout(job, 0);
  };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => requestAnimationFrame(idle));
  else setTimeout(idle, 0);
}

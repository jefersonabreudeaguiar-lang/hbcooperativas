/** One lightweight read at a time; failed/unknown revisions are never acknowledged as current. */
export function criarContadorRevisionWatch(opts: {
  applied: string; read: () => Promise<string | null>; changed: () => void; failed: () => void;
}) {
  let active = true, busy = false;
  return {
    stop: () => { active = false; },
    check: async () => {
      if (!active || busy) return;
      busy = true;
      try {
        const revision = await opts.read();
        if (!active) return;
        if (revision === null) opts.failed();
        else if (revision !== opts.applied) opts.changed();
      } catch { if (active) opts.failed(); }
      finally { busy = false; }
    },
  };
}

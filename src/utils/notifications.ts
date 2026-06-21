export function vibrarAprovacao(): void {
  if (typeof navigator === "undefined" || !navigator.vibrate) return;
  navigator.vibrate([180, 80, 180, 80, 280]);
}

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
  }
  return audioCtx;
}

/** Toca um som curto de confirmação (dois tons ascendentes). */
export function tocarSomAprovacao(): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  const playTone = (freq: number, start: number, duration: number) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.05);
  };

  if (ctx.state === "suspended") {
    ctx.resume().then(() => {
      const t = ctx.currentTime;
      playTone(523.25, t, 0.12);
      playTone(659.25, t + 0.14, 0.18);
    }).catch(() => {});
    return;
  }

  const t = ctx.currentTime;
  playTone(523.25, t, 0.12);
  playTone(659.25, t + 0.14, 0.18);
}

export async function solicitarPermissaoNotificacao(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

export function notificacaoNavegador(titulo: string, corpo: string): void {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  if (document.visibilityState === "visible") return;

  try {
    new Notification(titulo, {
      body: corpo,
      icon: "/icons/icon-192.png",
      tag: "entrega-aprovada",
    });
  } catch {
    // ignore
  }
}

export function notificarEntregaAprovada(): void {
  vibrarAprovacao();
  tocarSomAprovacao();
  notificacaoNavegador("Entrega aprovada!", "Sua entrega foi conferida pela cooperativa.");
}

/** Chame após interação do usuário para desbloquear áudio no celular. */
export function prepararAudioNotificacao(): void {
  const ctx = getAudioContext();
  if (ctx?.state === "suspended") {
    ctx.resume().catch(() => {});
  }
}

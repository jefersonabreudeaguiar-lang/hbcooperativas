/** Áudio de comunicado pendente de upload (localStorage remove data URLs grandes). */
const KEY = "hb-comunicado-audio-pending";

function readMap(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeMap(map: Record<string, string>): void {
  if (typeof window === "undefined") return;
  if (!Object.keys(map).length) {
    sessionStorage.removeItem(KEY);
    return;
  }
  sessionStorage.setItem(KEY, JSON.stringify(map));
}

export function stashComunicadoAudioPending(comunicadoId: string, audioDataUrl: string): void {
  if (!comunicadoId || !audioDataUrl.startsWith("data:audio/")) return;
  const map = readMap();
  map[comunicadoId] = audioDataUrl;
  writeMap(map);
}

export function clearComunicadoAudioPending(comunicadoId: string): void {
  const map = readMap();
  if (!map[comunicadoId]) return;
  delete map[comunicadoId];
  writeMap(map);
}

export function getComunicadoAudioPending(comunicadoId: string): string | undefined {
  return readMap()[comunicadoId];
}

export function listComunicadoAudioPendingIds(): string[] {
  return Object.keys(readMap());
}

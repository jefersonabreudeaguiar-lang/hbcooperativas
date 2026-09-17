import type { AppData, Comunicado } from "@/types";
import { normalizeCnpj } from "@/utils/cooperativa";
import { secureApiFetch } from "@/lib/security/clientSession";
import {
  clearComunicadoAudioPending,
  getComunicadoAudioPending,
  listComunicadoAudioPendingIds,
} from "@/lib/comunicado/comunicadoAudioPending";
import { updateData, getData } from "@/services/dataStore";

async function uploadOne(cnpj: string, comunicadoId: string, audioDataUrl: string): Promise<string> {
  const res = await secureApiFetch("/api/comunicados/audio", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cnpj, comunicadoId, audioDataUrl }),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string; audioStoragePath?: string };
  if (!res.ok) throw new Error(json.error ?? "Falha ao enviar áudio do comunicado.");
  if (!json.audioStoragePath) throw new Error("Resposta inválida ao enviar áudio.");
  return json.audioStoragePath;
}

/** Envia áudios pendentes para a nuvem e grava audioStoragePath no AppData. */
export async function ensureComunicadosAudioUploaded(
  cnpj: string,
  cooperativaId: string,
  data?: AppData
): Promise<void> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) return;

  const base = data ?? getData();
  const ids = new Set<string>();
  for (const c of base.comunicados) {
    if (c.cooperativaId === cooperativaId || !c.cooperativaId) ids.add(c.id);
  }
  for (const id of listComunicadoAudioPendingIds()) ids.add(id);

  const uploads: { id: string; path: string }[] = [];

  for (const id of ids) {
    const row = base.comunicados.find((c) => c.id === id);
    if (row?.audioStoragePath) continue;

    const pending = getComunicadoAudioPending(id) ?? row?.audioDataUrl;
    if (!pending?.startsWith("data:audio/")) continue;

    const path = await uploadOne(digits, id, pending);
    uploads.push({ id, path });
    clearComunicadoAudioPending(id);
  }

  if (!uploads.length) return;

  updateData((d) => ({
    ...d,
    comunicados: d.comunicados.map((c) => {
      const hit = uploads.find((u) => u.id === c.id);
      if (!hit) return c.audioDataUrl ? { ...c, audioDataUrl: undefined } : c;
      return {
        ...c,
        audioStoragePath: hit.path,
        audioDataUrl: undefined,
        audioNaNuvem: true,
      };
    }),
  }));
}

export async function fetchComunicadoAudioPlayUrl(
  cnpj: string,
  comunicado: Pick<Comunicado, "id" | "audioDataUrl" | "audioStoragePath">
): Promise<string | undefined> {
  if (comunicado.audioDataUrl?.trim()) return comunicado.audioDataUrl.trim();
  if (!comunicado.audioStoragePath) return undefined;

  const digits = normalizeCnpj(cnpj);
  const params = new URLSearchParams({
    cnpj: digits,
    comunicadoId: comunicado.id,
  });
  if (comunicado.audioStoragePath) params.set("path", comunicado.audioStoragePath);
  const res = await secureApiFetch(`/api/comunicados/audio?${params.toString()}`);
  const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !json.url) return undefined;
  return json.url;
}

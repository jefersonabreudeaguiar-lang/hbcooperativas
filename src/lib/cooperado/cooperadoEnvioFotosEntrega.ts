/** Inline no bundle via `next.config` — padrão `0` (sem envio de fotos de entrega). */
export function resolveCooperadoEnvioFotosPublicEnv(raw?: string): "0" | "1" {
  const v = (raw ?? "0").trim().toLowerCase();
  if (v === "1" || v === "true" || v === "yes") return "1";
  return "0";
}

/** Espelha `resolveV2HbOnlyPublicEnv` sem importar v2HbOnly (evita ciclo com next.config). */
function isV2HbOnlyEnv(): boolean {
  const v = (process.env.NEXT_PUBLIC_V2_HB_ONLY ?? "").trim().toLowerCase();
  if (v === "0" || v === "false" || v === "no") return false;
  if (v === "1" || v === "true" || v === "yes") return true;
  return process.env.VERCEL_ENV === "production";
}

/** Cooperado pode tirar/enviar fotos de entrega (notas). Desligado no app oficial V2 e com flag `0`. */
export function cooperadoEnvioFotosEntregaEnabled(): boolean {
  if (isV2HbOnlyEnv()) return false;
  return resolveCooperadoEnvioFotosPublicEnv(process.env.NEXT_PUBLIC_COOPERADO_ENVIO_FOTOS_ENTREGA) === "1";
}

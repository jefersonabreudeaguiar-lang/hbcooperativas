import type { VotacaoVoto } from "@/types";
import { normalizeCnpj } from "@/utils/cooperativa";
import { secureApiFetch } from "@/lib/security/clientSession";

/** Envia voto do cooperado para a nuvem (endpoint dedicado — não exige perfil diretoria). */
export async function pushVotoCooperadoToCloud(
  cnpj: string,
  voto: VotacaoVoto
): Promise<{ ok: true } | { ok: false; error: string }> {
  const digits = normalizeCnpj(cnpj);
  if (digits.length !== 14) {
    return { ok: false, error: "CNPJ inválido." };
  }

  try {
    const res = await secureApiFetch("/api/votacao/voto", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cnpj: digits, voto }),
    });
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) {
      return { ok: false, error: body?.error ?? "Não foi possível enviar o voto à nuvem." };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Sem conexão com a nuvem." };
  }
}

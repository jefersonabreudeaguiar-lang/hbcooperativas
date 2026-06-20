import type { AppData } from "@/types";
import { getCurrentMesReferencia } from "@/utils/format";

function newId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function vencimentoDoMes(mesReferencia: string, dia: number): string {
  const diaStr = String(Math.min(Math.max(dia, 1), 28)).padStart(2, "0");
  return `${mesReferencia}-${diaStr}`;
}

/** Gera mensalidades pendentes do mês para cooperados ativos quando configurado na cooperativa. */
export function ensureMensalidadesDoMes(data: AppData): AppData | null {
  const mes = getCurrentMesReferencia();
  const now = new Date().toISOString();
  let changed = false;
  const mensalidades = [...data.mensalidades];

  for (const coop of data.cooperativas) {
    const cfg = coop.mensalidadeConfig;
    if (!cfg?.gerarAutomaticamente || cfg.valorPadrao <= 0) continue;

    const cooperados = data.cooperados.filter(
      (c) => c.cooperativaId === coop.id && c.status === "ativo"
    );

    for (const cooperado of cooperados) {
      const jaExiste = mensalidades.some(
        (m) => m.cooperadoId === cooperado.id && m.mesReferencia === mes
      );
      if (jaExiste) continue;

      mensalidades.push({
        id: newId("m"),
        cooperadoId: cooperado.id,
        mesReferencia: mes,
        valor: cfg.valorPadrao,
        vencimento: vencimentoDoMes(mes, cfg.diaVencimento),
        status: "pendente",
        observacao: "Gerada automaticamente",
        createdAt: now,
        updatedAt: now,
      });
      changed = true;
    }
  }

  return changed ? { ...data, mensalidades } : null;
}

/** Marca mensalidades pendentes como atrasadas após o vencimento. */
export function atualizarStatusMensalidades(data: AppData): AppData | null {
  const hoje = new Date().toISOString().split("T")[0];
  let changed = false;

  const mensalidades = data.mensalidades.map((m) => {
    if (m.status !== "pendente" || !m.vencimento) return m;
    if (m.vencimento >= hoje) return m;
    changed = true;
    return { ...m, status: "atrasada" as const, updatedAt: new Date().toISOString() };
  });

  return changed ? { ...data, mensalidades } : null;
}

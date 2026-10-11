import type { AppData } from "@/types";
import {
  fichaPertenceCooperado,
  notaPertenceCooperado,
  pagamentoCooperadoPertenceCooperado,
} from "@/services/cooperadoCloudService";
import { getContaCoopDescontosRevision } from "@/lib/hb-credit/contaCoopDescontosNotify";

/** Revisão só de dados operacionais — módulo folha (evita ciclo policy ↔ financeiroUiSnapshot). */
export function cooperadoMotorRevisionOperacional(
  data: AppData,
  cooperadoId: string,
  cooperativaId: string | undefined
): string {
  const chunks: string[] = [];

  for (const p of data.pagamentosCooperado) {
    if (!pagamentoCooperadoPertenceCooperado(data, p, cooperadoId, cooperativaId)) continue;
    chunks.push(
      `p:${p.id}:${p.status}:${p.mesReferencia}:${p.valorLiquido}:${p.updatedAt ?? ""}:${(p.mesesReferencia ?? []).join("+")}:sig:${p.assinaturaCooperado?.trim() ? "1" : "0"}`
    );
  }

  for (const f of data.fichaCorrida) {
    if (!fichaPertenceCooperado(data, f, cooperadoId, cooperativaId)) continue;
    chunks.push(`f:${f.id}:${f.mesReferencia}:${f.updatedAt ?? ""}:${f.valorLiquido ?? 0}`);
  }

  for (const n of data.notasPedido) {
    if (!notaPertenceCooperado(data, n, cooperadoId, cooperativaId)) continue;
    chunks.push(`n:${n.id}:${n.status}:${n.mesReferencia}:${n.updatedAt ?? ""}`);
  }

  chunks.sort();
  const hbDescontosRev = getContaCoopDescontosRevision();
  return `${chunks.join("|")}|hbDescontosRev:${hbDescontosRev}`;
}

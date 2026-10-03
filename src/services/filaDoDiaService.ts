import type { AppData, PagamentoCooperadoRegistro } from "@/types";
import { contarItensCatalogo } from "@/services/catalogoContratosService";
import { getCurrentMesReferencia } from "@/utils/format";
import { pagamentoCobreMesReferencia } from "@/services/notaPedidoService";
import { getDataRevision } from "@/services/dataStore";
import {
  countCooperadosPagamentoPendenteResponsavel,
  countNotasFilaConferenciaResponsavel,
} from "@/services/responsavelPainelIndex";

export type FilaDoDiaItem = {
  id: string;
  titulo: string;
  detalhe: string;
  href: string;
  count: number;
  urgencia: "alta" | "media" | "baixa";
};

/** Inbox operacional do responsável — só o que exige ação hoje. */
export function getFilaDoDia(data: AppData, coopId: string | undefined, mes = getCurrentMesReferencia()): FilaDoDiaItem[] {
  if (!coopId) return [];

  const conferir = countNotasFilaConferenciaResponsavel(data, coopId);

  const mensalidades = data.mensalidades.filter((m) => {
    if (m.status !== "aguardando_confirmacao") return false;
    const c = data.cooperados.find((x) => x.id === m.cooperadoId);
    return !c?.cooperativaId || c.cooperativaId === coopId;
  }).length;

  const assinaturas = data.pagamentosCooperado.filter(
    (p) => p.cooperativaId === coopId && p.status === "aguardando_confirmacao"
  ).length;

  const recibosVerificar = data.pagamentosCooperado.filter(
    (p) =>
      p.cooperativaId === coopId &&
      p.status === "confirmado" &&
      Boolean(p.assinaturaCooperado?.trim()) &&
      !p.reciboConferidoPorResponsavelEm
  ).length;

  const cooperadosPagar = countCooperadosPagamentoPendenteResponsavel(data, coopId);

  const itensCatalogo = contarItensCatalogo(data, coopId);
  const publicarPrecos = itensCatalogo === 0 ? 1 : 0;

  const items: FilaDoDiaItem[] = [];

  if (conferir > 0) {
    items.push({
      id: "conferir",
      titulo: "Conferir entregas",
      detalhe: conferir === 1 ? "1 foto/entrega aguardando análise" : `${conferir} aguardando análise`,
      href: "/notas-pedido",
      count: conferir,
      urgencia: "alta",
    });
  }

  if (cooperadosPagar > 0) {
    items.push({
      id: "pagar",
      titulo: "Pagar cooperados",
      detalhe:
        cooperadosPagar === 1
          ? "1 cooperado com valor pronto para PIX"
          : `${cooperadosPagar} cooperados com valor para pagar`,
      href: "/ficha-corrida?aba=pagar",
      count: cooperadosPagar,
      urgencia: "alta",
    });
  }

  if (mensalidades > 0) {
    items.push({
      id: "mensalidades",
      titulo: "Confirmar mensalidades",
      detalhe:
        mensalidades === 1
          ? "1 comprovante aguardando confirmação"
          : `${mensalidades} comprovantes aguardando`,
      href: "/mensalidades",
      count: mensalidades,
      urgencia: "media",
    });
  }

  if (assinaturas > 0) {
    items.push({
      id: "assinaturas",
      titulo: "Falta assinar recibo",
      detalhe:
        assinaturas === 1
          ? "1 pagamento registrado — aguardando o cooperado"
          : `${assinaturas} pagamentos aguardando assinatura`,
      href: "/ficha-corrida?fila=assinaturas",
      count: assinaturas,
      urgencia: "media",
    });
  }

  if (recibosVerificar > 0) {
    items.push({
      id: "verificar-recibos",
      titulo: "Verificar recibos assinados",
      detalhe:
        recibosVerificar === 1
          ? "1 cooperado assinou — confira o recibo"
          : `${recibosVerificar} recibos assinados aguardando conferência`,
      href: "/ficha-corrida?fila=verificar-recibos",
      count: recibosVerificar,
      urgencia: "media",
    });
  }

  if (publicarPrecos > 0) {
    items.push({
      id: "contratos",
      titulo: "Publicar contratos e preços",
      detalhe: "Sem itens ativos — cooperados não veem catálogo",
      href: "/contratos",
      count: 1,
      urgencia: "baixa",
    });
  }

  return items;
}

type FilaDoDiaCache = {
  revision: number;
  coopKey: string;
  mes: string;
  items: FilaDoDiaItem[];
};

let filaDoDiaCache: FilaDoDiaCache | null = null;

export function getFilaDoDiaCached(
  data: AppData,
  coopId: string | undefined,
  mes = getCurrentMesReferencia()
): FilaDoDiaItem[] {
  const revision = getDataRevision();
  const coopKey = coopId ?? "";
  if (
    filaDoDiaCache &&
    filaDoDiaCache.revision === revision &&
    filaDoDiaCache.coopKey === coopKey &&
    filaDoDiaCache.mes === mes
  ) {
    return filaDoDiaCache.items;
  }
  const items = getFilaDoDia(data, coopId, mes);
  filaDoDiaCache = { revision, coopKey, mes, items };
  return items;
}

export function resetFilaDoDiaCacheForTests(): void {
  filaDoDiaCache = null;
}

export function listarPagamentosAguardandoAssinatura(
  data: AppData,
  coopId: string | undefined,
  mes?: string
): PagamentoCooperadoRegistro[] {
  if (!coopId) return [];
  return data.pagamentosCooperado
    .filter(
      (p) =>
        p.cooperativaId === coopId &&
        p.status === "aguardando_confirmacao" &&
        (!mes || pagamentoCobreMesReferencia(p, mes))
    )
    .sort((a, b) => b.pagoEm.localeCompare(a.pagoEm));
}

/** Recibo assinado pelo cooperado — aguarda conferência do responsável. */
export function listarPagamentosReciboAguardandoVerificacao(
  data: AppData,
  coopId: string | undefined
): PagamentoCooperadoRegistro[] {
  if (!coopId) return [];
  return data.pagamentosCooperado
    .filter(
      (p) =>
        p.cooperativaId === coopId &&
        p.status === "confirmado" &&
        Boolean(p.assinaturaCooperado?.trim()) &&
        !p.reciboConferidoPorResponsavelEm
    )
    .sort((a, b) => (b.assinadoEm ?? b.updatedAt ?? b.pagoEm).localeCompare(a.assinadoEm ?? a.updatedAt ?? a.pagoEm));
}

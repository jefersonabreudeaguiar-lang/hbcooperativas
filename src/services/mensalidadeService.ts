import type { AppData, Mensalidade } from "@/types";
import { getCurrentMesReferencia } from "@/utils/format";
import { normalizeCnpj } from "@/utils/cooperativa";

function newId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function vencimentoDoMes(mesReferencia: string, dia: number): string {
  const diaStr = String(Math.min(Math.max(dia, 1), 28)).padStart(2, "0");
  return `${mesReferencia}-${diaStr}`;
}

function criarMensalidade(
  cooperadoId: string,
  mes: string,
  valor: number,
  diaVencimento: number,
  now: string
): Mensalidade {
  return {
    id: newId("m"),
    cooperadoId,
    mesReferencia: mes,
    valor,
    vencimento: vencimentoDoMes(mes, diaVencimento),
    status: "pendente",
    observacao: "Gerada automaticamente",
    createdAt: now,
    updatedAt: now,
  };
}

/** Chave PIX da cooperativa para pagamento de mensalidade (CNPJ). */
export function getChavePixMensalidadeCooperativa(data: AppData, cooperativaId: string): string | null {
  const coop = data.cooperativas.find((c) => c.id === cooperativaId);
  if (!coop?.cnpj) return null;
  const digits = normalizeCnpj(coop.cnpj);
  return digits.length === 14 ? digits : null;
}

export function getCooperativaIdDoCooperado(data: AppData, cooperadoId: string): string | undefined {
  return data.cooperados.find((c) => c.id === cooperadoId)?.cooperativaId;
}

/** Gera mensalidade do mês atual para um cooperado recém-cadastrado. */
export function ensureMensalidadeCooperado(data: AppData, cooperadoId: string): AppData | null {
  const cooperado = data.cooperados.find((c) => c.id === cooperadoId);
  if (!cooperado || cooperado.status !== "ativo") return null;

  const coop = data.cooperativas.find((c) => c.id === cooperado.cooperativaId);
  const cfg = coop?.mensalidadeConfig;
  if (!cfg?.gerarAutomaticamente || cfg.valorPadrao <= 0) return null;

  const mes = getCurrentMesReferencia();
  const jaExiste = data.mensalidades.some(
    (m) => m.cooperadoId === cooperadoId && m.mesReferencia === mes
  );
  if (jaExiste) return null;

  const now = new Date().toISOString();
  return {
    ...data,
    mensalidades: [
      ...data.mensalidades,
      criarMensalidade(cooperadoId, mes, cfg.valorPadrao, cfg.diaVencimento, now),
    ],
  };
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

      mensalidades.push(
        criarMensalidade(cooperado.id, mes, cfg.valorPadrao, cfg.diaVencimento, now)
      );
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

/** Cooperado informou que pagou via PIX — aguarda confirmação. */
export function cooperadoInformouPagamentoMensalidade(
  data: AppData,
  mensalidadeId: string
): AppData | null {
  const m = data.mensalidades.find((x) => x.id === mensalidadeId);
  if (!m || (m.status !== "pendente" && m.status !== "atrasada")) return null;

  const now = new Date().toISOString();
  return {
    ...data,
    mensalidades: data.mensalidades.map((x) =>
      x.id === mensalidadeId
        ? {
            ...x,
            status: "aguardando_confirmacao" as const,
            informadoPagamentoEm: now,
            formaPagamento: "PIX",
            updatedAt: now,
          }
        : x
    ),
  };
}

/** Diretoria confirma recebimento do PIX. */
export function confirmarPagamentoMensalidade(
  data: AppData,
  mensalidadeId: string,
  responsavel: string
): AppData | null {
  const m = data.mensalidades.find((x) => x.id === mensalidadeId);
  if (!m || m.status !== "aguardando_confirmacao") return null;

  const hoje = new Date().toISOString().split("T")[0];
  const now = new Date().toISOString();
  return {
    ...data,
    mensalidades: data.mensalidades.map((x) =>
      x.id === mensalidadeId
        ? {
            ...x,
            status: "paga" as const,
            dataPagamento: hoje,
            formaPagamento: x.formaPagamento ?? "PIX",
            observacao: x.observacao
              ? `${x.observacao} · Confirmado por ${responsavel}`
              : `Confirmado por ${responsavel}`,
            updatedAt: now,
          }
        : x
    ),
  };
}

export function mensalidadePodePagarComPix(m: Mensalidade): boolean {
  return m.status === "pendente" || m.status === "atrasada";
}

export function mensalidadeAguardandoConfirmacao(m: Mensalidade): boolean {
  return m.status === "aguardando_confirmacao";
}

/**
 * Auditoria remota somente de leitura: formato de notas/fichas e escopo multi-tenant.
 * Não mostra nomes, CPFs, IDs de cooperados, valores individuais nem grava no Supabase.
 * Uso: npx tsx scripts/audit-operacional-paridade-readonly.ts [cnpj]
 */
import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { AppData } from "../src/types";
import { cooperativaFromCloudRow } from "../src/utils/cooperativaCadastro";
import { normalizeCnpj } from "../src/utils/cooperativa";
import { fetchCooperadosFromStorage } from "../src/lib/supabase/cooperadosStorage";
import { fetchNotasFromStorage, fetchNotasFromTable, mergeNotasSources } from "../src/lib/supabase/notasStorage";
import { fetchContratosSync, fetchOperacionalSync } from "../src/lib/supabase/cooperativaSyncStorage";
import { mergeContratosIntoData, mergeOperacionalIntoData } from "../src/services/cooperativaSyncCloudService";
import { mergeCloudCooperadosIntoData } from "../src/services/cooperadoCloudService";
import { reconciliarFichaFromNotasConferidas } from "../src/services/notaPedidoService";

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

function emptyAppData(): AppData {
  return {
    cooperativas: [], users: [], cooperados: [], mensalidades: [], cotas: [], instituicoes: [],
    produtosInstituicao: [], notasPedido: [], fichaCorrida: [], pagamentosCooperado: [],
    arquivosMensais: [], ajustesFichaMes: [], entregas: [], descontos: [], valoresAvulsosReceber: [],
    pagamentos: [], financeiro: [], comunicados: [], reclamacoes: [], votacaoPautas: [],
    votacaoVotos: [], propriedades: [], veiculos: [], fechamentos: [], livroCaixa: [],
    prestacoesContas: [], auditLog: [], config: { descontoPadraoCooperativa: 5 },
  };
}

function groupCount<T>(items: T[], key: (item: T) => string): Record<string, number> {
  return items.reduce<Record<string, number>>((counts, item) => {
    const value = key(item) || "(vazio)";
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

async function main() {
  loadEnvFile(resolve(process.cwd(), ".env.local"));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Configure o ambiente local antes de auditar.");

  const cnpj = normalizeCnpj(process.argv[2] ?? "62351750000165");
  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false }, realtime: { transport: ws },
  });
  const { data: rows, error } = await supabase.from("cooperativas").select("*").eq("cnpj", cnpj);
  if (error) throw error;
  if (!rows?.length) throw new Error("Cooperativa não encontrada.");
  const coop = cooperativaFromCloudRow(rows[0] as Record<string, unknown>);

  const [cloudCooperados, storageNotas, tableResult, contratos, operacional] = await Promise.all([
    fetchCooperadosFromStorage(supabase, cnpj),
    fetchNotasFromStorage(supabase, cnpj),
    fetchNotasFromTable(supabase, cnpj),
    fetchContratosSync(supabase, cnpj),
    fetchOperacionalSync(supabase, cnpj),
  ]);
  if (!operacional) throw new Error("operacional.json ausente.");

  const notas = mergeNotasSources(tableResult.notas, storageNotas).map((nota) => ({
    ...nota, cooperativaId: nota.cooperativaId ?? coop.id,
  }));
  let data = emptyAppData();
  data.cooperativas = [coop];
  data = mergeCloudCooperadosIntoData(data, cloudCooperados, cnpj, coop.id);
  data = { ...data, notasPedido: notas };
  if (contratos) data = mergeContratosIntoData(data, contratos, coop.id);
  data = mergeOperacionalIntoData(data, operacional, coop.id, cloudCooperados);

  const notasVazias = data.notasPedido.filter((nota) => !(nota.itens?.length));
  const tableById = new Map(tableResult.notas.map((nota) => [nota.id, nota]));
  const storageById = new Map(storageNotas.map((nota) => [nota.id, nota]));
  const sumMoney = (values: number[]) => Math.round(values.reduce((total, value) => total + value, 0) * 100) / 100;
  const aggregateItems = (items: Array<{
    produtoInstituicaoId?: string;
    produtoNome?: string;
    unidade?: string;
    quantidade?: number;
    valorBruto?: number;
  }>) => {
    const map = new Map<string, { quantidade: number; valorBruto: number }>();
    for (const item of items) {
      const id = item.produtoInstituicaoId?.trim();
      const nome = (item.produtoNome ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("pt-BR");
      const key = id ? `id:${id}` : `nome:${nome}|${(item.unidade ?? "").trim().toLowerCase()}`;
      const prior = map.get(key) ?? { quantidade: 0, valorBruto: 0 };
      prior.quantidade += Number(item.quantidade) || 0;
      prior.valorBruto += Number(item.valorBruto) || 0;
      map.set(key, prior);
    }
    return map;
  };
  const mismatch = data.notasPedido.flatMap((nota) => {
    const fichas = data.fichaCorrida.filter((ficha) => ficha.notaPedidoId === nota.id);
    const fichaBruto = Math.round(fichas.reduce((sum, ficha) => sum + (ficha.valorBruto ?? 0), 0) * 100) / 100;
    const fichaLiquido = Math.round(fichas.reduce((sum, ficha) => sum + (ficha.valorLiquido ?? 0), 0) * 100) / 100;
    const notaBruto = Math.round((nota.valorBruto ?? 0) * 100) / 100;
    const notaLiquido = Math.round((nota.valorLiquido ?? 0) * 100) / 100;
    const notaItensBruto = sumMoney((nota.itens ?? []).map((item) => Number(item.valorBruto) || 0));
    const notaItensPorQuantidadePreco = sumMoney((nota.itens ?? []).map(
      (item) => (Number(item.quantidade) || 0) * (Number(item.precoUnitario) || 0)
    ));
    const fichaItensBruto = sumMoney(fichas.flatMap((ficha) =>
      (ficha.itens ?? []).map((item) => Number(item.valorBruto) || 0)
    ));
    return Math.abs(fichaBruto - notaBruto) > 0.02
      ? [{
          nota, fichas, fichaBruto, notaBruto, fichaLiquido, notaLiquido,
          notaItensBruto, notaItensPorQuantidadePreco, fichaItensBruto,
        }]
      : [];
  });
  const mismatchIdsForRawFichas = new Set(mismatch.map(({ nota }) => nota.id));
  const rawFichasByNota = new Map<string, NonNullable<typeof operacional.fichaCorrida>>();
  for (const ficha of operacional.fichaCorrida ?? []) {
    if (!mismatchIdsForRawFichas.has(ficha.notaPedidoId)) continue;
    const current = rawFichasByNota.get(ficha.notaPedidoId) ?? [];
    current.push(ficha);
    rawFichasByNota.set(ficha.notaPedidoId, current);
  }
  // Simula a reconciliação em memória, sem persistir; mede se a regra atual explica os pagos.
  const reconciledData = reconciliarFichaFromNotasConferidas(data);
  const paidMismatchReconciliation = mismatch
    .filter(({ nota }) => nota.status === "pago")
    .map(({ nota }) => {
      const reconciledNota = reconciledData.notasPedido.find((item) => item.id === nota.id);
      const fichaBrutoAntes = sumMoney(data.fichaCorrida
        .filter((ficha) => ficha.notaPedidoId === nota.id)
        .map((ficha) => ficha.valorBruto ?? 0));
      const fichaBrutoDepois = sumMoney(reconciledData.fichaCorrida
        .filter((ficha) => ficha.notaPedidoId === nota.id)
        .map((ficha) => ficha.valorBruto ?? 0));
      return {
        notaBrutoAntes: nota.valorBruto ?? 0,
        notaBrutoDepois: reconciledNota?.valorBruto ?? 0,
        fichaBrutoAntes,
        fichaBrutoDepois,
      };
    });
  const mismatchNotaIds = new Set(mismatch.map(({ nota }) => nota.id));
  const paymentsLinkedToMismatch = data.pagamentosCooperado.filter(
    (payment) => payment.cooperativaId === coop.id &&
      (payment.notaPedidoIds ?? []).some((notaId) => mismatchNotaIds.has(notaId))
  );
  const mismatchFichaIds = [...new Set(mismatch.flatMap(({ fichas }) => fichas.map((ficha) => ficha.id)))];
  const { data: auditRows, error: auditError } = await supabase
    .from("cooperative_audit_log")
    .select("entity_type, entity_id, action, occurred_at, summary, changes")
    .eq("cooperative_cnpj", cnpj)
    .in("entity_id", [...mismatchNotaIds, ...mismatchFichaIds]);
  const auditEntries = auditRows ?? [];
  const latestPaymentByNota = new Map<string, number>();
  for (const payment of data.pagamentosCooperado) {
    if (payment.cooperativaId !== coop.id || payment.status !== "confirmado" || !payment.pagoEm) continue;
    const paymentTime = Date.parse(payment.pagoEm);
    if (!Number.isFinite(paymentTime)) continue;
    for (const notaId of payment.notaPedidoIds ?? []) {
      latestPaymentByNota.set(notaId, Math.max(latestPaymentByNota.get(notaId) ?? 0, paymentTime));
    }
  }
  const noteAuditEventsAfterPayment = auditEntries.filter((event) => {
    if (event.entity_type !== "nota_pedido") return false;
    const paymentTime = latestPaymentByNota.get(String(event.entity_id));
    const eventTime = Date.parse(String(event.occurred_at ?? ""));
    return Boolean(paymentTime && Number.isFinite(eventTime) && eventTime > paymentTime + 60_000);
  });
  const notaApprovalEvents = auditEntries.filter((event) =>
    event.entity_type === "nota_pedido" && event.action === "aprovar"
  );
  const notaApprovalCounts = groupCount(notaApprovalEvents, (event) => String(event.entity_id));
  const latestApprovalByNota = new Map<string, (typeof notaApprovalEvents)[number]>();
  for (const event of notaApprovalEvents) {
    const prior = latestApprovalByNota.get(String(event.entity_id));
    if (!prior || Date.parse(String(event.occurred_at)) > Date.parse(String(prior.occurred_at))) {
      latestApprovalByNota.set(String(event.entity_id), event);
    }
  }
  const approvalChangeCategory = (event: (typeof notaApprovalEvents)[number]) => {
    const text = `${event.summary ?? ""} ${event.changes ?? ""}`.toLowerCase();
    if (/dividid/.test(text)) return "divisao";
    if (/foto/.test(text)) return "multi_foto";
    if (/realinhad|realinh/.test(text)) return "realinhamento_ficha";
    if (/conferid|aprova/.test(text)) return "conferencia_padrao";
    return "sem_detalhe";
  };
  const isAfter = (later?: string, earlier?: string) => {
    if (!later || !earlier) return false;
    const laterTs = Date.parse(later);
    const earlierTs = Date.parse(earlier);
    return Number.isFinite(laterTs) && Number.isFinite(earlierTs) && laterTs > earlierTs + 60_000;
  };
  const paymentScopes = paymentsLinkedToMismatch.map((payment) => {
    const scopedNotaIds = new Set(payment.notaPedidoIds ?? []);
    const scopedFichaIds = new Set(payment.fichaIds ?? []);
    const scopedNotas = data.notasPedido.filter((nota) => scopedNotaIds.has(nota.id));
    const scopedFichas = data.fichaCorrida.filter((ficha) =>
      scopedFichaIds.has(ficha.id) || scopedNotaIds.has(ficha.notaPedidoId)
    );
    const sum = (values: number[]) => Math.round(values.reduce((total, value) => total + value, 0) * 100) / 100;
    return {
      payment,
      scopedNotaCount: scopedNotas.length,
      scopedFichaCount: scopedFichas.length,
      notaBruto: sum(scopedNotas.map((nota) => nota.valorBruto ?? 0)),
      fichaBruto: sum(scopedFichas.map((ficha) => ficha.valorBruto ?? 0)),
      fichaLiquido: sum(scopedFichas.map((ficha) => ficha.valorLiquido ?? 0)),
      notaAtualizadaDepoisDoPagamento: scopedNotas.some((nota) => isAfter(nota.updatedAt, payment.pagoEm)),
      fichaAtualizadaDepoisDoPagamento: scopedFichas.some((ficha) => isAfter(ficha.updatedAt, payment.pagoEm)),
    };
  });
  const paymentsById = new Map(paymentScopes.map((scope) => [scope.payment.id, scope]));
  const mismatchNotePaymentCounts = mismatch.map(({ nota }) =>
    data.pagamentosCooperado.filter((payment) =>
      payment.cooperativaId === coop.id && payment.status === "confirmado" &&
      (payment.notaPedidoIds ?? []).includes(nota.id)
    ).length
  );
  const itemPayload = (nota: (typeof notasVazias)[number]) => Boolean(
    nota.fotoPedido || nota.fotosPedido?.length || nota.fotosMeta?.length || nota.fotoNaNuvem || nota.lancamentoDireto
  );
  const temFoto = (nota: (typeof notasVazias)[number]) => Boolean(
    nota.fotoPedido || nota.fotosPedido?.length || nota.fotosMeta?.length || nota.fotoNaNuvem
  );
  const multipleCoopsCooperadoIds = Object.entries(groupCount(
    data.cooperados,
    (cooperado) => cooperado.id
  )).filter(([, count]) => count > 1).length;

  console.log("=== Auditoria operacional (somente leitura; sem identificadores pessoais) ===");
  console.log(JSON.stringify({
    cnpjConsultado: "62351750000165",
    fonte: "Supabase oficial; somente leitura",
    registros: {
      cooperados: data.cooperados.length,
      notas: data.notasPedido.length,
      fichas: data.fichaCorrida.length,
    },
    notasSemItens: {
      total: notasVazias.length,
      porStatus: groupCount(notasVazias, (nota) => nota.status),
      porStatusETipo: groupCount(notasVazias, (nota) =>
        `${nota.status}:${temFoto(nota) ? "com_foto" : "sem_foto"}:${nota.lancamentoDireto ? "avulsa" : "normal"}`
      ),
      comFoto: notasVazias.filter(temFoto).length,
      avulsasDiretas: notasVazias.filter((nota) => nota.lancamentoDireto).length,
      comFotoEAvulsaDireta: notasVazias.filter((nota) => temFoto(nota) && nota.lancamentoDireto).length,
      semFotoNemAvulso: notasVazias.filter((nota) => !itemPayload(nota)).length,
      conferidasSemItensComFoto: notasVazias.filter((nota) => nota.status === "conferida" && temFoto(nota)).length,
      conferidasSemItensAvulsas: notasVazias.filter((nota) => nota.status === "conferida" && nota.lancamentoDireto).length,
      fonteComItensParaNotaVazia: {
        tabelaSql: notasVazias.filter((nota) => (tableById.get(nota.id)?.itens?.length ?? 0) > 0).length,
        storageJson: notasVazias.filter((nota) => (storageById.get(nota.id)?.itens?.length ?? 0) > 0).length,
        nenhumaFonteTemItens: notasVazias.filter((nota) =>
          !(tableById.get(nota.id)?.itens?.length) && !(storageById.get(nota.id)?.itens?.length)
        ).length,
      },
    },
    notaVsFichaBruto: {
      totalDivergente: mismatch.length,
      porStatus: groupCount(mismatch, ({ nota }) => nota.status),
      fichasDaNotaPorStatus: groupCount(mismatch.flatMap(({ fichas }) => fichas), (ficha) => ficha.status),
      porMes: groupCount(mismatch, ({ nota }) => nota.mesReferencia),
      porMesDeCriacaoDaNota: groupCount(mismatch, ({ nota }) =>
        String(nota.createdAt ?? "sem_data").slice(0, 7)
      ),
      porDiaDeCriacaoDaNota: groupCount(mismatch, ({ nota }) =>
        String(nota.createdAt ?? "sem_data").slice(0, 10)
      ),
      sentido: {
        fichaMenorQueNota: mismatch.filter(({ fichaBruto, notaBruto }) => fichaBruto < notaBruto).length,
        fichaMaiorQueNota: mismatch.filter(({ fichaBruto, notaBruto }) => fichaBruto > notaBruto).length,
      },
      faixasRelacaoBrutoFichaNota: groupCount(mismatch, ({ fichaBruto, notaBruto }) => {
        if (notaBruto <= 0) return "nota_bruta_zero";
        const ratio = fichaBruto / notaBruto;
        if (ratio < 0.01) return "ficha_ate_1pct";
        if (ratio <= 0.26) return "ficha_ate_26pct";
        if (ratio <= 0.51) return "ficha_ate_51pct";
        if (ratio <= 0.76) return "ficha_ate_76pct";
        if (ratio <= 0.99) return "ficha_ate_99pct";
        return "ficha_acima_da_nota";
      }),
      razoesExatasFichabrutoNotaBruto: {
        metade: mismatch.filter(({ fichaBruto, notaBruto }) => Math.abs(fichaBruto / notaBruto - 0.5) <= 0.02).length,
        terco: mismatch.filter(({ fichaBruto, notaBruto }) => Math.abs(fichaBruto / notaBruto - 1 / 3) <= 0.02).length,
        quarto: mismatch.filter(({ fichaBruto, notaBruto }) => Math.abs(fichaBruto / notaBruto - 0.25) <= 0.02).length,
      },
      divergenciasNoLiquido: mismatch.filter(({ fichaLiquido, notaLiquido }) => Math.abs(fichaLiquido - notaLiquido) > 0.02).length,
      composicaoDosValores: {
        posicaoDaFotoNaFichaUnica: groupCount(mismatch, ({ nota, fichas }) => {
          const ficha = fichas[0];
          const match = ficha?.descricao?.match(/\(foto\s+(\d+)\s*\/\s*(\d+)\)/i);
          return match ? `${match[1]}/${match[2]}` : "sem_marcacao_foto";
        }),
        fichaUnicaComIdDeFatiaFoto: mismatch.filter(({ fichas }) =>
          fichas.length === 1 && /_f\d+(?:_|$)/.test(fichas[0].id)
        ).length,
        fotosEnviadasCountDasNotasPagas: groupCount(
          mismatch.filter(({ nota }) => nota.status === "pago"),
          ({ nota }) => String(nota.fotosEnviadasCount ?? nota.fotosPedido?.length ?? (nota.fotoPedido ? 1 : 0))
        ),
        quantidadeFotosMetaDasNotasPagas: groupCount(
          mismatch.filter(({ nota }) => nota.status === "pago"),
          ({ nota }) => String(nota.fotosMeta?.length ?? 0)
        ),
        fichaBrutoProximoDeUmaFatiaIgualPorFoto: mismatch.filter(({ nota, fichaBruto, notaBruto }) => {
          const fotos = nota.fotosEnviadasCount ?? nota.fotosPedido?.length ?? (nota.fotoPedido ? 1 : 0);
          return fotos > 1 && Math.abs(fichaBruto - notaBruto / fotos) <= Math.max(0.02, notaBruto * 0.015);
        }).length,
        pagasDivergentesComItensNaNota: mismatch.filter(({ nota }) =>
          nota.status === "pago" && (nota.itens?.length ?? 0) > 0
        ).length,
        notaBrutoIgualSomaValorBrutoItens: mismatch.filter(({ notaBruto, notaItensBruto }) =>
          Math.abs(notaBruto - notaItensBruto) <= 0.02
        ).length,
        notaBrutoIgualSomaQuantidadeVezesPreco: mismatch.filter(({ notaBruto, notaItensPorQuantidadePreco }) =>
          Math.abs(notaBruto - notaItensPorQuantidadePreco) <= 0.02
        ).length,
        fichaBrutoIgualSomaItensDasFichas: mismatch.filter(({ fichaBruto, fichaItensBruto }) =>
          Math.abs(fichaBruto - fichaItensBruto) <= 0.02
        ).length,
        notaItensBrutoIgualFichaItensBruto: mismatch.filter(({ notaItensBruto, fichaItensBruto }) =>
          Math.abs(notaItensBruto - fichaItensBruto) <= 0.02
        ).length,
        mesmoConjuntoDeProdutosNotaEFicha: mismatch.filter(({ nota, fichas }) => {
          const notaKeys = aggregateItems(nota.itens ?? []);
          const fichaKeys = aggregateItems(fichas.flatMap((ficha) => ficha.itens ?? []));
          return notaKeys.size === fichaKeys.size && [...notaKeys.keys()].every((key) => fichaKeys.has(key));
        }).length,
        fichaProdutosTodosExistemNaNota: mismatch.filter(({ nota, fichas }) => {
          const notaKeys = aggregateItems(nota.itens ?? []);
          const fichaKeys = aggregateItems(fichas.flatMap((ficha) => ficha.itens ?? []));
          return [...fichaKeys.keys()].every((key) => notaKeys.has(key));
        }).length,
        mesmaQuantidadePorProduto: mismatch.filter(({ nota, fichas }) => {
          const notaKeys = aggregateItems(nota.itens ?? []);
          const fichaKeys = aggregateItems(fichas.flatMap((ficha) => ficha.itens ?? []));
          return notaKeys.size === fichaKeys.size && [...notaKeys].every(([key, item]) =>
            Math.abs(item.quantidade - (fichaKeys.get(key)?.quantidade ?? Number.NaN)) <= 0.01
          );
        }).length,
        fichaTemQuantidadeMenorPorProduto: mismatch.filter(({ nota, fichas }) => {
          const notaKeys = aggregateItems(nota.itens ?? []);
          const fichaKeys = aggregateItems(fichas.flatMap((ficha) => ficha.itens ?? []));
          return fichaKeys.size > 0 && [...fichaKeys].every(([key, item]) => {
            const notaItem = notaKeys.get(key);
            return Boolean(notaItem && item.quantidade <= notaItem.quantidade + 0.01);
          }) && [...fichaKeys].some(([key, item]) =>
            item.quantidade < (notaKeys.get(key)?.quantidade ?? item.quantidade) - 0.01
          );
        }).length,
        mesmaQuantidadePorProdutoMasBrutoDiferente: mismatch.filter(({ nota, fichas }) => {
          const notaKeys = aggregateItems(nota.itens ?? []);
          const fichaKeys = aggregateItems(fichas.flatMap((ficha) => ficha.itens ?? []));
          return notaKeys.size === fichaKeys.size && [...notaKeys].every(([key, item]) => {
            const fichaItem = fichaKeys.get(key);
            return Boolean(fichaItem && Math.abs(item.quantidade - fichaItem.quantidade) <= 0.01);
          }) && [...notaKeys].some(([key, item]) =>
            Math.abs(item.valorBruto - (fichaKeys.get(key)?.valorBruto ?? item.valorBruto)) > 0.02
          );
        }).length,
        ficheRawVsMerge: {
          notasComMaisDeUmaFichaNoJsonOriginal: mismatch.filter(({ nota }) =>
            (rawFichasByNota.get(nota.id)?.length ?? 0) > 1
          ).length,
          fichasExtrasRemovidasAoCombinarFontes: mismatch.reduce((total, { nota, fichas }) =>
            total + Math.max(0, (rawFichasByNota.get(nota.id)?.length ?? 0) - fichas.length),
          0),
          brutoDasFichasOriginaisIgualBrutoDaNota: mismatch.filter(({ nota }) => {
            const raw = rawFichasByNota.get(nota.id) ?? [];
            return raw.length > 0 && Math.abs(sumMoney(raw.map((ficha) => ficha.valorBruto ?? 0)) - (nota.valorBruto ?? 0)) <= 0.02;
          }).length,
          originalBatiaNotaMasFichaAtualNao: mismatch.filter(({ nota, fichaBruto }) => {
            const raw = rawFichasByNota.get(nota.id) ?? [];
            return raw.length > 0 &&
              Math.abs(sumMoney(raw.map((ficha) => ficha.valorBruto ?? 0)) - (nota.valorBruto ?? 0)) <= 0.02 &&
              Math.abs(fichaBruto - (nota.valorBruto ?? 0)) > 0.02;
          }).length,
        },
      },
      trilhaAuditoriaRelacionada: {
        disponivel: !auditError,
        eventosNotaEFicha: auditEntries.length,
        entidadesComEventoDeAprovacao: new Set(notaApprovalEvents.map((event) => String(event.entity_id))).size,
        eventosPorTipoDeEntidade: groupCount(auditEntries, (event) => String(event.entity_type ?? "")),
        eventosPorAcao: groupCount(auditEntries, (event) => String(event.action ?? "")),
        notasComEventoAposPagamentoConfirmado: new Set(noteAuditEventsAfterPayment.map((event) => event.entity_id)).size,
        eventosAposPagamentoPorAcao: groupCount(noteAuditEventsAfterPayment, (event) => String(event.action ?? "")),
        correcoesOuConferenciasAposPagamento: noteAuditEventsAfterPayment.filter((event) =>
          /confer|corrig|revis|alter|editar/i.test(`${event.summary ?? ""} ${event.changes ?? ""}`)
        ).length,
        conferenciasHistoricasPorCategoria: groupCount(notaApprovalEvents, approvalChangeCategory),
        notasComMaisDeUmaConferenciaRegistrada: Object.values(notaApprovalCounts).filter((count) => count > 1).length,
        ultimaConferenciaPorCategoria: groupCount([...latestApprovalByNota.values()], approvalChangeCategory),
        ultimaConferenciaPorMes: groupCount([...latestApprovalByNota.values()], (event) =>
          String(event.occurred_at ?? "sem_data").slice(0, 7)
        ),
        eventosDeAprovacaoPorDia: groupCount(notaApprovalEvents, (event) =>
          String(event.occurred_at ?? "sem_data").slice(0, 10)
        ),
      },
      simulacaoReconciliacaoMemoriaSemPersistir: {
        notasPagasDivergentesAvaliadas: paidMismatchReconciliation.length,
        notaBrutoAlteradoPelaRegraAtual: paidMismatchReconciliation.filter(
          (row) => Math.abs(row.notaBrutoDepois - row.notaBrutoAntes) > 0.02
        ).length,
        fichaBrutoAlteradoPelaRegraAtual: paidMismatchReconciliation.filter(
          (row) => Math.abs(row.fichaBrutoDepois - row.fichaBrutoAntes) > 0.02
        ).length,
        divergenciasPagasRestantesAposRegraAtual: paidMismatchReconciliation.filter(
          (row) => Math.abs(row.notaBrutoDepois - row.fichaBrutoDepois) > 0.02
        ).length,
      },
      comFichaDeOutroCooperado: mismatch.filter(({ nota, fichas }) =>
        fichas.some((ficha) => ficha.cooperadoId !== nota.cooperadoId)
      ).length,
      referenciasPagamento: {
        notaIdsVinculadosExplicitamente: mismatch.filter(({ nota }) =>
          data.pagamentosCooperado.some((pagamento) =>
            pagamento.cooperativaId === coop.id && pagamento.notaPedidoIds?.includes(nota.id)
          )
        ).length,
        fichaIdsVinculadosExplicitamente: mismatch.filter(({ fichas }) => {
          const fichaIds = new Set(fichas.map((ficha) => ficha.id));
          return data.pagamentosCooperado.some((pagamento) =>
            pagamento.cooperativaId === coop.id && (pagamento.fichaIds ?? []).some((id) => fichaIds.has(id))
          );
        }).length,
        semReferenciaExplicitaMasPagamentoNoMes: mismatch.filter(({ nota }) =>
          data.pagamentosCooperado.some((pagamento) =>
            pagamento.cooperativaId === coop.id && pagamento.cooperadoId === nota.cooperadoId &&
            (pagamento.mesesReferencia?.includes(nota.mesReferencia) || pagamento.mesReferencia === nota.mesReferencia)
          ) && !data.pagamentosCooperado.some((pagamento) =>
            pagamento.cooperativaId === coop.id && pagamento.notaPedidoIds?.includes(nota.id)
          )
        ).length,
        notasComMaisDeUmPagamentoConfirmado: mismatchNotePaymentCounts.filter((count) => count > 1).length,
        pagamentosVinculadosPorStatus: groupCount(paymentsLinkedToMismatch, (payment) => payment.status),
        pagamentosComMaisDeUmaNota: [...paymentsById.values()].filter((scope) => scope.scopedNotaCount > 1).length,
        pagamentosEscopoIncompletoNotasVsFichas: [...paymentsById.values()].filter(
          (scope) => scope.scopedNotaCount !== scope.scopedFichaCount
        ).length,
        pagamentosBrutoIgualNotasVinculadas: [...paymentsById.values()].filter(
          (scope) => Math.abs(scope.payment.valorBruto - scope.notaBruto) <= 0.02
        ).length,
        pagamentosBrutoIgualFichasVinculadas: [...paymentsById.values()].filter(
          (scope) => Math.abs(scope.payment.valorBruto - scope.fichaBruto) <= 0.02
        ).length,
        pagamentosLiquidoIgualFichasVinculadas: [...paymentsById.values()].filter(
          (scope) => Math.abs(scope.payment.valorLiquido - scope.fichaLiquido) <= 0.02
        ).length,
        pagamentosComNotaAtualizadaDepoisDoPagamento: [...paymentsById.values()].filter(
          (scope) => scope.notaAtualizadaDepoisDoPagamento
        ).length,
        pagamentosComFichaAtualizadaDepoisDoPagamento: [...paymentsById.values()].filter(
          (scope) => scope.fichaAtualizadaDepoisDoPagamento
        ).length,
      },
      umaFicha: mismatch.filter(({ fichas }) => fichas.length === 1).length,
      maisDeUmaFicha: mismatch.filter(({ fichas }) => fichas.length > 1).length,
      comDivisao: mismatch.filter(({ nota }) => (nota.divisaoEntrega?.participantes.length ?? 0) > 1).length,
      semFicha: mismatch.filter(({ fichas }) => fichas.length === 0).length,
      fichasComCooperativaDiferente: data.fichaCorrida.filter(
        (ficha) => ficha.cooperativaId && ficha.cooperativaId !== coop.id
      ).length,
      notasComCooperativaDiferente: data.notasPedido.filter(
        (nota) => nota.cooperativaId && nota.cooperativaId !== coop.id
      ).length,
      classificadosComoFracaoIgualPorParticipante: mismatch.filter(({ nota, fichaBruto, notaBruto }) => {
        const participantes = nota.divisaoEntrega?.participantes.length ?? 0;
        return participantes > 1 && Math.abs(fichaBruto - notaBruto / participantes) <= 0.02;
      }).length,
    },
    cooperadoIdsDuplicadosNaCooperativa: multipleCoopsCooperadoIds,
  }, null, 2));
}

main().catch((error) => {
  console.error("Auditoria encerrada com erro:", error instanceof Error ? error.message : "erro desconhecido");
  process.exitCode = 1;
});

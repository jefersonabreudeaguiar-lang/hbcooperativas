import type { AppData, EmissorRelatorio } from "@/types";
import { calcularConciliacaoMensal, getDemonstrativoPagamentosMes } from "@/services/conciliacaoMensalService";
import {
  auditLogParaExportacao,
  getExtratoContaCoopMes,
  getMapaReceitasContrato,
  getParecerContabilMes,
  getRazaoAnaliticoTodosCooperados,
} from "@/services/contadorRelatorioService";
import {
  getSnapshotFechamentoMes,
  parseSnapshotPayload,
  verificarIntegridadeSnapshot,
} from "@/services/fechamentoSnapshotService";
import { getCooperativaById } from "@/utils/cooperativa";
import {
  gerarRelatorioAssembleiaHtml,
  gerarRelatorioConciliacaoHtml,
  gerarRelatorioDemonstrativoPagamentosHtml,
  gerarRelatorioExtratoContaCoopHtml,
  gerarRelatorioFechamentoHtml,
  gerarRelatorioIndiceDossieHtml,
  gerarRelatorioMapaReceitasHtml,
  gerarRelatorioParecerContabilHtml,
  gerarRelatorioRazaoAnaliticoHtml,
} from "@/utils/relatorioHtml";
import type { DossieArquivo } from "@/utils/downloadDossie";

function auditCsv(entries: ReturnType<typeof auditLogParaExportacao>): string {
  const header = "data;usuario;acao;entidade;resumo";
  const rows = entries.map((e) =>
    [
      e.timestamp,
      e.userName.replace(/;/g, ","),
      e.action,
      e.entityType,
      (e.changes ?? e.justification ?? "").replace(/;/g, ",").replace(/\n/g, " "),
    ].join(";")
  );
  return [header, ...rows].join("\n");
}

export function buildDossieMensalArquivos(
  data: AppData,
  mesReferencia: string,
  cooperativaId: string,
  emissor?: EmissorRelatorio
): DossieArquivo[] {
  const coop = getCooperativaById(data, cooperativaId);
  const fechamento = data.fechamentos.find((f) => f.mesReferencia === mesReferencia);
  const conciliacao = calcularConciliacaoMensal(data, mesReferencia, cooperativaId);
  const demonstrativo = getDemonstrativoPagamentosMes(data, mesReferencia);
  const mapa = getMapaReceitasContrato(data, mesReferencia, cooperativaId);
  const extrato = getExtratoContaCoopMes(data, mesReferencia, cooperativaId);
  const razoes = getRazaoAnaliticoTodosCooperados(data, mesReferencia, cooperativaId);
  const parecer = getParecerContabilMes(data, cooperativaId, mesReferencia);
  const snapshot = getSnapshotFechamentoMes(data, cooperativaId, mesReferencia);
  const audit = auditLogParaExportacao(data, mesReferencia);

  const arquivos: DossieArquivo[] = [
    {
      path: "00-indice.html",
      content: gerarRelatorioIndiceDossieHtml(data, mesReferencia, cooperativaId, {
        temParecer: Boolean(parecer),
        temSnapshot: Boolean(snapshot),
        qtdRelatorios: parecer ? 9 : 8,
      }),
    },
    {
      path: "01-fechamento.html",
      content: gerarRelatorioFechamentoHtml(data, mesReferencia, fechamento, emissor),
    },
    {
      path: "02-conciliacao-r4.html",
      content: gerarRelatorioConciliacaoHtml(data, conciliacao, coop, emissor),
    },
    {
      path: "03-demonstrativo-pagamentos-r2.html",
      content: gerarRelatorioDemonstrativoPagamentosHtml(data, mesReferencia, demonstrativo, emissor),
    },
    {
      path: "04-mapa-receitas-r3.html",
      content: gerarRelatorioMapaReceitasHtml(data, mapa, emissor),
    },
    {
      path: "05-extrato-conta-coop-r5.html",
      content: gerarRelatorioExtratoContaCoopHtml(data, extrato, emissor),
    },
    {
      path: "06-razao-analitico-r1.html",
      content: gerarRelatorioRazaoAnaliticoHtml(data, razoes, mesReferencia, emissor),
    },
    {
      path: "07-trilha-auditoria-r6.csv",
      content: auditCsv(audit),
    },
    {
      path: "08-relatorio-assembleia-r10.html",
      content: gerarRelatorioAssembleiaHtml(
        data,
        mesReferencia,
        cooperativaId,
        conciliacao,
        fechamento,
        parecer,
        snapshot,
        emissor
      ),
    },
  ];

  if (parecer) {
    arquivos.push({
      path: "09-parecer-contabil-r9.html",
      content: gerarRelatorioParecerContabilHtml(data, parecer, emissor),
    });
  }

  if (snapshot) {
    arquivos.push({
      path: "snapshot-fechamento.json",
      content: JSON.stringify(
        {
          id: snapshot.id,
          mesReferencia: snapshot.mesReferencia,
          capturedAt: snapshot.capturedAt,
          capturedByName: snapshot.capturedByName,
          contentHash: snapshot.contentHash,
          integridadeOk: verificarIntegridadeSnapshot(snapshot),
          payload: parseSnapshotPayload(snapshot),
        },
        null,
        2
      ),
    });
  }

  return arquivos;
}

export function nomeArquivoDossie(mesReferencia: string, cnpj?: string): string {
  const sufixo = cnpj ? `-${cnpj.slice(0, 8)}` : "";
  return `dossie-contabil-${mesReferencia}${sufixo}.zip`;
}

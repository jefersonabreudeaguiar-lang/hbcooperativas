import type { AppData, FechamentoMensal, FechamentoSnapshot, ParecerContabilMensal, User } from "@/types";
import { calcularConciliacaoMensal } from "@/services/conciliacaoMensalService";
import { calcularFechamentoMensalLive, type FechamentoCalculado } from "@/services/relatorioService";
import { getParecerContabilMes } from "@/services/contadorRelatorioService";
import { addAuditEntry, generateId } from "@/services/dataStore";
import type { ConciliacaoMensalResult } from "@/services/conciliacaoMensalService";

export interface FechamentoSnapshotPayload {
  version: 1;
  mesReferencia: string;
  cooperativaId: string;
  fechamento: FechamentoMensal;
  calculo: FechamentoCalculado;
  conciliacao: ConciliacaoMensalResult;
  parecer?: ParecerContabilMensal;
  pagamentosResumo: {
    id: string;
    cooperadoId: string;
    valorBruto: number;
    valorLiquido: number;
    status: string;
    pagoEm: string;
    assinado: boolean;
  }[];
  fichaResumo: {
    id: string;
    cooperadoId: string;
    valorLiquido: number;
    notaPedidoId?: string;
  }[];
}

export function hashSnapshotPayload(json: string): string {
  let h = 5381;
  for (let i = 0; i < json.length; i++) {
    h = (h * 33) ^ json.charCodeAt(i);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function buildSnapshotPayload(
  data: AppData,
  cooperativaId: string,
  mesReferencia: string,
  fechamento: FechamentoMensal
): FechamentoSnapshotPayload {
  const calculo = calcularFechamentoMensalLive(mesReferencia, data);
  const conciliacao = calcularConciliacaoMensal(data, mesReferencia, cooperativaId);
  const parecer = getParecerContabilMes(data, cooperativaId, mesReferencia);

  const pagamentosResumo = data.pagamentosCooperado
    .filter((p) => p.mesReferencia === mesReferencia)
    .map((p) => ({
      id: p.id,
      cooperadoId: p.cooperadoId,
      valorBruto: p.valorBruto,
      valorLiquido: p.valorLiquido,
      status: p.status,
      pagoEm: p.pagoEm,
      assinado: Boolean(p.assinaturaCooperado),
    }));

  const fichaResumo = data.fichaCorrida
    .filter((f) => f.mesReferencia === mesReferencia && f.cooperativaId === cooperativaId)
    .map((f) => ({
      id: f.id,
      cooperadoId: f.cooperadoId,
      valorLiquido: f.valorLiquido,
      notaPedidoId: f.notaPedidoId,
    }));

  return {
    version: 1,
    mesReferencia,
    cooperativaId,
    fechamento,
    calculo,
    conciliacao,
    parecer,
    pagamentosResumo,
    fichaResumo,
  };
}

export function parseSnapshotPayload(snapshot: FechamentoSnapshot): FechamentoSnapshotPayload {
  return JSON.parse(snapshot.payloadJson) as FechamentoSnapshotPayload;
}

export function verificarIntegridadeSnapshot(snapshot: FechamentoSnapshot): boolean {
  return hashSnapshotPayload(snapshot.payloadJson) === snapshot.contentHash;
}

export function getSnapshotFechamentoMes(
  data: AppData,
  cooperativaId: string,
  mesReferencia: string
): FechamentoSnapshot | undefined {
  return (data.fechamentoSnapshots ?? []).find(
    (s) => s.cooperativaId === cooperativaId && s.mesReferencia === mesReferencia
  );
}

export function listSnapshotsCooperativa(data: AppData, cooperativaId: string): FechamentoSnapshot[] {
  return (data.fechamentoSnapshots ?? [])
    .filter((s) => s.cooperativaId === cooperativaId)
    .sort((a, b) => b.mesReferencia.localeCompare(a.mesReferencia));
}

export function capturarSnapshotFechamento(
  data: AppData,
  cooperativaId: string,
  mesReferencia: string,
  actor: Pick<User, "id" | "name">
): AppData {
  const fechamento = data.fechamentos.find((f) => f.mesReferencia === mesReferencia);
  if (!fechamento || fechamento.status !== "aprovado") return data;

  const payload = buildSnapshotPayload(data, cooperativaId, mesReferencia, fechamento);
  const payloadJson = JSON.stringify(payload);
  const snapshot: FechamentoSnapshot = {
    id: generateId("fcsnap"),
    cooperativaId,
    mesReferencia,
    fechamentoId: fechamento.id,
    capturedAt: new Date().toISOString(),
    capturedByUserId: actor.id,
    capturedByName: actor.name,
    contentHash: hashSnapshotPayload(payloadJson),
    payloadJson,
  };

  const others = (data.fechamentoSnapshots ?? []).filter(
    (s) => !(s.cooperativaId === cooperativaId && s.mesReferencia === mesReferencia)
  );

  return addAuditEntry(
    { ...data, fechamentoSnapshots: [snapshot, ...others] },
    {
      entityType: "fechamento_snapshot",
      entityId: snapshot.id,
      action: "criar",
      userId: actor.id,
      userName: actor.name,
      changes: `Snapshot imutável ${mesReferencia} · hash ${snapshot.contentHash}`,
    }
  );
}

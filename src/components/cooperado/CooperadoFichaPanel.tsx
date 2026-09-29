"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Wallet, FileText } from "lucide-react";
import { useAppData } from "@/hooks/useAppData";
import { useContaCoopDescontosRevision } from "@/hooks/useContaCoopDescontosRevision";
import { usePermissions } from "@/hooks/usePermissions";
import { Card } from "@/components/ui/Card";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { getStatusCotaCooperado } from "@/services/notaPedidoService";
import { pushCooperadoToCloud } from "@/services/cooperadoCloudService";
import { updateData, addAuditEntry } from "@/services/dataStore";
import { getUserCooperativaId, normalizeCnpj } from "@/utils/cooperativa";
import { listarResumosFichaEmAbertoCooperado } from "@/services/cooperadoFichaTimelineService";
import { CooperadoMinhaFichaTab } from "@/components/cooperado/CooperadoMinhaFichaTab";
import { formatCPFCNPJ, formatPhone, getCurrentMesReferencia } from "@/utils/format";
import type { Cooperado, NotaPedido } from "@/types";

function getEscolaLabel(
  nota: NotaPedido,
  instituicoes: { id: string; nome: string }[]
): string {
  if (nota.escolaAvulsaNome?.trim()) return nota.escolaAvulsaNome.trim();
  return instituicoes.find((i) => i.id === nota.instituicaoId)?.nome ?? "—";
}

export function CooperadoFichaPanel({ cooperado }: { cooperado: Cooperado }) {
  const data = useAppData();
  const hbDescontosRevision = useContaCoopDescontosRevision();
  const { check, user } = usePermissions();
  const podeEditar = check("cooperados", "edit");
  const [salvandoDiretoria, setSalvandoDiretoria] = useState(false);

  const resumosAberto = useMemo(() => {
    if (!data) return [];
    return listarResumosFichaEmAbertoCooperado(data, cooperado.id, cooperado.cooperativaId);
  }, [data, cooperado.id, cooperado.cooperativaId, hbDescontosRevision]);

  const getEscolaLabelBound = useMemo(
    () => (nota: NotaPedido) => getEscolaLabel(nota, data?.instituicoes ?? []),
    [data?.instituicoes]
  );

  const toggleMembroDiretoria = async (marcado: boolean) => {
    if (!user || !data || salvandoDiretoria) return;
    setSalvandoDiretoria(true);
    const now = new Date().toISOString();
    let saved: Cooperado | null = null;
    updateData((d) => {
      const idx = d.cooperados.findIndex((c) => c.id === cooperado.id);
      if (idx < 0) return d;
      const atualizado: Cooperado = {
        ...d.cooperados[idx],
        membroDiretoria: marcado,
        updatedAt: now,
      };
      saved = atualizado;
      let next = {
        ...d,
        cooperados: d.cooperados.map((c) => (c.id === cooperado.id ? atualizado : c)),
      };
      next = addAuditEntry(next, {
        entityType: "cooperado",
        entityId: cooperado.id,
        action: "editar",
        userId: user.id,
        userName: user.name,
        changes: marcado ? "Marcado como membro da diretoria" : "Removido da diretoria",
      });
      return next;
    });
    if (saved) {
      const coopId = getUserCooperativaId(user, data);
      const coop = data.cooperativas.find((c) => c.id === coopId);
      const cnpj = normalizeCnpj(coop?.cnpj ?? user.cooperativaCnpj ?? "");
      if (cnpj.length === 14) {
        const push = await pushCooperadoToCloud(cnpj, saved);
        if (!push.ok) {
          window.alert(push.error ?? "Alteração salva localmente, mas não sincronizou na nuvem.");
        }
      }
    }
    setSalvandoDiretoria(false);
  };

  if (!data) return <PageSkeleton compact />;

  const statusCota = getStatusCotaCooperado(data, cooperado.id, getCurrentMesReferencia());

  return (
    <div className="space-y-6">
      <Card title="Dados do cooperado">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {statusCota === "paga" ? (
            <span className="text-xs font-medium text-green-700 bg-green-50 px-2 py-1 rounded-full">Cota paga</span>
          ) : (
            <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-1 rounded-full border border-red-200">
              Cota não paga
            </span>
          )}
          {cooperado.membroDiretoria ? (
            <span className="text-xs font-medium text-purple-700 bg-purple-100 px-2 py-1 rounded-full">Diretoria</span>
          ) : null}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-gray-500">CPF/CNPJ:</span>{" "}
            {cooperado.cpfCnpj ? formatCPFCNPJ(cooperado.cpfCnpj) : "—"}
          </div>
          <div>
            <span className="text-gray-500">Telefone:</span> {formatPhone(cooperado.telefone) || "—"}
          </div>
          <div>
            <span className="text-gray-500">PIX:</span> {cooperado.chavePix || "—"}
          </div>
          <div>
            <span className="text-gray-500">Comunidade:</span> {cooperado.comunidade || "—"}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500">Status:</span> <StatusBadge status={cooperado.status} />
          </div>
          {cooperado.avulso && <div className="text-amber-700 text-xs font-medium">Cooperado avulso (sem app)</div>}
        </div>

        {podeEditar && (
          <label className="mt-4 flex items-start gap-3 p-3 border border-purple-200 bg-purple-50/60 rounded-xl cursor-pointer hover:bg-purple-50">
            <input
              type="checkbox"
              checked={Boolean(cooperado.membroDiretoria)}
              disabled={salvandoDiretoria}
              onChange={(e) => toggleMembroDiretoria(e.target.checked)}
              className="mt-1 rounded border-gray-300 text-purple-700 focus:ring-purple-500"
            />
            <span>
              <span className="block text-sm font-semibold text-gray-900">Membro da diretoria</span>
              <span className="block text-xs text-gray-600 mt-0.5">
                Marque se este cooperado faz parte da diretoria. Ele poderá votar em pautas restritas e receber avisos
                exclusivos.
              </span>
            </span>
          </label>
        )}

        <div className="flex flex-wrap gap-2 mt-4">
          <Link href={`/ficha-corrida?cooperado=${cooperado.id}`}>
            <Button variant="secondary" size="sm">
              <Wallet size={16} /> Ficha corrida / pagar
            </Button>
          </Link>
          <Link href={`/notas-pedido?cooperado=${cooperado.id}`}>
            <Button variant="secondary" size="sm">
              <FileText size={16} /> Entregas
            </Button>
          </Link>
        </div>
      </Card>

      <CooperadoMinhaFichaTab
        cooperadoId={cooperado.id}
        cooperativaId={cooperado.cooperativaId}
        nomeCooperado={cooperado.nomeCompleto}
        resumos={resumosAberto}
        getEscolaLabel={getEscolaLabelBound}
        modo="responsavel"
      />
    </div>
  );
}

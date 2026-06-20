"use client";

import { useMemo, useState, useEffect } from "react";
import { Search, Tag, RefreshCw } from "lucide-react";
import { useAppData } from "@/hooks/useAppData";
import { usePermissions } from "@/hooks/usePermissions";
import { getUserCooperativaId } from "@/utils/cooperativa";
import { PageHeader } from "@/components/ui/Table";
import { Input } from "@/components/ui/Form";
import { Button } from "@/components/ui/Button";
import { formatCurrency } from "@/utils/format";
import { labelUnidade } from "@/utils/unidades";
import { sortPorOrdemLancamento } from "@/utils/produtos";
import { cn } from "@/utils/format";
import { resolveCooperativaCnpj } from "@/services/notaPedidoCloudService";
import { syncAllCooperativaFromCloud } from "@/services/cooperativaSyncCloudService";
import { getData } from "@/services/dataStore";

function instituicaoTemProdutos(
  instId: string,
  produtos: { instituicaoId: string; ativo: boolean }[]
): boolean {
  return produtos.some((p) => p.instituicaoId === instId && p.ativo);
}

export default function PrecosPage() {
  const data = useAppData();
  const { user } = usePermissions();
  const coopId = user && data ? getUserCooperativaId(user, data) : undefined;
  const [instSelecionada, setInstSelecionada] = useState<string>("");
  const [busca, setBusca] = useState("");
  const [syncing, setSyncing] = useState(false);

  const runSync = async () => {
    if (!coopId || !user) return;
    const d = getData();
    if (!d) return;
    setSyncing(true);
    try {
      const cnpj = await resolveCooperativaCnpj(d, coopId, user);
      if (cnpj) await syncAllCooperativaFromCloud(cnpj);
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    if (!data || !coopId || !user) return;
    void runSync();
    const id = setInterval(() => void runSync(), 12000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coopId, user?.id]);

  const instituicoes = useMemo(() => {
    if (!data || !coopId) return [];
    return data.instituicoes.filter((i) => i.cooperativaId === coopId);
  }, [data, coopId]);

  const produtosDaCoop = useMemo(() => {
    if (!data || !coopId) return [];
    const instIds = new Set(instituicoes.map((i) => i.id));
    return data.produtosInstituicao.filter(
      (p) => p.ativo && (instIds.has(p.instituicaoId) || p.cooperativaId === coopId)
    );
  }, [data, coopId, instituicoes]);

  const instMap = useMemo(() => new Map(instituicoes.map((i) => [i.id, i.nome])), [instituicoes]);

  const produtos = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const filtrados = instSelecionada
      ? produtosDaCoop.filter((p) => p.instituicaoId === instSelecionada)
      : produtosDaCoop;

    return sortPorOrdemLancamento(
      filtrados.filter((p) => !q || p.nome.toLowerCase().includes(q))
    );
  }, [instSelecionada, produtosDaCoop, busca]);

  if (!data) return null;

  const instComItens = instituicoes.filter((i) => instituicaoTemProdutos(i.id, produtosDaCoop));

  return (
    <div className="max-w-2xl mx-auto">
      <PageHeader
        title="Preços dos itens"
        subtitle="Consulte quanto vale cada produto por escola ou contrato"
      />

      <div className="flex justify-end mb-4">
        <Button variant="secondary" size="sm" onClick={() => void runSync()} disabled={syncing}>
          <RefreshCw size={16} className={syncing ? "animate-spin" : ""} />
          {syncing ? "Atualizando…" : "Atualizar preços"}
        </Button>
      </div>

      {instituicoes.length === 0 && produtosDaCoop.length === 0 ? (
        <div className="text-center py-16 text-gray-500 bg-white rounded-2xl border">
          <Tag size={40} className="mx-auto mb-3 text-gray-300" />
          <p className="font-medium">Nenhum contrato cadastrado ainda</p>
          <p className="text-sm mt-1">A cooperativa ainda não publicou preços.</p>
        </div>
      ) : (
        <>
          {(instComItens.length > 0 || instituicoes.length > 1) && (
            <div className="flex gap-2 overflow-x-auto pb-2 mb-4 -mx-1 px-1 scrollbar-hide">
              <button
                type="button"
                onClick={() => setInstSelecionada("")}
                className={cn(
                  "shrink-0 px-4 py-2.5 rounded-xl text-sm font-medium border transition-colors",
                  !instSelecionada
                    ? "bg-green-700 text-white border-green-700"
                    : "bg-white text-gray-700 border-gray-200 hover:border-green-300"
                )}
              >
                Todos ({produtosDaCoop.length})
              </button>
              {instituicoes.map((inst) => {
                const qtd = produtosDaCoop.filter((p) => p.instituicaoId === inst.id).length;
                return (
                  <button
                    key={inst.id}
                    type="button"
                    onClick={() => setInstSelecionada(inst.id)}
                    className={cn(
                      "shrink-0 px-4 py-2.5 rounded-xl text-sm font-medium border transition-colors",
                      instSelecionada === inst.id
                        ? "bg-green-700 text-white border-green-700"
                        : "bg-white text-gray-700 border-gray-200 hover:border-green-300",
                      qtd === 0 && instSelecionada !== inst.id && "opacity-60"
                    )}
                  >
                    {inst.nome}{qtd > 0 ? ` (${qtd})` : ""}
                  </button>
                );
              })}
            </div>
          )}

          <div className="relative mb-4">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar produto..."
              className="pl-10"
            />
          </div>

          {produtos.length === 0 ? (
            <p className="text-center text-gray-500 py-8">
              {syncing
                ? "Buscando preços na cooperativa…"
                : produtosDaCoop.length === 0
                  ? "Nenhum preço publicado ainda. Peça ao responsável cadastrar em Contratos."
                  : "Nenhum item neste filtro. Toque em Todos ou escolha outro contrato."}
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {produtos.map((p) => (
                <div
                  key={p.id}
                  className="bg-white border border-gray-200 rounded-2xl p-4 flex flex-col justify-between min-h-[100px] shadow-sm"
                >
                  {!instSelecionada && instMap.get(p.instituicaoId) && (
                    <p className="text-[11px] font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full w-fit mb-2">
                      {instMap.get(p.instituicaoId)}
                    </p>
                  )}
                  <p className="font-semibold text-gray-900 leading-snug">{p.nome}</p>
                  <div className="mt-3 flex items-end justify-between gap-2">
                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                      {labelUnidade(p.unidade)}
                    </span>
                    <span className="text-xl font-bold text-green-700">
                      {formatCurrency(p.precoUnitario)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <p className="text-xs text-gray-400 text-center mt-6">
            Preços definidos pela cooperativa em cada contrato com a instituição.
          </p>
        </>
      )}
    </div>
  );
}

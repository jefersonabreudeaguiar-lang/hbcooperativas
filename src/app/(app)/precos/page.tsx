"use client";

import { useMemo, useState } from "react";
import { Search, Tag } from "lucide-react";
import { useAppData } from "@/hooks/useAppData";
import { usePermissions } from "@/hooks/usePermissions";
import { getUserCooperativaId } from "@/utils/cooperativa";
import { PageHeader } from "@/components/ui/Table";
import { Input } from "@/components/ui/Form";
import { formatCurrency } from "@/utils/format";
import { labelUnidade } from "@/utils/unidades";
import { sortPorOrdemLancamento } from "@/utils/produtos";
import { cn } from "@/utils/format";

export default function PrecosPage() {
  const data = useAppData();
  const { user } = usePermissions();
  const coopId = user && data ? getUserCooperativaId(user, data) : undefined;
  const [instSelecionada, setInstSelecionada] = useState<string>("");
  const [busca, setBusca] = useState("");

  const instituicoes = useMemo(() => {
    if (!data || !coopId) return [];
    return data.instituicoes.filter((i) => i.cooperativaId === coopId);
  }, [data, coopId]);

  const instAtiva = instSelecionada || instituicoes[0]?.id || "";

  const produtos = useMemo(() => {
    if (!data || !instAtiva) return [];
    const q = busca.trim().toLowerCase();
    return sortPorOrdemLancamento(
      data.produtosInstituicao
        .filter((p) => p.instituicaoId === instAtiva && p.ativo && p.cooperativaId === coopId)
        .filter((p) => !q || p.nome.toLowerCase().includes(q))
    );
  }, [data, instAtiva, coopId, busca]);

  if (!data) return null;

  return (
    <div className="max-w-2xl mx-auto">
      <PageHeader
        title="Preços dos itens"
        subtitle="Consulte quanto vale cada produto por escola ou contrato"
      />

      {instituicoes.length === 0 ? (
        <div className="text-center py-16 text-gray-500 bg-white rounded-2xl border">
          <Tag size={40} className="mx-auto mb-3 text-gray-300" />
          <p className="font-medium">Nenhum contrato cadastrado ainda</p>
          <p className="text-sm mt-1">A cooperativa ainda não publicou preços.</p>
        </div>
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto pb-2 mb-4 -mx-1 px-1 scrollbar-hide">
            {instituicoes.map((inst) => (
              <button
                key={inst.id}
                type="button"
                onClick={() => setInstSelecionada(inst.id)}
                className={cn(
                  "shrink-0 px-4 py-2.5 rounded-xl text-sm font-medium border transition-colors",
                  instAtiva === inst.id
                    ? "bg-green-700 text-white border-green-700"
                    : "bg-white text-gray-700 border-gray-200 hover:border-green-300"
                )}
              >
                {inst.nome}
              </button>
            ))}
          </div>

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
            <p className="text-center text-gray-500 py-8">Nenhum item encontrado nesta instituição.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {produtos.map((p) => (
                <div
                  key={p.id}
                  className="bg-white border border-gray-200 rounded-2xl p-4 flex flex-col justify-between min-h-[100px] shadow-sm"
                >
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

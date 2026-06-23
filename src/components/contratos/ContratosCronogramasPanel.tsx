"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Calendar, Images, Save } from "lucide-react";
import type { Instituicao, ProdutoInstituicao } from "@/types";
import { Button } from "@/components/ui/Button";
import { FormField, Input, Textarea } from "@/components/ui/Form";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { useAppData } from "@/hooks/useAppData";
import { updateData, addAuditEntry, getData } from "@/services/dataStore";
import {
  buildItensCronogramaFromProdutos,
  calcValorLimiteCronograma,
  getCronogramaMes,
  listMesesCronogramaInstituicao,
  upsertCronogramaMes,
} from "@/services/cronogramaContratoService";
import { pushContratosToCloud } from "@/services/cooperativaSyncCloudService";
import { resolveCooperativaCnpj } from "@/services/notaPedidoCloudService";
import { compressFotoFile, makeFotoThumbnail } from "@/utils/fotoEntrega";
import { formatCurrency, formatMesReferencia, getCurrentMesReferencia } from "@/utils/format";
import { labelUnidade } from "@/utils/unidades";

interface ContratosCronogramasPanelProps {
  instituicao: Instituicao;
  produtos: ProdutoInstituicao[];
  coopId: string;
  userId: string;
  userName: string;
  canEdit: boolean;
}

function qtyClass(hasQty: boolean): string {
  return hasQty
    ? "bg-green-50 border-green-500 text-gray-900 focus:border-green-600 focus:ring-green-200/80"
    : "bg-amber-50 border-amber-500 text-gray-900 placeholder:text-amber-600 focus:border-amber-600 focus:ring-amber-200/80";
}

export function ContratosCronogramasPanel({
  instituicao,
  produtos,
  coopId,
  userId,
  userName,
  canEdit,
}: ContratosCronogramasPanelProps) {
  const data = useAppData();
  const fileRef = useRef<HTMLInputElement>(null);
  const [mesReferencia, setMesReferencia] = useState(getCurrentMesReferencia());
  const [anotacaoMes, setAnotacaoMes] = useState("");
  const [quantidades, setQuantidades] = useState<Record<string, string>>({});
  const [fotos, setFotos] = useState<string[]>([]);
  const [fotosMini, setFotosMini] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);

  const mesesDisponiveis = useMemo(() => {
    if (!data) return [getCurrentMesReferencia()];
    return listMesesCronogramaInstituicao(data, instituicao.id, coopId);
  }, [data, instituicao.id, coopId]);

  const cronogramaAtual = useMemo(() => {
    if (!data) return undefined;
    return getCronogramaMes(data, instituicao.id, mesReferencia, coopId);
  }, [data, instituicao.id, mesReferencia, coopId]);

  useEffect(() => {
    if (!cronogramaAtual) {
      setAnotacaoMes("");
      setQuantidades({});
      setFotos([]);
      setFotosMini([]);
      return;
    }
    setAnotacaoMes(cronogramaAtual.anotacaoMes ?? "");
    const q: Record<string, string> = {};
    for (const item of cronogramaAtual.itens) {
      q[item.produtoInstituicaoId] = String(item.quantidadePrevista);
    }
    setQuantidades(q);
    setFotos(cronogramaAtual.fotos ?? []);
    setFotosMini(cronogramaAtual.fotosMiniaturas ?? cronogramaAtual.fotos ?? []);
  }, [cronogramaAtual]);

  const itensPreview = useMemo(
    () => buildItensCronogramaFromProdutos(produtos, quantidades),
    [produtos, quantidades]
  );
  const valorLimite = calcValorLimiteCronograma(itensPreview);

  const handleFotos = async (files: FileList | null) => {
    if (!files?.length) return;
    const novas: string[] = [];
    const novasMini: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const compressed = await compressFotoFile(files[i]);
      const mini = await makeFotoThumbnail(compressed);
      novas.push(compressed);
      novasMini.push(mini);
    }
    setFotos((prev) => [...prev, ...novas]);
    setFotosMini((prev) => [...prev, ...novasMini]);
  };

  const handleSalvar = async () => {
    if (!canEdit || itensPreview.length === 0) return;
    setSalvando(true);
    try {
      updateData((d) =>
        addAuditEntry(
          upsertCronogramaMes(d, {
            id: cronogramaAtual?.id,
            cooperativaId: coopId,
            instituicaoId: instituicao.id,
            mesReferencia,
            anotacaoMes,
            fotos,
            fotosMiniaturas: fotosMini,
            itens: itensPreview,
            lancadoPor: userName,
          }),
          {
            entityType: "instituicao",
            entityId: instituicao.id,
            action: cronogramaAtual ? "editar" : "criar",
            userId,
            userName,
            changes: `Cronograma ${formatMesReferencia(mesReferencia)} · limite ${formatCurrency(valorLimite)}`,
          }
        )
      );
      const d = getData();
      const cnpj = await resolveCooperativaCnpj(d, coopId);
      if (cnpj) await pushContratosToCloud(cnpj, d, coopId, { authoritative: true });
    } finally {
      setSalvando(false);
    }
  };

  if (produtos.length === 0) {
    return (
      <AlertBanner variant="warning" title="Cadastre os itens do contrato primeiro">
        Na aba <strong>Catálogo</strong>, adicione produtos e preços antes de lançar cronogramas mensais.
      </AlertBanner>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <div className="rounded-xl border border-blue-200 bg-blue-50/70 px-4 py-3 text-sm text-blue-900">
        Todo mês a contratante envia um cronograma. Lance aqui as quantidades previstas, fotos do documento e a
        anotação do mês. O valor limite gerado será comparado com as entregas no relatório de atingimento.
      </div>

      <FormField label="Mês de referência" required>
        <div className="flex flex-wrap gap-2 items-center">
          <select
            value={mesReferencia}
            onChange={(e) => setMesReferencia(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium bg-white"
          >
            {mesesDisponiveis.map((m) => (
              <option key={m} value={m}>
                {formatMesReferencia(m)}
              </option>
            ))}
          </select>
          {cronogramaAtual && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-3 py-1.5">
              <Calendar size={14} /> Cronograma lançado
            </span>
          )}
        </div>
      </FormField>

      <FormField
        label="Anotação / referência do mês"
        hint="Ex.: Cronograma recebido em 05/03 — EMEF Centro e EMEF Bairro"
      >
        <Textarea
          value={anotacaoMes}
          onChange={(e) => setAnotacaoMes(e.target.value)}
          rows={3}
          placeholder="Descreva a origem do cronograma, escolas atendidas ou observações da contratante..."
          disabled={!canEdit}
        />
      </FormField>

      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <p className="text-sm font-medium text-gray-800 flex items-center gap-2">
            <Images size={16} /> Fotos do cronograma
          </p>
          {canEdit && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => void handleFotos(e.target.files)}
              />
              <Button type="button" size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>
                <Camera size={16} /> Adicionar fotos
              </Button>
            </>
          )}
        </div>
        {fotosMini.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {fotosMini.map((foto, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={foto}
                alt={`Cronograma ${i + 1}`}
                className="w-full aspect-[3/4] object-cover rounded-xl border border-gray-200"
              />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 py-8 text-center text-sm text-gray-500">
            Fotografe ou anexe todas as páginas do cronograma recebido.
          </div>
        )}
      </div>

      <div className="rounded-xl border-2 border-amber-200 overflow-hidden">
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5">
          <p className="text-sm font-semibold text-amber-900">Quantidades previstas no cronograma</p>
          <p className="text-xs text-amber-800 mt-0.5">Informe a meta de cada item — caixas amarelas como nas notas.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-amber-50/80 border-b border-amber-100">
              <tr>
                <th className="text-left px-4 py-2 font-semibold text-gray-800">Item</th>
                <th className="text-right px-4 py-2 font-semibold text-gray-800 w-28">Preço</th>
                <th className="text-right px-4 py-2 font-semibold text-gray-800 w-36">Quantidade</th>
                <th className="text-right px-4 py-2 font-semibold text-gray-800 w-32">Valor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {produtos.map((p) => {
                const qty = parseFloat((quantidades[p.id] ?? "").replace(",", ".")) || 0;
                return (
                  <tr key={p.id} className="hover:bg-amber-50/30">
                    <td className="px-4 py-3 font-medium text-gray-900">{p.nome}</td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {formatCurrency(p.precoUnitario)}/{labelUnidade(p.unidade) || p.unidade}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        disabled={!canEdit}
                        className={`w-28 ml-auto text-right font-semibold border-2 ${qtyClass(qty > 0)}`}
                        value={quantidades[p.id] ?? ""}
                        onChange={(e) =>
                          setQuantidades((prev) => ({ ...prev, [p.id]: e.target.value }))
                        }
                        placeholder="0"
                      />
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-green-700">
                      {qty > 0 ? formatCurrency(qty * p.precoUnitario) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl bg-gradient-to-r from-green-700 to-green-800 text-white p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-green-100 text-sm">Valor limite de entrega · {formatMesReferencia(mesReferencia)}</p>
          <p className="text-3xl font-bold mt-1">{formatCurrency(valorLimite)}</p>
          <p className="text-xs text-green-100 mt-1">{itensPreview.length} item(ns) com meta lançada</p>
        </div>
        {canEdit && (
          <Button
            size="lg"
            className="bg-white text-green-800 hover:bg-green-50 shrink-0"
            onClick={() => void handleSalvar()}
            disabled={salvando || itensPreview.length === 0}
          >
            <Save size={18} />
            {salvando ? "Salvando…" : cronogramaAtual ? "Atualizar cronograma" : "Lançar cronograma"}
          </Button>
        )}
      </div>
    </div>
  );
}

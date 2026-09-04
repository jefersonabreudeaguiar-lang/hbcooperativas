"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  Wallet,
  Banknote,
  Smartphone,
  Percent,
  QrCode,
  Clock,
  CheckCircle2,
  Info,
  Copy,
} from "lucide-react";
import { Card, StatCard } from "@/components/ui/Card";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { Button } from "@/components/ui/Button";
import {
  formatCurrency,
  formatDateTime,
  formatMesReferencia,
  getCurrentMesReferencia,
} from "@/utils/format";
import { secureApiFetch } from "@/lib/security/clientSession";
import {
  formatCentsAdmin,
  type ContaCoopPlatformOverview,
} from "@/services/platformContaCoopAdminService";
import { AdminSectionHeader } from "@/components/admin/AdminSectionHeader";

export function AdminContaCoopPanel() {
  const [mesReferencia, setMesReferencia] = useState(getCurrentMesReferencia());
  const [overview, setOverview] = useState<ContaCoopPlatformOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [copiedPix, setCopiedPix] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setWarning(null);
    secureApiFetch(`/api/admin/conta-coop-overview?mes=${encodeURIComponent(mesReferencia)}`, {
      cache: "no-store",
    })
      .then(async (r) => {
        const json = (await r.json()) as {
          ok?: boolean;
          error?: string;
          warning?: string;
          overview?: ContaCoopPlatformOverview;
        };
        if (cancelled) return;
        if (!r.ok && !json.overview) {
          setError(json.error ?? "Não foi possível carregar os dados Conta Coop.");
          setOverview(null);
          return;
        }
        if (json.error) setError(json.error);
        if (json.warning) setWarning(json.warning);
        setOverview(json.overview ?? null);
      })
      .catch(() => {
        if (!cancelled) {
          setError("Não foi possível carregar os dados Conta Coop.");
          setOverview(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mesReferencia]);

  const split = overview?.split;
  const totais = overview?.totais;
  const comMovimento = useMemo(
    () => overview?.cooperativas.filter((row) => row.transacoes > 0) ?? [],
    [overview?.cooperativas]
  );

  const copyPix = async () => {
    if (!overview?.pixRepasse.chave) return;
    try {
      await navigator.clipboard.writeText(overview.pixRepasse.chave);
      setCopiedPix(true);
      setTimeout(() => setCopiedPix(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="space-y-6 pb-8">
      <AdminSectionHeader
        title="Conta Coop · visão HB"
        description="Operação completa da Conta Coop na plataforma: compras, split 60/30/10, liquidação mercado, repasse PIX à HB e mensalidade do cooperado."
      />

      <div className="flex flex-col sm:flex-row sm:items-end gap-3">
        <label className="text-sm">
          <span className="block font-medium text-gray-700 mb-1">Mês de referência</span>
          <input
            type="month"
            value={mesReferencia}
            onChange={(e) => setMesReferencia(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        <p className="text-sm text-gray-500">{formatMesReferencia(mesReferencia)}</p>
      </div>

      {split && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-xl border border-green-200 bg-green-50/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-green-800">Cooperado</p>
            <p className="mt-1 text-2xl font-bold text-green-900">{split.cooperadoPercent}%</p>
            <p className="text-xs text-green-700 mt-1">Cashback do desconto na compra</p>
          </div>
          <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-800">HB · App</p>
            <p className="mt-1 text-2xl font-bold text-blue-900">{split.appPercent}%</p>
            <p className="text-xs text-blue-700 mt-1">
              Repasse PIX + mensalidade R$ {overview?.mensalidadeCooperado.toFixed(2).replace(".", ",")}/cooperado
            </p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Cooperativa</p>
            <p className="mt-1 text-2xl font-bold text-amber-900">{split.cooperativaPercent}%</p>
            <p className="text-xs text-amber-700 mt-1">Liquidação mensal com o mercado</p>
          </div>
        </div>
      )}

      {overview?.pixRepasse && (
        <Card title="PIX para repasse HB (30%)">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-1 text-sm">
              <p>
                <span className="text-gray-500">Chave PIX (CPF):</span>{" "}
                <strong className="font-mono">{overview.pixRepasse.chave}</strong>
              </p>
              <p>
                <span className="text-gray-500">Favorecido:</span> {overview.pixRepasse.nome}
              </p>
              <p>
                <span className="text-gray-500">CPF:</span> {overview.pixRepasse.cpfFormatado}
              </p>
            </div>
            <Button type="button" variant="secondary" size="sm" onClick={() => void copyPix()}>
              <Copy size={14} />
              {copiedPix ? "Copiado!" : "Copiar chave PIX"}
            </Button>
          </div>
          <p className="mt-3 text-xs text-gray-500 flex items-start gap-2">
            <Info size={14} className="shrink-0 mt-0.5" />
            O responsável confirma o repasse na área Conta Coop da cooperativa após liquidar o mês com os mercados.
          </p>
        </Card>
      )}

      {error && (
        <AlertBanner variant="error" title="Erro ao carregar">
          {error}
        </AlertBanner>
      )}
      {warning && !error && (
        <AlertBanner variant="warning" title="Aviso">
          {warning}
        </AlertBanner>
      )}

      {loading && !overview ? (
        <Card>
          <p className="text-sm text-gray-500 py-10 text-center">Carregando operação Conta Coop…</p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard
              title="Compras no mês"
              value={formatCentsAdmin(totais?.grossTotalCents ?? 0)}
              subtitle={`${totais?.transacoes ?? 0} transação(ões) · ${totais?.cooperativasComMovimento ?? 0} coop.`}
              icon={<Percent size={22} />}
              variant="gold"
            />
            <StatCard
              title="Desconto gerado"
              value={formatCentsAdmin(totais?.descontoTotalCents ?? 0)}
              subtitle={`Líquido mercado ${formatCentsAdmin(totais?.netPartnerCents ?? 0)}`}
              icon={<Banknote size={22} />}
            />
            <StatCard
              title="Parte HB (30%)"
              value={formatCentsAdmin(totais?.appCents ?? 0)}
              subtitle="Total no mês"
              icon={<Wallet size={22} />}
            />
            <StatCard
              title="Cooperativas"
              value={String(totais?.cooperativasCadastradas ?? 0)}
              subtitle={`${totais?.mercadosAtivos ?? 0} mercado(s) ativo(s)`}
              icon={<Building2 size={22} />}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard
              title="Cashback cooperados"
              value={formatCentsAdmin(totais?.cashbackCents ?? 0)}
              subtitle={`${split?.cooperadoPercent ?? 60}% do desconto`}
              icon={<Smartphone size={22} />}
            />
            <StatCard
              title="Parte cooperativas"
              value={formatCentsAdmin(totais?.coopCents ?? 0)}
              subtitle={`Liquidado ${formatCentsAdmin(totais?.coopLiquidadoCents ?? 0)}`}
              icon={<Building2 size={22} />}
            />
            <StatCard
              title="HB aguardando mercado"
              value={formatCentsAdmin(totais?.appPendenteLiquidacaoCents ?? 0)}
              subtitle="Antes da liquidação mensal"
              icon={<Clock size={22} />}
            />
            <StatCard
              title="HB aguardando PIX"
              value={formatCentsAdmin(totais?.appRepassePendenteCents ?? 0)}
              subtitle="Mercado liquidado · repasse pendente"
              icon={<QrCode size={22} />}
              variant={totais && totais.appRepassePendenteCents > 0 ? "gold" : "success"}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <StatCard
              title="Repasse HB recebido"
              value={formatCentsAdmin(totais?.appRepassePagoCents ?? 0)}
              subtitle={`${overview?.repassesMes.length ?? 0} confirmação(ões) no mês`}
              icon={<CheckCircle2 size={22} />}
              variant="success"
            />
            <StatCard
              title="Mensalidade cooperado"
              value={formatCurrency(overview?.mensalidadeCooperado ?? 0)}
              subtitle="Cobrada na ficha · inclui taxa app + Conta Coop"
              icon={<Smartphone size={22} />}
            />
          </div>

          <Card title="Cooperativas · detalhamento Conta Coop">
            {!overview?.cooperativas.length ? (
              <p className="text-sm text-gray-500 py-8 text-center">
                Nenhuma cooperativa cadastrada na plataforma.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[960px]">
                  <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
                    <tr>
                      <th className="px-3 py-2">Cooperativa</th>
                      <th className="px-3 py-2 text-right">Mercados</th>
                      <th className="px-3 py-2 text-right">Compras</th>
                      <th className="px-3 py-2 text-right">Bruto</th>
                      <th className="px-3 py-2 text-right">Desconto</th>
                      <th className="px-3 py-2 text-right">Cashback</th>
                      <th className="px-3 py-2 text-right">HB 30%</th>
                      <th className="px-3 py-2 text-right">Coop 10%</th>
                      <th className="px-3 py-2 text-right">PIX pendente</th>
                      <th className="px-3 py-2">Repasse</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {overview.cooperativas.map((row) => (
                      <tr
                        key={row.cooperativaCnpj}
                        className={row.transacoes === 0 ? "text-gray-500" : undefined}
                      >
                        <td className="px-3 py-2">
                          <p className="font-medium text-gray-900">{row.cooperativaNome}</p>
                          <p className="text-xs text-gray-500">{row.cnpjFormatado}</p>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{row.mercadosAtivos}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{row.transacoes}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {row.grossTotalCents > 0 ? formatCentsAdmin(row.grossTotalCents) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {row.descontoTotalCents > 0 ? formatCentsAdmin(row.descontoTotalCents) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {row.cashbackCents > 0 ? formatCentsAdmin(row.cashbackCents) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium text-blue-800">
                          {row.appCents > 0 ? formatCentsAdmin(row.appCents) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {row.coopCents > 0 ? formatCentsAdmin(row.coopCents) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {row.appRepassePendenteCents > 0 ? (
                            <span className="text-amber-800 font-medium">
                              {formatCentsAdmin(row.appRepassePendenteCents)}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {row.repasseConfirmado ? (
                            <span className="text-xs font-medium text-green-700 bg-green-50 px-2 py-1 rounded-full">
                              Confirmado
                            </span>
                          ) : row.appRepassePendenteCents > 0 ? (
                            <span className="text-xs font-medium text-amber-800 bg-amber-50 px-2 py-1 rounded-full">
                              Aguardando PIX
                            </span>
                          ) : row.transacoes > 0 ? (
                            <span className="text-xs text-gray-500">Em andamento</span>
                          ) : (
                            <span className="text-xs text-gray-400">Sem movimento</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {comMovimento.length > 0 && (
            <Card title="Fluxo do mês · cooperativas com compras">
              <ul className="divide-y divide-gray-100 text-sm">
                {comMovimento.map((row) => (
                  <li key={row.cooperativaCnpj} className="py-3 grid grid-cols-1 md:grid-cols-4 gap-2">
                    <div className="md:col-span-1">
                      <p className="font-medium text-gray-900">{row.cooperativaNome}</p>
                      <p className="text-xs text-gray-500">{row.transacoes} compra(s)</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Aguardando liquidação mercado</p>
                      <p className="font-medium tabular-nums">
                        {formatCentsAdmin(row.appPendenteLiquidacaoCents)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">HB aguardando PIX</p>
                      <p className="font-medium tabular-nums text-amber-800">
                        {formatCentsAdmin(row.appRepassePendenteCents)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Cooperativa (liquidado / pendente)</p>
                      <p className="font-medium tabular-nums">
                        {formatCentsAdmin(row.coopLiquidadoCents)} /{" "}
                        {formatCentsAdmin(row.coopPendenteCents)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {!!overview?.repassesMes.length && (
            <Card title="Repasses confirmados no mês">
              <ul className="divide-y divide-gray-100">
                {overview.repassesMes.map((repasse) => (
                  <li
                    key={`${repasse.cooperativaCnpj}-${repasse.paidAt}`}
                    className="py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                  >
                    <div>
                      <p className="font-medium text-gray-900">{repasse.cooperativaNome}</p>
                      <p className="text-xs text-gray-500">
                        Confirmado por {repasse.responsavelNome} · {formatDateTime(repasse.paidAt)}
                        {repasse.comprovanteMemo ? ` · ${repasse.comprovanteMemo}` : ""}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-green-800 tabular-nums">
                      {formatCentsAdmin(repasse.amountCents)}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

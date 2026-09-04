"use client";

import { useEffect, useState } from "react";
import {
  Building2,
  Wallet,
  Banknote,
  Smartphone,
  Percent,
  QrCode,
} from "lucide-react";
import { Card, StatCard } from "@/components/ui/Card";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { formatDateTime, formatMesReferencia, getCurrentMesReferencia } from "@/utils/format";
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

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    secureApiFetch(`/api/admin/conta-coop-overview?mes=${encodeURIComponent(mesReferencia)}`, {
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((json: { ok?: boolean; error?: string; overview?: ContaCoopPlatformOverview }) => {
        if (cancelled) return;
        if (json.error) setError(json.error);
        setOverview(json.overview ?? null);
      })
      .catch(() => {
        if (!cancelled) setError("Não foi possível carregar os dados Conta Coop.");
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

  return (
    <div className="space-y-6 pb-8">
      <AdminSectionHeader
        title="Conta Coop · visão HB"
        description="Acompanhe descontos gerados nas cooperativas, a divisão contratual do benefício e os repasses de 30% devidos à plataforma HB."
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
            <p className="text-xs text-green-700 mt-1">Cashback do desconto</p>
          </div>
          <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-800">HB · App</p>
            <p className="mt-1 text-2xl font-bold text-blue-900">{split.appPercent}%</p>
            <p className="text-xs text-blue-700 mt-1">Repasse PIX + mensalidade cooperado</p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Cooperativa</p>
            <p className="mt-1 text-2xl font-bold text-amber-900">{split.cooperativaPercent}%</p>
            <p className="text-xs text-amber-700 mt-1">Liquidação mensal mercado</p>
          </div>
        </div>
      )}

      {error && (
        <AlertBanner variant="warning" title="Dados parciais">
          {error}
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
              title="Desconto gerado"
              value={formatCentsAdmin(totais?.descontoTotalCents ?? 0)}
              subtitle={`${totais?.transacoes ?? 0} compra(s)`}
              icon={<Percent size={22} />}
              variant="gold"
            />
            <StatCard
              title="Parte HB (30%)"
              value={formatCentsAdmin(totais?.appCents ?? 0)}
              subtitle="Taxa plataforma no mês"
              icon={<Wallet size={22} />}
            />
            <StatCard
              title="Repasse pendente"
              value={formatCentsAdmin(totais?.appRepassePendenteCents ?? 0)}
              subtitle="Mercado liquidado · PIX não confirmado"
              icon={<QrCode size={22} />}
              variant={totais && totais.appRepassePendenteCents > 0 ? "gold" : "success"}
            />
            <StatCard
              title="Repasse recebido"
              value={formatCentsAdmin(totais?.appRepassePagoCents ?? 0)}
              subtitle={`${overview?.repassesMes.length ?? 0} confirmado(s)`}
              icon={<Banknote size={22} />}
              variant="success"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <StatCard
              title="Cashback cooperados"
              value={formatCentsAdmin(totais?.cashbackCents ?? 0)}
              subtitle={`${split?.cooperadoPercent ?? 60}% do desconto`}
              icon={<Smartphone size={22} />}
            />
            <StatCard
              title="Parte cooperativas"
              value={formatCentsAdmin(totais?.coopCents ?? 0)}
              subtitle={`${split?.cooperativaPercent ?? 10}% do desconto`}
              icon={<Building2 size={22} />}
            />
            <StatCard
              title="Mercados ativos"
              value={String(totais?.mercadosAtivos ?? 0)}
              subtitle={`${totais?.cooperativasComMovimento ?? 0} coop. com movimento`}
              icon={<Building2 size={22} />}
            />
          </div>

          <Card title="Cooperativas · movimento Conta Coop">
            {!overview?.cooperativas.length ? (
              <p className="text-sm text-gray-500 py-8 text-center">
                Nenhuma compra Conta Coop registrada neste mês.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
                    <tr>
                      <th className="px-3 py-2">Cooperativa</th>
                      <th className="px-3 py-2 text-right">Compras</th>
                      <th className="px-3 py-2 text-right">Desconto</th>
                      <th className="px-3 py-2 text-right">HB 30%</th>
                      <th className="px-3 py-2 text-right">Pendente PIX</th>
                      <th className="px-3 py-2 text-right">Mercados</th>
                      <th className="px-3 py-2">Repasse</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {overview.cooperativas.map((row) => (
                      <tr key={row.cooperativaCnpj}>
                        <td className="px-3 py-2">
                          <p className="font-medium text-gray-900">{row.cooperativaNome}</p>
                          <p className="text-xs text-gray-500">{row.cnpjFormatado}</p>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{row.transacoes}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatCentsAdmin(row.descontoTotalCents)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium text-blue-800">
                          {formatCentsAdmin(row.appCents)}
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
                        <td className="px-3 py-2 text-right tabular-nums">{row.mercadosAtivos}</td>
                        <td className="px-3 py-2">
                          {row.repasseConfirmado ? (
                            <span className="text-xs font-medium text-green-700 bg-green-50 px-2 py-1 rounded-full">
                              Confirmado
                            </span>
                          ) : row.appRepassePendenteCents > 0 ? (
                            <span className="text-xs font-medium text-amber-800 bg-amber-50 px-2 py-1 rounded-full">
                              Aguardando PIX
                            </span>
                          ) : (
                            <span className="text-xs text-gray-500">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

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

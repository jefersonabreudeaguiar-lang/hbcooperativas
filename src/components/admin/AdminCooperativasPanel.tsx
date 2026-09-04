"use client";

import { useEffect, useMemo, useState } from "react";
import { Building2, Smartphone } from "lucide-react";
import { Card, StatCard } from "@/components/ui/Card";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { useAppData } from "@/hooks/useAppData";
import { formatDateTime } from "@/utils/format";
import { secureApiFetch } from "@/lib/security/clientSession";
import {
  buildLevantamentoFromAppData,
  mergeLevantamentoComDadosLocais,
  type LevantamentoAberturasApp,
} from "@/services/cooperadoAppUsageService";
import {
  buildPlatformAdminSnapshot,
  formatTempoUso,
  type CloudPlatformOverview,
} from "@/services/platformAdminService";
import { AdminSectionHeader } from "@/components/admin/AdminSectionHeader";

export function AdminCooperativasPanel() {
  const data = useAppData();
  const [appUsage, setAppUsage] = useState<LevantamentoAberturasApp | null>(null);
  const [cloud, setCloud] = useState<CloudPlatformOverview | null>(null);

  useEffect(() => {
    void secureApiFetch("/api/admin/app-usage", { cache: "no-store" })
      .then((r) => r.json())
      .then((json: { levantamento?: LevantamentoAberturasApp }) => setAppUsage(json.levantamento ?? null))
      .catch(() => setAppUsage(null));
    void secureApiFetch("/api/admin/platform-overview", { cache: "no-store" })
      .then((r) => r.json())
      .then(setCloud)
      .catch(() => setCloud(null));
  }, []);

  const levantamento = useMemo(() => {
    if (!data) return null;
    return mergeLevantamentoComDadosLocais(appUsage ?? buildLevantamentoFromAppData(data), data);
  }, [appUsage, data]);

  const snapshot = useMemo(
    () => (data ? buildPlatformAdminSnapshot(data, cloud) : null),
    [data, cloud]
  );

  if (!data || !snapshot) {
    return <p className="text-sm text-gray-500 py-12 text-center">Carregando cooperativas…</p>;
  }

  return (
    <div className="space-y-6 pb-8">
      <AdminSectionHeader
        title="Cooperativas"
        description="Cadastros na plataforma, tempo de uso e engajamento dos cooperados com o aplicativo."
      />

      {levantamento && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard
              title="Média por cooperado"
              value={String(levantamento.mediaAberturasPorCooperado).replace(".", ",")}
              subtitle="aberturas registradas"
              icon={<Smartphone size={22} />}
              variant="gold"
            />
            <StatCard
              title="Cooperados com uso"
              value={String(levantamento.cooperadosComAbertura)}
              subtitle={`de ${levantamento.totalCooperados} ativo(s)`}
              icon={<Smartphone size={22} />}
              variant="success"
            />
            <StatCard
              title="Cooperativas"
              value={String(snapshot.totais.cooperativas)}
              subtitle={`${snapshot.totais.cooperativasAtivas} ativa(s)`}
              icon={<Building2 size={22} />}
            />
            <StatCard
              title="Total aberturas"
              value={String(levantamento.totalAberturas)}
              subtitle="na plataforma"
              icon={<Smartphone size={22} />}
            />
          </div>

          <AlertBanner variant="info" title="Contagem de aberturas">
            Registro automático quando o cooperado abre o app — no máximo 1 a cada 6 horas.
          </AlertBanner>
        </>
      )}

      <Card title="Cooperativas cadastradas">
        {snapshot.cooperativas.length === 0 ? (
          <p className="text-sm text-gray-500 py-8 text-center">Nenhuma cooperativa cadastrada.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-3 py-2">Cooperativa</th>
                  <th className="px-3 py-2">Responsável</th>
                  <th className="px-3 py-2 text-right">Cooperados</th>
                  <th className="px-3 py-2 text-right">Logins</th>
                  <th className="px-3 py-2">Tempo de uso</th>
                  <th className="px-3 py-2">Origem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {snapshot.cooperativas.map((coop) => (
                  <tr key={coop.id + coop.cnpj}>
                    <td className="px-3 py-2">
                      <p className="font-medium text-gray-900">{coop.nome}</p>
                      <p className="text-xs text-gray-500">{coop.cnpjFormatado}</p>
                    </td>
                    <td className="px-3 py-2 text-gray-600">{coop.responsavel ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{coop.totalCooperados}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{coop.usuariosComLogin}</td>
                    <td className="px-3 py-2 text-gray-600">{formatTempoUso(coop.diasDeUso)}</td>
                    <td className="px-3 py-2">
                      <span className="text-xs rounded-full bg-slate-100 px-2 py-1 text-slate-700">
                        {coop.origem === "local" ? "Local" : coop.origem === "nuvem" ? "Nuvem" : "Local + nuvem"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {levantamento && levantamento.cooperativas.length > 0 && (
        <Card title="Engajamento por cooperativa">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-3 py-2">Cooperativa</th>
                  <th className="px-3 py-2 text-right">Cooperados</th>
                  <th className="px-3 py-2 text-right">Com abertura</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2 text-right">Média</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {levantamento.cooperativas.map((coop) => (
                  <tr key={coop.cooperativaCnpj}>
                    <td className="px-3 py-2 font-medium text-gray-900">{coop.cooperativaNome}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{coop.totalCooperados}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{coop.cooperadosComAbertura}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{coop.totalAberturas}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">
                      {String(coop.mediaAberturas).replace(".", ",")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {levantamento && levantamento.topCooperados.length > 0 && (
        <Card title="Cooperados mais ativos">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-3 py-2">Cooperado</th>
                  <th className="px-3 py-2">Cooperativa</th>
                  <th className="px-3 py-2 text-right">Aberturas</th>
                  <th className="px-3 py-2">Último acesso</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {levantamento.topCooperados.slice(0, 15).map((row) => (
                  <tr key={`${row.cooperativaCnpj}-${row.cooperadoId}`}>
                    <td className="px-3 py-2 font-medium text-gray-900">{row.nome}</td>
                    <td className="px-3 py-2 text-gray-600">{row.cooperativaNome}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">{row.aberturas}</td>
                    <td className="px-3 py-2 text-gray-600">
                      {row.ultimoAcessoEm ? formatDateTime(row.ultimoAcessoEm) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

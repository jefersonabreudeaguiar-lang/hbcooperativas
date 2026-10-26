"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Camera, Package } from "lucide-react";
import type { AppData, NotaPedido, User } from "@/types";
import type { JefersonRebuildEntregasPayload } from "@/lib/cooperado/jefersonRebuild/server/jefersonRebuildEntregas";
import { fetchJefersonRebuildPilotApi } from "@/lib/cooperado/jefersonRebuild/jefersonRebuildPilotFetch";
import {
  readJefersonRebuildEntregasClientCache,
  writeJefersonRebuildEntregasClientCache,
} from "@/lib/cooperado/jefersonRebuild/jefersonRebuildEntregasClientCache";
import {
  COOPERADO_JEFERSON_REBUILD_ENTREGAS_ATUALIZAR_EVENT,
  COOPERADO_JEFERSON_REBUILD_ENTREGAS_DONE_EVENT,
} from "@/lib/cooperado/jefersonRebuild/jefersonRebuildEntregasEvents";
import { dismissCooperadoBootShell } from "@/lib/performance/cooperadoBootShell";
import { APP_SUBTLE_UPDATE_EVENT } from "@/lib/cooperadoSubtleUpdate";
import { filtrarResumosEntregasPendentes } from "@/services/cooperadoEntregasService";
import { mesclarResumosFichaCompletaFontes } from "@/lib/cooperado/cooperadoFotosFichaContrato";
import { getEscolaNotaLabel } from "@/utils/notaEscolaLabel";
import { FormField, Select } from "@/components/ui/Form";
import { FilterBar } from "@/components/ui/Table";
import { RouteChunkLoadingShell } from "@/lib/performance/appRouteLazy";

const CooperadoEntregasPorMes = dynamic(
  () =>
    import("@/components/cooperado/CooperadoEntregasPorMes").then((m) => ({
      default: m.CooperadoEntregasPorMes,
    })),
  { loading: () => <RouteChunkLoadingShell /> }
);

type Props = {
  user: Omit<User, "password">;
};

async function fetchEntregas(): Promise<JefersonRebuildEntregasPayload> {
  const res = await fetchJefersonRebuildPilotApi("/api/cooperado-pilot/entregas-resumo", {
    cache: "no-store",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Erro ${res.status}`);
  }
  return res.json() as Promise<JefersonRebuildEntregasPayload>;
}

async function fetchEntregasFresh(): Promise<JefersonRebuildEntregasPayload> {
  const res = await fetchJefersonRebuildPilotApi("/api/cooperado-pilot/atualizar-entregas", {
    method: "POST",
    cache: "no-store",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Erro ${res.status}`);
  }
  const data = (await res.json()) as JefersonRebuildEntregasPayload & { ok?: boolean };
  return data;
}

function dataLiteAsAppData(lite: JefersonRebuildEntregasPayload["dataLite"]): AppData {
  return lite as AppData;
}

export function CooperadoJefersonRebuildEntregasPage({ user }: Props) {
  const [payload, setPayload] = useState<JefersonRebuildEntregasPayload | null>(() =>
    readJefersonRebuildEntregasClientCache()
  );
  const [erro, setErro] = useState<string | null>(null);
  const [boot, setBoot] = useState(() => !readJefersonRebuildEntregasClientCache());
  const [atualizando, setAtualizando] = useState(false);
  const [lento, setLento] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");

  const aplicar = useCallback((data: JefersonRebuildEntregasPayload) => {
    setPayload(data);
    writeJefersonRebuildEntregasClientCache(data);
  }, []);

  const carregar = useCallback(async (manual = false) => {
    setErro(null);
    if (manual) setAtualizando(true);
    else setBoot(true);
    setLento(false);
    const slow = window.setTimeout(() => setLento(true), 6_000);
    try {
      const data = manual ? await fetchEntregasFresh() : await fetchEntregas();
      aplicar(data);
      if (manual) {
        window.dispatchEvent(new Event(APP_SUBTLE_UPDATE_EVENT));
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao carregar entregas.");
    } finally {
      window.clearTimeout(slow);
      setLento(false);
      setAtualizando(false);
      setBoot(false);
      if (manual) {
        window.dispatchEvent(new Event(COOPERADO_JEFERSON_REBUILD_ENTREGAS_DONE_EVENT));
      }
    }
  }, [aplicar]);

  useEffect(() => {
    dismissCooperadoBootShell();
    const start = () => void carregar(false);
    if (typeof requestIdleCallback !== "undefined") {
      const id = requestIdleCallback(start, { timeout: 500 });
      return () => cancelIdleCallback(id);
    }
    const t = window.setTimeout(start, 0);
    return () => window.clearTimeout(t);
  }, [carregar]);

  useEffect(() => {
    const onAtualizar = () => void carregar(true);
    window.addEventListener(COOPERADO_JEFERSON_REBUILD_ENTREGAS_ATUALIZAR_EVENT, onAtualizar);
    return () => window.removeEventListener(COOPERADO_JEFERSON_REBUILD_ENTREGAS_ATUALIZAR_EVENT, onAtualizar);
  }, [carregar]);

  const snap = payload?.snapshot;
  const dataLite = payload?.dataLite;

  const resumosMensais = useMemo(() => {
    if (!snap) return [];
    let base = mesclarResumosFichaCompletaFontes(
      [],
      [],
      snap.entregasBase,
      snap.fichaExtrato,
      undefined
    );
    if (statusFilter === "pendentes") base = filtrarResumosEntregasPendentes(base);
    else if (statusFilter) {
      base = base
        .map((r) => ({
          ...r,
          notas: r.notas.filter((n) => n.status === statusFilter),
        }))
        .filter((r) => r.notas.length > 0);
    }
    return base;
  }, [snap, statusFilter]);

  const nomeCooperado =
    dataLite?.cooperados.find((c) => c.id === payload?.cooperadoId)?.nomeCompleto ??
    user.name ??
    "Cooperado";

  const getEscolaLabel = useCallback(
    (n: NotaPedido) => getEscolaNotaLabel(n, dataLite?.instituicoes ?? []),
    [dataLite?.instituicoes]
  );

  const noopNota = useCallback((_n: NotaPedido) => {
    window.alert(
      "Reenviar ou excluir entrega volta na próxima etapa do piloto. Use Atualizar para ver o status na nuvem."
    );
  }, []);

  const appDataLite = dataLite ? dataLiteAsAppData(dataLite) : null;

  return (
    <div className="space-y-6 max-w-3xl" data-cooperado-rebuild-entregas="1">
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Package size={26} className="text-green-700" />
            Entregas
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {payload?.coopNome ? `${payload.coopNome} · ` : ""}
            Lista da nuvem (sem app pesado no celular)
          </p>
        </div>
        <span className="text-[10px] uppercase tracking-wide text-green-700 font-semibold shrink-0">
          entregas rebuild
        </span>
      </div>

      {erro ? (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erro}</p>
      ) : null}

      <p className="text-sm text-gray-600">
        Cada mês lista suas entregas. Valores consolidados também em{" "}
        <Link href="/ficha-corrida" className="text-green-700 font-semibold underline">
          Financeiro
        </Link>
        .
      </p>

      <div
        className="rounded-2xl border-2 border-dashed border-green-300 bg-green-50/50 p-4 flex items-center gap-3 opacity-80"
        role="status"
      >
        <Camera size={28} className="text-green-600 shrink-0" />
        <p className="text-sm text-green-900">
          <strong>Enviar fotos</strong> — próxima etapa do piloto. Por agora, use o app oficial em outro aparelho ou
          aguarde a homologação desta aba.
        </p>
      </div>

      <FilterBar>
        <FormField label="Filtrar entregas">
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="min-w-[200px]"
            disabled={boot && !payload}
          >
            <option value="">Histórico completo</option>
            <option value="pendentes">Pendentes</option>
            <option value="aguardando_conferencia">Em análise</option>
            <option value="rejeitada">Precisa corrigir</option>
            <option value="conferida">Aprovadas</option>
            <option value="pago">Pagas</option>
          </Select>
        </FormField>
      </FilterBar>

      {boot && !payload ? (
        <div className="rounded-2xl border-2 border-amber-200 bg-white p-6 text-center text-gray-500 space-y-2">
          <p>Carregando entregas da nuvem…</p>
          {lento ? (
            <p className="text-xs text-gray-400">Montando lista no servidor (pode levar alguns segundos).</p>
          ) : null}
        </div>
      ) : payload ? (
        <>
          {atualizando ? (
            <p className="text-xs text-green-700 text-center animate-pulse">Atualizando da nuvem…</p>
          ) : null}
          {statusFilter && resumosMensais.length === 0 ? (
            <div className="text-center py-12 text-gray-500 bg-white rounded-2xl border">
              <Camera size={40} className="mx-auto mb-3 text-gray-300" />
              <p className="font-medium">Nenhuma entrega com este filtro</p>
            </div>
          ) : (
            <CooperadoEntregasPorMes
              resumos={resumosMensais}
              nomeCooperado={nomeCooperado}
              painelRotaAtiva
              dataOverride={appDataLite}
              onReenviar={noopNota}
              onExcluir={noopNota}
              getEscolaLabel={getEscolaLabel}
            />
          )}
        </>
      ) : null}

      {payload?.fetchedAt ? (
        <p className="text-xs text-gray-400 text-center">
          Nuvem · {new Date(payload.fetchedAt).toLocaleString("pt-BR")}
        </p>
      ) : null}
    </div>
  );
}

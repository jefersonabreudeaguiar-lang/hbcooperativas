"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "@/types";
import { CooperadoInicioValorReceberCard } from "@/components/cooperado/CooperadoInicioValorReceberCard";
import type { JefersonRebuildInicioCardPayload } from "@/lib/cooperado/jefersonRebuild/server/jefersonRebuildInicioCard";
import { fetchJefersonRebuildPilotApi } from "@/lib/cooperado/jefersonRebuild/jefersonRebuildPilotFetch";
import {
  readJefersonRebuildInicioClientCache,
  writeJefersonRebuildInicioClientCache,
} from "@/lib/cooperado/jefersonRebuild/jefersonRebuildInicioClientCache";
import { dismissCooperadoBootShell } from "@/lib/performance/cooperadoBootShell";
import { formatMesReferencia, getCurrentMesReferencia } from "@/utils/format";
import { APP_SUBTLE_UPDATE_EVENT } from "@/lib/cooperadoSubtleUpdate";
import {
  COOPERADO_JEFERSON_REBUILD_INICIO_ATUALIZAR_EVENT,
  COOPERADO_JEFERSON_REBUILD_INICIO_DONE_EVENT,
} from "@/lib/cooperado/jefersonRebuild/jefersonRebuildInicioEvents";

type Props = {
  user: Omit<User, "password">;
};

async function fetchCard(): Promise<JefersonRebuildInicioCardPayload> {
  const res = await fetchJefersonRebuildPilotApi("/api/cooperado-pilot/inicio-card", {
    cache: "no-store",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Erro ${res.status}`);
  }
  return res.json() as Promise<JefersonRebuildInicioCardPayload>;
}

async function fetchCardFresh(): Promise<JefersonRebuildInicioCardPayload> {
  const res = await fetchJefersonRebuildPilotApi("/api/cooperado-pilot/atualizar-inicio", {
    method: "POST",
    cache: "no-store",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Erro ${res.status}`);
  }
  const data = (await res.json()) as JefersonRebuildInicioCardPayload & { ok?: boolean };
  return data;
}

export function CooperadoJefersonRebuildInicioPage({ user }: Props) {
  const [payload, setPayload] = useState<JefersonRebuildInicioCardPayload | null>(() =>
    readJefersonRebuildInicioClientCache()
  );
  const [erro, setErro] = useState<string | null>(null);
  const [boot, setBoot] = useState(() => !readJefersonRebuildInicioClientCache());
  const [atualizando, setAtualizando] = useState(false);
  const [lento, setLento] = useState(false);

  const aplicar = useCallback((data: JefersonRebuildInicioCardPayload) => {
    setPayload(data);
    writeJefersonRebuildInicioClientCache(data);
  }, []);

  const carregar = useCallback(async (manual = false) => {
    setErro(null);
    if (manual) setAtualizando(true);
    else setBoot(true);
    setLento(false);
    const slow = window.setTimeout(() => setLento(true), 6_000);
    try {
      const data = manual ? await fetchCardFresh() : await fetchCard();
      aplicar(data);
      if (manual) {
        window.dispatchEvent(new Event(APP_SUBTLE_UPDATE_EVENT));
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao carregar.");
    } finally {
      window.clearTimeout(slow);
      setLento(false);
      setAtualizando(false);
      setBoot(false);
      if (manual) {
        window.dispatchEvent(new Event(COOPERADO_JEFERSON_REBUILD_INICIO_DONE_EVENT));
      }
    }
  }, [aplicar]);

  useEffect(() => {
    dismissCooperadoBootShell();
    const start = () => void carregar(false);
    if (typeof requestIdleCallback !== "undefined") {
      const id = requestIdleCallback(start, { timeout: 400 });
      return () => cancelIdleCallback(id);
    }
    const t = window.setTimeout(start, 0);
    return () => window.clearTimeout(t);
  }, [carregar]);

  useEffect(() => {
    const onAtualizar = () => void carregar(true);
    window.addEventListener(COOPERADO_JEFERSON_REBUILD_INICIO_ATUALIZAR_EVENT, onAtualizar);
    return () => window.removeEventListener(COOPERADO_JEFERSON_REBUILD_INICIO_ATUALIZAR_EVENT, onAtualizar);
  }, [carregar]);

  const nome = user.name?.split(" ")[0] ?? "Cooperado";
  const mes = formatMesReferencia(getCurrentMesReferencia());
  const coopNome = payload?.coopNome;

  return (
    <div className="space-y-6 max-w-3xl" data-cooperado-inicio-shell="1" data-cooperado-rebuild-inicio="1">
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Olá, {nome}!</h1>
          <p className="text-sm text-gray-500 mt-1">
            {coopNome ? `${coopNome} · ` : ""}
            {mes}
          </p>
        </div>
        <span className="text-[10px] uppercase tracking-wide text-green-700 font-semibold shrink-0">
          início rebuild
        </span>
      </div>

      {erro ? (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erro}</p>
      ) : null}

      {boot && !payload ? (
        <div className="rounded-2xl border-2 border-amber-200 bg-white p-6 text-center text-gray-500 space-y-2">
          <p>Carregando valor da nuvem…</p>
          {lento ? (
            <p className="text-xs text-gray-400">Montando na nuvem (sem app pesado no celular).</p>
          ) : null}
        </div>
      ) : payload ? (
        <CooperadoInicioValorReceberCard snapshot={payload.card} atualizando={atualizando} exibirReciboAssinatura />
      ) : null}

      {payload?.fetchedAt ? (
        <p className="text-xs text-gray-400 text-center">
          Nuvem · {new Date(payload.fetchedAt).toLocaleString("pt-BR")}
        </p>
      ) : null}
    </div>
  );
}

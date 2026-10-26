"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/modules/auth/AuthProvider";
import { CooperadoInicioOláTitulo } from "@/components/cooperado/CooperadoInicioCooperadoLiveLeaf";
import { CooperadoInicioValorReceberCard } from "@/components/cooperado/CooperadoInicioValorReceberCard";
import type { CooperadoV2InicioCardPayload } from "@/lib/cooperado-v2/server/cooperadoV2InicioCard";
import { CooperadoV2Shell } from "@/components/cooperado-v2/CooperadoV2Shell";

async function fetchInicioCard(): Promise<CooperadoV2InicioCardPayload> {
  const res = await fetch("/api/cooperado-v2/inicio-card", {
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Erro ${res.status}`);
  }
  return res.json() as Promise<CooperadoV2InicioCardPayload>;
}

export function CooperadoV2InicioPage() {
  const { user } = useAuth();
  const [payload, setPayload] = useState<CooperadoV2InicioCardPayload | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [atualizando, setAtualizando] = useState(false);
  const [boot, setBoot] = useState(true);

  const carregar = useCallback(async (manual = false) => {
    setErro(null);
    if (manual) setAtualizando(true);
    else setBoot(true);
    try {
      if (manual) {
        const res = await fetch("/api/cooperado-v2/atualizar", {
          method: "POST",
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? `Erro ${res.status}`);
        }
        const data = (await res.json()) as CooperadoV2InicioCardPayload & { ok?: boolean };
        setPayload(data);
      } else {
        setPayload(await fetchInicioCard());
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao carregar.");
    } finally {
      setAtualizando(false);
      setBoot(false);
    }
  }, []);

  useEffect(() => {
    void carregar(false);
  }, [carregar]);

  const nome = user?.name?.split(" ")[0];

  return (
    <CooperadoV2Shell onAtualizar={() => void carregar(true)} atualizando={atualizando}>
      <div className="space-y-4">
        <div className="flex items-baseline justify-between gap-2">
          <h1 className="text-2xl font-bold text-gray-900">
            <CooperadoInicioOláTitulo nomeFromView={nome} />
          </h1>
          <span className="text-[10px] uppercase tracking-wide text-green-700 font-semibold">v2 piloto</span>
        </div>

        {payload?.coopNome ? (
          <p className="text-sm text-gray-600">{payload.coopNome}</p>
        ) : null}

        {erro ? (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erro}</p>
        ) : null}

        {boot && !payload ? (
          <div className="rounded-2xl border-2 border-amber-200 bg-white p-6 text-center text-gray-500">
            Carregando da nuvem…
          </div>
        ) : payload ? (
          <CooperadoInicioValorReceberCard snapshot={payload.card} atualizando={atualizando} />
        ) : null}

        {payload?.fetchedAt ? (
          <p className="text-xs text-gray-400 text-center">
            Nuvem · {new Date(payload.fetchedAt).toLocaleString("pt-BR")}
          </p>
        ) : null}
      </div>
    </CooperadoV2Shell>
  );
}

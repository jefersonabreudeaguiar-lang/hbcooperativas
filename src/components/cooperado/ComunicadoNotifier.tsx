"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAppData } from "@/hooks/useAppData";
import { usePermissions } from "@/hooks/usePermissions";
import { subscribe } from "@/services/dataStore";
import { getComunicadoAssunto, getComunicadosCooperado } from "@/services/comunicadoService";
import { getUserCooperativaId } from "@/utils/cooperativa";
import {
  notificarNovoComunicado,
  prepararAudioNotificacao,
  solicitarPermissaoNotificacao,
} from "@/utils/notifications";
import { AlertBanner } from "@/components/ui/AlertBanner";

const VISTOS_KEY = "hb-comunicados-notificados";

function lerVistos(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(VISTOS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function gravarVistos(ids: Set<string>) {
  const lista = [...ids].slice(-200);
  localStorage.setItem(VISTOS_KEY, JSON.stringify(lista));
}

export function ComunicadoNotifier() {
  const data = useAppData();
  const { isCooperado, cooperadoId, user } = usePermissions();
  const vistosRef = useRef<Set<string>>(lerVistos());
  const initializedRef = useRef(false);
  const permissionAskedRef = useRef(false);
  const [alerta, setAlerta] = useState<{ id: string; assunto: string } | null>(null);

  const processar = useCallback(() => {
    if (!data || !isCooperado || !cooperadoId || !user) return;
    const coopId = getUserCooperativaId(user, data);
    if (!coopId) return;

    const comunicados = getComunicadosCooperado(data, coopId, cooperadoId);
    const idsAtuais = new Set(comunicados.map((c) => c.id));

    if (!initializedRef.current) {
      comunicados.forEach((c) => vistosRef.current.add(c.id));
      gravarVistos(vistosRef.current);
      initializedRef.current = true;
      return;
    }

    for (const c of comunicados) {
      if (vistosRef.current.has(c.id) || c.virtual) continue;

      vistosRef.current.add(c.id);
      gravarVistos(vistosRef.current);

      const assunto = getComunicadoAssunto(c);
      const preview = c.descricao?.trim() || (c.audioDataUrl ? "Ouça o recado em áudio no início." : undefined);
      notificarNovoComunicado(assunto, preview);
      setAlerta({ id: c.id, assunto });
      break;
    }

    idsAtuais.forEach((id) => vistosRef.current.add(id));
    gravarVistos(vistosRef.current);
  }, [data, isCooperado, cooperadoId, user]);

  useEffect(() => {
    if (!isCooperado || !cooperadoId) return;
    processar();
    return subscribe(processar);
  }, [isCooperado, cooperadoId, processar]);

  useEffect(() => {
    if (!isCooperado || permissionAskedRef.current) return;
    permissionAskedRef.current = true;
    solicitarPermissaoNotificacao().catch(() => {});
  }, [isCooperado]);

  useEffect(() => {
    if (!isCooperado) return;
    const unlock = () => prepararAudioNotificacao();
    window.addEventListener("click", unlock, { once: true });
    window.addEventListener("touchstart", unlock, { once: true });
    return () => {
      window.removeEventListener("click", unlock);
      window.removeEventListener("touchstart", unlock);
    };
  }, [isCooperado]);

  if (!isCooperado || !alerta) return null;

  return (
    <div className="fixed top-16 left-4 right-4 z-50 lg:top-4 lg:left-auto lg:right-6 lg:max-w-md shadow-lg">
      <AlertBanner variant="info" title="Recado da cooperativa" onDismiss={() => setAlerta(null)}>
        <strong>{alerta.assunto}</strong>
        <Link href="/dashboard" className="block mt-2 font-semibold underline">
          Ver no início
        </Link>
      </AlertBanner>
    </div>
  );
}

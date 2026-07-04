"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useAppDataSelector } from "@/hooks/useAppData";
import { usePermissions } from "@/hooks/usePermissions";
import {
  notificarEntregaAprovada,
  prepararAudioNotificacao,
  solicitarPermissaoNotificacao,
} from "@/utils/notifications";
import { AlertBanner } from "@/components/ui/AlertBanner";
import type { NotaPedidoStatus } from "@/types";

interface AprovacaoAlert {
  id: string;
}

export function EntregaAprovadaNotifier() {
  const { isCooperado, cooperadoId } = usePermissions();
  const notasCooperado = useAppDataSelector(
    (data) =>
      cooperadoId
        ? data.notasPedido.filter((n) => n.cooperadoId === cooperadoId)
        : [],
    [cooperadoId]
  ) ?? [];
  const prevStatusRef = useRef<Map<string, NotaPedidoStatus>>(new Map());
  const initializedRef = useRef(false);
  const permissionAskedRef = useRef(false);
  const [alerta, setAlerta] = useState<AprovacaoAlert | null>(null);

  const processarNotas = useCallback(() => {
    if (!isCooperado || !cooperadoId) return;

    const minhas = notasCooperado;

    if (!initializedRef.current) {
      minhas.forEach((n) => prevStatusRef.current.set(n.id, n.status));
      initializedRef.current = true;
      return;
    }

    minhas.forEach((nota) => {
      const prev = prevStatusRef.current.get(nota.id);
      prevStatusRef.current.set(nota.id, nota.status);

      const acabouDeAprovar =
        nota.status === "conferida" &&
        prev !== undefined &&
        prev !== "conferida" &&
        prev !== "pago";

      if (!acabouDeAprovar) return;

      notificarEntregaAprovada();

      setAlerta({ id: nota.id });
    });
  }, [notasCooperado, isCooperado, cooperadoId]);

  useEffect(() => {
    if (!isCooperado || !cooperadoId) return;
    const timer = setTimeout(processarNotas, 150);
    return () => clearTimeout(timer);
  }, [notasCooperado, isCooperado, cooperadoId, processarNotas]);

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
      <AlertBanner
        variant="success"
        title="Entrega aprovada!"
        onDismiss={() => setAlerta(null)}
      />
    </div>
  );
}

"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useAppData } from "@/hooks/useAppData";
import { usePermissions } from "@/hooks/usePermissions";
import { subscribe } from "@/services/dataStore";
import { formatCurrency } from "@/utils/format";
import {
  notificarEntregaAprovada,
  prepararAudioNotificacao,
  solicitarPermissaoNotificacao,
} from "@/utils/notifications";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { Button } from "@/components/ui/Button";
import Link from "next/link";
import type { NotaPedidoStatus } from "@/types";

interface AprovacaoAlert {
  id: string;
  escola: string;
  valor: string;
  numeroNota: string;
}

export function EntregaAprovadaNotifier() {
  const data = useAppData();
  const { isCooperado, cooperadoId } = usePermissions();
  const prevStatusRef = useRef<Map<string, NotaPedidoStatus>>(new Map());
  const initializedRef = useRef(false);
  const permissionAskedRef = useRef(false);
  const [alerta, setAlerta] = useState<AprovacaoAlert | null>(null);

  const processarNotas = useCallback(() => {
    if (!data || !isCooperado || !cooperadoId) return;

    const minhas = data.notasPedido.filter((n) => n.cooperadoId === cooperadoId);

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

      const escola = data.instituicoes.find((i) => i.id === nota.instituicaoId)?.nome ?? "Escola";
      const valor = formatCurrency(nota.valorLiquido);

      notificarEntregaAprovada({
        escola,
        valor,
        numeroNota: nota.numeroNota,
      });

      setAlerta({
        id: nota.id,
        escola,
        valor,
        numeroNota: nota.numeroNota,
      });
    });
  }, [data, isCooperado, cooperadoId]);

  useEffect(() => {
    if (!isCooperado || !cooperadoId) return;
    processarNotas();
    return subscribe(processarNotas);
  }, [isCooperado, cooperadoId, processarNotas]);

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
      >
        <p>
          Sua entrega em <strong>{alerta.escola}</strong> foi conferida.
          Valor lançado: <strong>{alerta.valor}</strong> (nota {alerta.numeroNota}).
        </p>
        <Link href="/ficha-corrida">
          <Button size="sm" className="mt-3">Ver quanto vou receber</Button>
        </Link>
      </AlertBanner>
    </div>
  );
}

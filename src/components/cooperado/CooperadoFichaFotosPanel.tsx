"use client";

import { useEffect, useMemo, useState } from "react";
import { Camera } from "lucide-react";
import type { NotaPedido } from "@/types";
import type { ResumoMesEntregasCooperado } from "@/services/cooperadoEntregasService";
import {
  getCooperativaCnpj,
  resolveCooperativaCnpj,
} from "@/services/notaPedidoCloudService";
import { useAppDataSnapshotForDomainsWhenActive } from "@/hooks/useAppData";
import { getData, isAppDataWarm } from "@/services/dataStore";
import { useAuth } from "@/modules/auth/AuthProvider";
import { contarFotosEnviadasNotas } from "@/utils/fotoEntrega";
import { normalizeCnpj } from "@/utils/cooperativa";
import {
  CooperadoMesEntregasFotosSanfona,
  CooperadoMesFotosConteudo,
} from "@/components/cooperado/cooperadoMesEntregasFotosSanfona";

interface CooperadoFichaFotosPanelProps {
  resumos: ResumoMesEntregasCooperado[];
  getEscolaLabel: (nota: NotaPedido) => string;
  cooperativaId?: string;
  mesReferenciaInicial?: string | null;
  modoInline?: boolean;
}

export function CooperadoFichaFotosPanel({
  resumos,
  getEscolaLabel,
  cooperativaId,
  mesReferenciaInicial,
  modoInline,
}: CooperadoFichaFotosPanelProps) {
  const dataLive = useAppDataSnapshotForDomainsWhenActive(true, ["notas"] as const);
  const data = dataLive ?? (typeof window !== "undefined" && isAppDataWarm() ? getData() : null);
  const { user } = useAuth();
  const [cnpj, setCnpj] = useState<string | undefined>();

  useEffect(() => {
    if (!data) return;
    const local = cooperativaId ? getCooperativaCnpj(data, cooperativaId) : undefined;
    if (local) {
      setCnpj(local);
      return;
    }
    const fromUser = normalizeCnpj(user?.cooperativaCnpj ?? "");
    if (fromUser.length === 14) {
      setCnpj(fromUser);
      return;
    }
    let cancelled = false;
    void resolveCooperativaCnpj(data, cooperativaId, user).then((resolved) => {
      if (!cancelled) setCnpj(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [data, cooperativaId, user]);

  const mesesComFoto = useMemo(
    () => resumos.filter((r) => contarFotosEnviadasNotas(r.notas) > 0),
    [resumos]
  );
  const [mesExpandido, setMesExpandido] = useState<string | null>(
    mesesComFoto[0]?.mesReferencia ?? null
  );

  useEffect(() => {
    if (mesReferenciaInicial && mesesComFoto.some((m) => m.mesReferencia === mesReferenciaInicial)) {
      setMesExpandido(mesReferenciaInicial);
      return;
    }
    if (mesesComFoto.length > 0 && !mesesComFoto.some((m) => m.mesReferencia === mesExpandido)) {
      setMesExpandido(mesesComFoto[0]?.mesReferencia ?? null);
    }
  }, [mesesComFoto, mesExpandido, mesReferenciaInicial]);

  const totalFotos = useMemo(
    () => mesesComFoto.reduce((s, r) => s + contarFotosEnviadasNotas(r.notas), 0),
    [mesesComFoto]
  );

  if (modoInline && mesesComFoto.length === 1) {
    const resumo = mesesComFoto[0]!;
    if (contarFotosEnviadasNotas(resumo.notas) === 0) {
      return (
        <p className="text-sm text-gray-500 py-4 text-center">
          Nenhuma foto neste mês.
        </p>
      );
    }
    return <CooperadoMesFotosConteudo resumo={resumo} getEscolaLabel={getEscolaLabel} cnpj={cnpj} />;
  }

  if (mesesComFoto.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500 bg-white rounded-2xl border border-dashed">
        <Camera size={48} className="mx-auto mb-4 text-gray-300" />
        <p className="font-semibold text-gray-800">Nenhuma foto enviada ainda</p>
        <p className="text-sm mt-2 max-w-sm mx-auto">
          Quando houver entrega com foto, ela aparece aqui por mês. Toque para ampliar e passe para a
          próxima.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-900">
        <strong>{totalFotos}</strong> foto{totalFotos !== 1 ? "s" : ""} em{" "}
        <strong>{mesesComFoto.length}</strong> mês{mesesComFoto.length !== 1 ? "es" : ""}. Toque no mês
        para ver as imagens; toque em qualquer foto para ampliar em tela cheia — incluindo entregas aguardando
        conferência e as já lançadas.
      </div>

      <div className="space-y-3">
        {mesesComFoto.map((resumo) => (
          <CooperadoMesEntregasFotosSanfona
            key={resumo.mesReferencia}
            resumo={resumo}
            getEscolaLabel={getEscolaLabel}
            cnpj={cnpj}
            expandido={mesExpandido === resumo.mesReferencia}
            onToggle={() =>
              setMesExpandido((cur) => (cur === resumo.mesReferencia ? null : resumo.mesReferencia))
            }
          />
        ))}
      </div>
    </div>
  );
}

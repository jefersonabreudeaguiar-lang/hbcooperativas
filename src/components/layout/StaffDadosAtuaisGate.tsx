"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import type { User } from "@/types";
import { useStaffPrimeiroDiaContratos } from "@/hooks/useStaffPrimeiroDiaContratos";
import { fingerprintCooperativaCloudRevision } from '@/lib/performance/cooperadoEventDrivenSync';
import { fetchCooperativaCloudRevision } from '@/services/cooperativaSyncRevisionService';
import { criarContadorRevisionWatch } from '@/lib/staff/contadorRevisionWatch';

function PainelAtualizado({ children }: { children: ReactNode }) {
  useStaffPrimeiroDiaContratos();
  return <>{children}</>;
}

/** Primeira entrada: valores só aparecem depois da confirmação da nuvem. */
export function StaffDadosAtuaisGate({ user, children }: { user: Omit<User, "password">; children: ReactNode }) {
  const [status, setStatus] = useState<"carregando" | "pronto" | "erro">("carregando");
  const [tentativa, setTentativa] = useState(0);
  const [erro, setErro] = useState("A consulta demorou além do esperado. Tente novamente.");
  const appliedRevision = useRef('');
  const [confirmedAt, setConfirmedAt] = useState<number | null>(null);
  useEffect(() => {
    let ativa = true;
    const timeout = window.setTimeout(() => {
      ativa = false;
      setStatus("erro");
    }, 75_000);
    void import("@/services/staffEntradaAtualizadaService")
      .then(({ atualizarEntradaStaff }) => atualizarEntradaStaff(user, () => ativa))
      .then((revision) => { if (ativa) { appliedRevision.current = fingerprintCooperativaCloudRevision(revision); setConfirmedAt(Date.now()); setStatus("pronto"); } })
      .catch((e: unknown) => { if (ativa) { setErro(e instanceof Error ? e.message : "Não foi possível consultar a nuvem."); setStatus("erro"); } })
      .finally(() => window.clearTimeout(timeout));
    return () => { ativa = false; window.clearTimeout(timeout); };
  // Atualizações do objeto de perfil não devem reiniciar a entrada ao salvar a base.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, user.cooperativaId, user.cooperativaCnpj, tentativa]);

  useEffect(() => {
    if (user.role !== 'contador' || status !== 'pronto' || !user.cooperativaCnpj) return;
    const watch = criarContadorRevisionWatch({ applied: appliedRevision.current,
      read: async () => { const revision = await fetchCooperativaCloudRevision(user.cooperativaCnpj!); return revision ? fingerprintCooperativaCloudRevision(revision) : null; },
      changed: () => { setStatus('carregando'); setTentativa(v => v + 1); },
      failed: () => { setErro('Não foi possível confirmar a atualização da nuvem. Tente novamente.'); setStatus('erro'); },
    });
    const check = () => { if (!document.hidden) void watch.check(); };
    const timer = window.setInterval(check, 60_000);
    window.addEventListener('focus', check);
    window.addEventListener('online', check);
    document.addEventListener('visibilitychange', check);
    return () => { watch.stop(); window.clearInterval(timer); window.removeEventListener('focus', check); window.removeEventListener('online', check); document.removeEventListener('visibilitychange', check); };
  }, [user.id, user.role, user.cooperativaCnpj, status]);

  if (status === "pronto") return user.role === 'contador' ? <><p className="mb-4 text-xs text-gray-600" role="status">Dados conferidos na nuvem{confirmedAt ? ` · ${new Date(confirmedAt).toLocaleString('pt-BR')}` : ''}</p>{children}</> : <PainelAtualizado>{children}</PainelAtualizado>;
  return <section className="mx-auto mt-12 max-w-md rounded-2xl border bg-white p-8 text-center" aria-live="polite" aria-busy={status === "carregando"}>
    <RefreshCw className={`mx-auto mb-4 text-green-700 ${status === "carregando" ? "animate-spin" : ""}`} size={28} aria-hidden />
    <h1 className="text-lg font-semibold text-gray-900">{status === "carregando" ? "Buscando dados atualizados" : "Não foi possível atualizar"}</h1>
    <p className="mt-2 text-sm text-gray-600">{status === "carregando" ? "Conferindo entregas, pagamentos, contratos e Livro Caixa na nuvem." : erro}</p>
    {status === "erro" && <button type="button" className="mt-5 rounded-xl bg-green-700 px-5 py-3 font-medium text-white" onClick={() => { setStatus("carregando"); setTentativa((v) => v + 1); }}>Tentar novamente</button>}
  </section>;
}

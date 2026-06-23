"use client";

import { useEffect, useMemo, useState } from "react";
import { Calendar, Save, Wallet } from "lucide-react";
import { useAppData } from "@/hooks/useAppData";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, FormField } from "@/components/ui/Form";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { updateData, addAuditEntry, getData } from "@/services/dataStore";
import { resolveCooperativaCnpj } from "@/services/notaPedidoCloudService";
import { pushCooperativaProfileToCloud, pushOperacionalToCloud } from "@/services/cooperativaSyncCloudService";
import { aplicarConfigMensalidadeCooperativa } from "@/services/mensalidadeService";
import {
  classificarMesReferencia,
  formatCurrency,
  formatMesReferencia,
  getCurrentMesReferencia,
  listMesesReferencia,
} from "@/utils/format";
import type { MensalidadeConfig, User } from "@/types";

interface Props {
  cooperativaId: string;
  user: Pick<User, "id" | "name">;
  canEdit: boolean;
}

export function MensalidadeConfigPanel({ cooperativaId, user, canEdit }: Props) {
  const data = useAppData();
  const cooperativa = data?.cooperativas.find((c) => c.id === cooperativaId);
  const mesAtual = getCurrentMesReferencia();

  const [valorPadrao, setValorPadrao] = useState("");
  const [diaVencimento, setDiaVencimento] = useState("10");
  const [mesesMarcados, setMesesMarcados] = useState<string[]>([mesAtual]);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  const mesesOpcoes = useMemo(() => listMesesReferencia(mesAtual, 8, 8), [mesAtual]);

  useEffect(() => {
    const cfg = cooperativa?.mensalidadeConfig;
    if (!cfg) return;
    setValorPadrao(cfg.valorPadrao > 0 ? String(cfg.valorPadrao) : "");
    setDiaVencimento(String(cfg.diaVencimento || 10));
    const marcados = cfg.mesesCobranca?.length ? cfg.mesesCobranca : [mesAtual];
    setMesesMarcados(marcados);
  }, [cooperativa?.mensalidadeConfig, mesAtual]);

  const toggleMes = (mes: string) => {
    setMesesMarcados((prev) =>
      prev.includes(mes) ? prev.filter((m) => m !== mes) : [...prev, mes].sort()
    );
  };

  const marcarGrupo = (tipo: "passado" | "atual" | "futuro" | "todos") => {
    if (tipo === "todos") {
      setMesesMarcados([...mesesOpcoes]);
      return;
    }
    const grupo = mesesOpcoes.filter((m) => classificarMesReferencia(m, mesAtual) === tipo);
    setMesesMarcados((prev) => [...new Set([...prev, ...grupo])].sort());
  };

  const salvar = async () => {
    const valor = parseFloat(valorPadrao.replace(",", "."));
    if (!Number.isFinite(valor) || valor <= 0 || mesesMarcados.length === 0) return;

    setSalvando(true);
    const cfg: MensalidadeConfig = {
      valorPadrao: valor,
      diaVencimento: Math.min(28, Math.max(1, parseInt(diaVencimento, 10) || 10)),
      lembreteAtivo: true,
      diaLembrete: Math.max(1, Math.min(28, (parseInt(diaVencimento, 10) || 10) - 1)),
      gerarAutomaticamente: true,
      mesesCobranca: [...mesesMarcados].sort(),
    };

    updateData((d) => {
      const next = aplicarConfigMensalidadeCooperativa(d, cooperativaId, cfg);
      return addAuditEntry(next, {
        entityType: "mensalidade",
        entityId: cooperativaId,
        action: "editar",
        userId: user.id,
        userName: user.name,
        changes: `Config mensalidade · ${formatCurrency(valor)} · dia ${cfg.diaVencimento} · ${mesesMarcados.length} mês(es)`,
      });
    });

    try {
      const d = getData();
      const cnpj = await resolveCooperativaCnpj(d, cooperativaId);
      const coop = d.cooperativas.find((c) => c.id === cooperativaId);
      if (coop) await pushCooperativaProfileToCloud(coop);
      if (cnpj) await pushOperacionalToCloud(cnpj, d, cooperativaId);
    } finally {
      setSalvando(false);
      setSalvo(true);
      setTimeout(() => setSalvo(false), 3000);
    }
  };

  if (!cooperativa) return null;

  return (
    <Card className="mb-6 border-green-200 bg-gradient-to-br from-green-50/80 to-white">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center shrink-0">
          <Wallet size={20} className="text-green-700" />
        </div>
        <div>
          <h3 className="font-bold text-gray-900">Valor fixo da mensalidade</h3>
          <p className="text-sm text-gray-600 mt-1">
            Este valor é descontado automaticamente no pagamento de todos os cooperados nos meses marcados.
            Um dia antes do vencimento, todos recebem aviso no início do app.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField label="Valor fixo (R$)" required>
          <Input
            type="number"
            step="0.01"
            min={0}
            value={valorPadrao}
            onChange={(e) => setValorPadrao(e.target.value)}
            disabled={!canEdit}
            placeholder="Ex: 50,00"
          />
        </FormField>
        <FormField label="Dia da mensalidade (vencimento)" required hint="Dia do mês em que vence (1 a 28)">
          <Input
            type="number"
            min={1}
            max={28}
            value={diaVencimento}
            onChange={(e) => setDiaVencimento(e.target.value)}
            disabled={!canEdit}
          />
        </FormField>
      </div>

      <div className="mt-5">
        <div className="flex items-center gap-2 mb-2">
          <Calendar size={18} className="text-gray-500" />
          <p className="text-sm font-semibold text-gray-900">Meses que serão cobrados</p>
        </div>
        <p className="text-xs text-gray-500 mb-3">
          Marque meses retroativos, o mês atual ou futuros. A cobrança e o desconto nos pagamentos valem só nos meses selecionados.
        </p>

        {canEdit && (
          <div className="flex flex-wrap gap-2 mb-3">
            <Button type="button" size="sm" variant="secondary" onClick={() => marcarGrupo("passado")}>
              + Retroativos
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => marcarGrupo("atual")}>
              Mês atual
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => marcarGrupo("futuro")}>
              + Futuros
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => marcarGrupo("todos")}>
              Marcar todos
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setMesesMarcados([])}>
              Limpar
            </Button>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {mesesOpcoes.map((mes) => {
            const tipo = classificarMesReferencia(mes, mesAtual);
            const ativo = mesesMarcados.includes(mes);
            const tipoLabel =
              tipo === "passado" ? "Retroativo" : tipo === "futuro" ? "Futuro" : "Atual";
            return (
              <button
                key={mes}
                type="button"
                disabled={!canEdit}
                onClick={() => toggleMes(mes)}
                className={`text-left p-3 rounded-xl border text-sm transition-colors ${
                  ativo
                    ? "border-green-600 bg-green-100 text-green-900"
                    : "border-gray-200 bg-white text-gray-700 hover:border-green-300"
                } ${!canEdit ? "opacity-70 cursor-default" : ""}`}
              >
                <span className="font-medium block">{formatMesReferencia(mes)}</span>
                <span className="text-xs opacity-75">{tipoLabel}</span>
              </button>
            );
          })}
        </div>
      </div>

      {mesesMarcados.length === 0 && (
        <AlertBanner variant="warning" className="mt-4" title="Selecione ao menos um mês">
          Marque os meses em que a mensalidade será gerada e descontada nos pagamentos.
        </AlertBanner>
      )}

      {canEdit && (
        <Button className="mt-5" onClick={() => void salvar()} disabled={salvando || mesesMarcados.length === 0}>
          <Save size={16} /> {salvando ? "Salvando…" : salvo ? "Salvo!" : "Salvar configuração"}
        </Button>
      )}
    </Card>
  );
}

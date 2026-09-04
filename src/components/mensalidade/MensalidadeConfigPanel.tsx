"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Calendar, Save, Wallet } from "lucide-react";
import { useAppData } from "@/hooks/useAppData";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, FormField } from "@/components/ui/Form";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { updateData, addAuditEntry, getData } from "@/services/dataStore";
import { resolveCooperativaCnpj } from "@/services/notaPedidoCloudService";
import { pushCooperativaProfileToCloud, pushOperacionalToCloud } from "@/services/cooperativaSyncCloudService";
import { aplicarConfigMensalidadeCooperativa, mergeConfigMensalidadeCooperativa } from "@/services/mensalidadeService";
import {
  CONTA_COOP_DESCONTO_SPLIT,
  MENSALIDADE_COOPERADO_VALOR_PADRAO,
} from "@/config/contaCoopEconomia";
import {
  classificarMesReferencia,
  formatCurrency,
  formatMesReferenciaCurto,
  getCurrentMesReferencia,
  listMesesReferencia,
} from "@/utils/format";
import type { MensalidadeConfig, User } from "@/types";

interface Props {
  cooperativaId: string;
  user: Pick<User, "id" | "name">;
  canEdit: boolean;
}

function snapshotConfig(cfg: MensalidadeConfig | undefined, mesAtual: string): string {
  if (!cfg) return "";
  const meses = [...(cfg.mesesCobranca ?? [])].sort().join(",");
  return JSON.stringify({
    valorPadrao: cfg.valorPadrao,
    diaVencimento: cfg.diaVencimento,
    meses,
    fallback: meses ? "" : mesAtual,
  });
}

export function MensalidadeConfigPanel({ cooperativaId, user, canEdit }: Props) {
  const data = useAppData();
  const cooperativa = data?.cooperativas.find((c) => c.id === cooperativaId);
  const mesAtual = getCurrentMesReferencia();

  const [valorPadrao, setValorPadrao] = useState("");
  const [diaVencimento, setDiaVencimento] = useState("10");
  const [mesesMarcados, setMesesMarcados] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [editando, setEditando] = useState(false);
  const ultimoSyncRef = useRef("");

  const mesesOpcoes = useMemo(() => listMesesReferencia(mesAtual, 8, 8), [mesAtual]);

  const configSalva = cooperativa?.mensalidadeConfig;
  const configKey = useMemo(
    () => snapshotConfig(configSalva, mesAtual),
    [
      configSalva?.valorPadrao,
      configSalva?.diaVencimento,
      configSalva?.mesesCobranca?.join(","),
      mesAtual,
    ]
  );

  useEffect(() => {
    ultimoSyncRef.current = "";
  }, [cooperativaId]);

  useEffect(() => {
    if (editando) return;
    if (!configKey || configKey === ultimoSyncRef.current) return;
    ultimoSyncRef.current = configKey;

    const cfg = configSalva;
    if (!cfg) {
      setValorPadrao(String(MENSALIDADE_COOPERADO_VALOR_PADRAO));
      setDiaVencimento("10");
      setMesesMarcados([]);
      return;
    }

    setValorPadrao(cfg.valorPadrao > 0 ? String(cfg.valorPadrao) : "");
    setDiaVencimento(String(cfg.diaVencimento || 10));
    setMesesMarcados(cfg.mesesCobranca?.length ? [...cfg.mesesCobranca].sort() : []);
  }, [configKey, configSalva, editando]);

  const marcarEditando = () => {
    if (canEdit) setEditando(true);
  };

  const toggleMes = (mes: string) => {
    if (!canEdit) return;
    marcarEditando();
    setMesesMarcados((prev) =>
      prev.includes(mes) ? prev.filter((m) => m !== mes) : [...prev, mes].sort()
    );
  };

  const marcarGrupo = (tipo: "passado" | "atual" | "futuro" | "todos") => {
    if (!canEdit) return;
    marcarEditando();
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
    const mesesOrdenados = [...mesesMarcados].sort();
    const cfg: MensalidadeConfig = mergeConfigMensalidadeCooperativa(configSalva, {
      valorPadrao: valor,
      diaVencimento: Math.min(28, Math.max(1, parseInt(diaVencimento, 10) || 10)),
      lembreteAtivo: configSalva?.lembreteAtivo ?? true,
      diaLembrete: Math.max(1, Math.min(28, (parseInt(diaVencimento, 10) || 10) - 1)),
      gerarAutomaticamente: true,
      mesesCobranca: mesesOrdenados,
    });

    updateData((d) => {
      const next = aplicarConfigMensalidadeCooperativa(d, cooperativaId, cfg);
      return addAuditEntry(next, {
        entityType: "mensalidade",
        entityId: cooperativaId,
        action: "editar",
        userId: user.id,
        userName: user.name,
        changes: `Config mensalidade · ${formatCurrency(valor)} · dia ${cfg.diaVencimento} · ${mesesOrdenados.length} mês(es)`,
      });
    });

    ultimoSyncRef.current = snapshotConfig(cfg, mesAtual);
    setEditando(false);

    try {
      const d = getData();
      const cnpj = await resolveCooperativaCnpj(d, cooperativaId);
      const coop = d.cooperativas.find((c) => c.id === cooperativaId);
      if (coop) await pushCooperativaProfileToCloud(coop);
      if (cnpj) await pushOperacionalToCloud(cnpj, d, cooperativaId, { authoritative: true });
    } finally {
      setSalvando(false);
      setSalvo(true);
      setTimeout(() => setSalvo(false), 3000);
    }
  };

  const valorFixoSalvo = configSalva?.valorPadrao ?? 0;
  const diaFixoSalvo = configSalva?.diaVencimento ?? 10;
  const mesesFixosSalvos = configSalva?.mesesCobranca ?? [];

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
            Depois de salvar, o valor permanece fixo para todos os cooperados até você alterar aqui.
            É descontado automaticamente nos pagamentos dos meses marcados. O padrão recomendado é R${" "}
            {MENSALIDADE_COOPERADO_VALOR_PADRAO.toFixed(2).replace(".", ",")} (mensalidade + taxa{" "}
            {CONTA_COOP_DESCONTO_SPLIT.appPercent}% Conta Coop do app).
          </p>
        </div>
      </div>

      {valorFixoSalvo > 0 && !editando && (
        <AlertBanner variant="success" className="mb-4" title="Mensalidade fixa em vigor">
          <strong>{formatCurrency(valorFixoSalvo)}</strong> · vencimento dia {diaFixoSalvo}
          {mesesFixosSalvos.length > 0 && (
            <> · {mesesFixosSalvos.length} mês(es) de cobrança configurado(s)</>
          )}
          . Só muda quando você salvar uma nova configuração abaixo.
        </AlertBanner>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField
          label="Valor fixo (R$)"
          required
          hint={`Padrão HB: R$ ${MENSALIDADE_COOPERADO_VALOR_PADRAO.toFixed(2).replace(".", ",")} (inclui ${CONTA_COOP_DESCONTO_SPLIT.appPercent}% Conta Coop)`}
        >
          <Input
            type="number"
            step="0.01"
            min={0}
            value={valorPadrao}
            onChange={(e) => {
              marcarEditando();
              setValorPadrao(e.target.value);
            }}
            disabled={!canEdit}
            placeholder={MENSALIDADE_COOPERADO_VALOR_PADRAO.toFixed(2).replace(".", ",")}
          />
        </FormField>
        <FormField label="Dia da mensalidade (vencimento)" required hint="Dia do mês em que vence (1 a 28)">
          <Input
            type="number"
            min={1}
            max={28}
            value={diaVencimento}
            onChange={(e) => {
              marcarEditando();
              setDiaVencimento(e.target.value);
            }}
            disabled={!canEdit}
          />
        </FormField>
      </div>

      <div className="mt-5">
        <div className="flex items-center gap-2 mb-2">
          <Calendar size={16} className="text-gray-500" />
          <p className="text-sm font-semibold text-gray-900">Meses que serão cobrados</p>
          {mesesMarcados.length > 0 && (
            <span className="text-[10px] font-medium text-green-800 bg-green-100 px-2 py-0.5 rounded-full">
              {mesesMarcados.length} marcado(s)
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 mb-3">
          Toque para marcar ou desmarcar. Depois clique em <strong>Salvar configuração</strong>.
        </p>

        {canEdit && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            <Button type="button" size="sm" variant="secondary" onClick={() => marcarGrupo("passado")}>
              + Retroativos
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => marcarGrupo("atual")}>
              Atual
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => marcarGrupo("futuro")}>
              + Futuros
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => marcarGrupo("todos")}>
              Todos
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setMesesMarcados([])}>
              Limpar
            </Button>
          </div>
        )}

        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-1">
          {mesesOpcoes.map((mes) => {
            const tipo = classificarMesReferencia(mes, mesAtual);
            const ativo = mesesMarcados.includes(mes);
            return (
              <button
                key={mes}
                type="button"
                disabled={!canEdit}
                onClick={() => toggleMes(mes)}
                title={
                  tipo === "passado"
                    ? "Mês retroativo"
                    : tipo === "futuro"
                      ? "Mês futuro"
                      : "Mês atual"
                }
                aria-pressed={ativo}
                className={`min-h-[2rem] px-1 py-1 rounded-md border text-center text-[10px] sm:text-[11px] leading-tight font-semibold transition-colors ${
                  ativo
                    ? "border-green-600 bg-green-600 text-white shadow-sm"
                    : tipo === "atual"
                      ? "border-green-300 bg-green-50/80 text-green-900 hover:border-green-500"
                      : tipo === "passado"
                        ? "border-amber-200 bg-amber-50/50 text-amber-900 hover:border-amber-400"
                        : "border-sky-200 bg-sky-50/50 text-sky-900 hover:border-sky-400"
                } ${!canEdit ? "opacity-70 cursor-default" : "cursor-pointer"}`}
              >
                {formatMesReferenciaCurto(mes)}
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

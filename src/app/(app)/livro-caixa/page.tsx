"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, TrendingUp, TrendingDown, Wallet, Send } from "lucide-react";
import { useAppData } from "@/hooks/useAppData";
import { usePermissions } from "@/hooks/usePermissions";
import { getUserCooperativaId } from "@/utils/cooperativa";
import { PageHeader, Modal } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea, FormField } from "@/components/ui/Form";
import { Card } from "@/components/ui/Card";
import { updateData, addAuditEntry, getData } from "@/services/dataStore";
import { resolveCooperativaCnpj } from "@/services/notaPedidoCloudService";
import { pushOperacionalToCloud } from "@/services/cooperativaSyncCloudService";
import {
  criarLancamentoManual,
  mesesLivroCaixa,
  resumoLivroCaixa,
  resumoLivroCaixaGeral,
} from "@/services/livroCaixaService";
import { formatCurrency, formatDate, formatMesReferencia, getCurrentMesReferencia } from "@/utils/format";
import type { LivroCaixaOrigem, LivroCaixaTipo } from "@/types";

const ORIGEM_LABELS: Record<LivroCaixaOrigem, string> = {
  manual: "Manual",
  mensalidade: "Mensalidade",
  pagamento_cooperado: "Pagamento cooperado",
  credito_avulso: "Crédito avulso",
  debito_avulso: "Débito avulso",
  pnae: "PNAE / contrato",
  prestacao_contas: "Prestação de contas",
  outro: "Outro",
};

export default function LivroCaixaPage() {
  const data = useAppData();
  const { check, user } = usePermissions();
  const router = useRouter();
  const coopId = user && data ? getUserCooperativaId(user, data) : undefined;
  const [mes, setMes] = useState(getCurrentMesReferencia());
  const [modalOpen, setModalOpen] = useState(false);
  const [tipo, setTipo] = useState<LivroCaixaTipo>("credito");
  const [valor, setValor] = useState("");
  const [historico, setHistorico] = useState("");
  const [dataLanc, setDataLanc] = useState(new Date().toISOString().split("T")[0]);
  const [origem, setOrigem] = useState<LivroCaixaOrigem>("credito_avulso");
  const [publicando, setPublicando] = useState(false);

  useEffect(() => {
    if (user && !check("livro_caixa", "view")) router.replace("/dashboard");
  }, [user, router, check]);

  const meses = useMemo(() => (data && coopId ? mesesLivroCaixa(data, coopId) : [getCurrentMesReferencia()]), [data, coopId]);
  const resumoMes = useMemo(
    () => (data && coopId ? resumoLivroCaixa(data, coopId, mes) : { saldo: 0, totalCreditos: 0, totalDebitos: 0, lancamentos: [] }),
    [data, coopId, mes]
  );
  const resumoGeral = useMemo(
    () => (data && coopId ? resumoLivroCaixaGeral(data, coopId) : { saldo: 0, totalCreditos: 0, totalDebitos: 0, lancamentos: [] }),
    [data, coopId]
  );

  if (!data || !user || !coopId) return null;

  const canEdit = check("livro_caixa", "create");

  const salvarLancamento = () => {
    const v = parseFloat(valor.replace(",", "."));
    if (!Number.isFinite(v) || v <= 0 || !historico.trim()) return;
    updateData((d) => {
      const next = criarLancamentoManual(d, coopId, tipo, v, historico, {
        data: dataLanc,
        origem,
        responsavel: user.name,
      });
      return addAuditEntry(next, {
        entityType: "financeiro",
        entityId: coopId,
        action: "criar",
        userId: user.id,
        userName: user.name,
        changes: `Livro caixa · ${tipo} ${formatCurrency(v)}`,
      });
    });
    setModalOpen(false);
    setValor("");
    setHistorico("");
  };

  const publicar = async () => {
    setPublicando(true);
    try {
      const d = getData();
      const cnpj = await resolveCooperativaCnpj(d, coopId, user);
      if (cnpj) await pushOperacionalToCloud(cnpj, d, coopId, { authoritative: true });
    } finally {
      setPublicando(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title="Livro caixa"
        subtitle="Movimentos automáticos e lançamentos avulsos da cooperativa"
        action={
          canEdit && (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => void publicar()} disabled={publicando}>
                <Send size={16} /> {publicando ? "Enviando…" : "Sincronizar"}
              </Button>
              <Button onClick={() => setModalOpen(true)}>
                <Plus size={16} /> Lançamento
              </Button>
            </div>
          )
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-800 text-white p-5 shadow-lg">
          <Wallet size={24} className="opacity-90 mb-2" />
          <p className="text-emerald-100 text-sm">Saldo geral</p>
          <p className="text-3xl font-bold mt-1">{formatCurrency(resumoGeral.saldo)}</p>
        </div>
        <div className="rounded-2xl border border-green-200 bg-green-50/80 p-5">
          <TrendingUp size={22} className="text-green-700 mb-2" />
          <p className="text-sm text-green-800">Entradas · {formatMesReferencia(mes)}</p>
          <p className="text-2xl font-bold text-green-900">{formatCurrency(resumoMes.totalCreditos)}</p>
        </div>
        <div className="rounded-2xl border border-red-200 bg-red-50/80 p-5">
          <TrendingDown size={22} className="text-red-700 mb-2" />
          <p className="text-sm text-red-800">Saídas · {formatMesReferencia(mes)}</p>
          <p className="text-2xl font-bold text-red-900">{formatCurrency(resumoMes.totalDebitos)}</p>
        </div>
      </div>

      <Card title={`Movimentos · ${formatMesReferencia(mes)}`}>
        <div className="mb-4">
          <Select value={mes} onChange={(e) => setMes(e.target.value)} className="max-w-xs">
            {meses.map((m) => (
              <option key={m} value={m}>{formatMesReferencia(m)}</option>
            ))}
          </Select>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Pagamentos a cooperados e mensalidades confirmadas entram automaticamente. Use lançamento avulso para créditos PNAE e outras entradas.
        </p>
        <div className="space-y-2">
          {resumoMes.lancamentos.map((l) => (
            <div
              key={l.id}
              className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-4 rounded-xl border ${
                l.tipo === "credito" ? "border-green-100 bg-green-50/40" : "border-red-100 bg-red-50/40"
              }`}
            >
              <div className="min-w-0">
                <p className="font-medium text-gray-900">{l.historico}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {formatDate(l.data)} · {ORIGEM_LABELS[l.origem]}
                  {l.responsavel ? ` · ${l.responsavel}` : ""}
                </p>
              </div>
              <p className={`text-lg font-bold shrink-0 ${l.tipo === "credito" ? "text-green-700" : "text-red-700"}`}>
                {l.tipo === "credito" ? "+" : "−"} {formatCurrency(l.valor)}
              </p>
            </div>
          ))}
          {resumoMes.lancamentos.length === 0 && (
            <p className="text-center text-gray-500 py-8">Nenhum lançamento neste mês.</p>
          )}
        </div>
        <div className="mt-4 pt-4 border-t flex justify-between text-sm font-semibold">
          <span>Saldo do mês</span>
          <span className={resumoMes.saldo >= 0 ? "text-green-700" : "text-red-700"}>{formatCurrency(resumoMes.saldo)}</span>
        </div>
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Novo lançamento" size="md">
        <div className="space-y-4">
          <FormField label="Tipo">
            <Select
              value={tipo}
              onChange={(e) => {
                const t = e.target.value as LivroCaixaTipo;
                setTipo(t);
                setOrigem(t === "credito" ? "credito_avulso" : "debito_avulso");
              }}
            >
              <option value="credito">Crédito (entrada)</option>
              <option value="debito">Débito (saída)</option>
            </Select>
          </FormField>
          <FormField label="Origem">
            <Select value={origem} onChange={(e) => setOrigem(e.target.value as LivroCaixaOrigem)}>
              {tipo === "credito" ? (
                <>
                  <option value="credito_avulso">Crédito avulso</option>
                  <option value="pnae">PNAE / contrato</option>
                  <option value="outro">Outro</option>
                </>
              ) : (
                <>
                  <option value="debito_avulso">Débito avulso</option>
                  <option value="outro">Outro</option>
                </>
              )}
            </Select>
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Valor (R$)" required>
              <Input type="number" step="0.01" min={0} value={valor} onChange={(e) => setValor(e.target.value)} />
            </FormField>
            <FormField label="Data">
              <Input type="date" value={dataLanc} onChange={(e) => setDataLanc(e.target.value)} />
            </FormField>
          </div>
          <FormField label="Histórico" required>
            <Textarea value={historico} onChange={(e) => setHistorico(e.target.value)} rows={3} placeholder="Ex: Repasse PNAE contrato escola X" />
          </FormField>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
          <Button onClick={salvarLancamento}>Salvar</Button>
        </div>
      </Modal>
    </div>
  );
}

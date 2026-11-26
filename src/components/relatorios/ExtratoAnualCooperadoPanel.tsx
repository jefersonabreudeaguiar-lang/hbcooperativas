"use client";

import { useMemo, useState } from "react";
import type { AppData, UserRole } from "@/types";
import { Button } from "@/components/ui/Button";
import { FormField, Input, Select } from "@/components/ui/Form";
import { Card } from "@/components/ui/Card";
import { secureApiFetch } from "@/lib/security/clientSession";
import { montarExtratosAnuais, resumoExtratoAnual, type ExtratoAnualCooperado } from "@/services/extratoAnualCooperado";
import { dataIsoCooperativa, formatCurrency } from "@/utils/format";
import { extratosAnuaisHtml } from "@/utils/extratoAnualHtml";

export function ExtratoAnualCooperadoPanel({ data, coopId, role, podeExportar, voltar }: {
  data: AppData; coopId: string; role: UserRole; podeExportar: boolean; voltar: () => void;
}) {
  const hoje = dataIsoCooperativa();
  const anoAtual = Number(hoje.slice(0, 4));
  const [anoTexto, setAnoTexto] = useState(String(anoAtual));
  const [membro, setMembro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const ano = Number(anoTexto);
  const anoValido = Number.isInteger(ano) && ano >= 2000 && ano <= anoAtual;
  const ate = ano === anoAtual ? hoje : `${ano}-12-31`;
  const cooperativa = data.cooperativas.find(c => c.id === coopId);
  const extratos = useMemo(() => anoValido ? montarExtratosAnuais(
    data.cooperados.filter(c => c.cooperativaId === coopId),
    data.notasPedido.filter(n => n.cooperativaId === coopId),
    data.instituicoes, ano, ate
  ) : [], [data, coopId, ano, anoValido, ate]);
  const selecionado = extratos.find(e => e.cooperadoId === membro);
  const resumo = selecionado && resumoExtratoAnual(selecionado);

  function imprimir(colecao: ExtratoAnualCooperado[]) {
    const popup = window.open("", "_blank");
    if (!popup) {
      setMensagem("Permita a abertura de uma nova janela para imprimir.");
      return;
    }
    popup.document.write(extratosAnuaisHtml(colecao, cooperativa?.nome ?? "Cooperativa", true));
    popup.document.close();
  }

  async function enviarTodos() {
    if (!anoValido || !cooperativa || enviando) return;
    if (!window.confirm(`Publicar os extratos de ${ano} para os cooperados ativos? Cada pessoa verá apenas o próprio relatório.`)) return;
    setEnviando(true);
    setMensagem("");
    try {
      const resposta = await secureApiFetch("/api/extratos-anuais", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cnpj: cooperativa.cnpj, ano }),
      });
      const resultado = await resposta.json();
      if (!resposta.ok) throw new Error(resultado.error);
      setMensagem(`Extratos publicados para ${resultado.publicados} cooperado(s).`);
    } catch (erro) {
      setMensagem(erro instanceof Error ? erro.message : "Falha ao publicar os extratos.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-4">
      <Button type="button" variant="secondary" onClick={voltar}>Voltar a Relatórios</Button>
      <Card title="Extrato anual por cooperado">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Ano"><Input type="number" value={anoTexto} min={2000} max={anoAtual} onChange={e => setAnoTexto(e.target.value)} /></FormField>
          <FormField label="Cooperado">
            <Select value={membro} onChange={e => setMembro(e.target.value)}>
              <option value="">Selecione um cooperado</option>
              {extratos.map(e => <option key={e.cooperadoId} value={e.cooperadoId}>{e.nome}</option>)}
            </Select>
          </FormField>
        </div>
        {selecionado && resumo && <p className="mt-4 text-sm">
          {selecionado.entregas.length} entrega(s) registradas · Bruto {formatCurrency(resumo.bruto)} ·
          Descontos {formatCurrency(resumo.descontos)} · Líquido {formatCurrency(resumo.liquido)}
        </p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" disabled={!podeExportar || !selecionado} onClick={() => selecionado && imprimir([selecionado])}>Imprimir selecionado</Button>
          <Button type="button" variant="secondary" disabled={!podeExportar || !extratos.length} onClick={() => imprimir(extratos)}>Imprimir todos</Button>
          {podeExportar && ["admin", "responsavel", "tesoureiro"].includes(role) && (
            <Button type="button" variant="secondary" disabled={!extratos.length || enviando} onClick={() => void enviarTodos()}>
              {enviando ? "Publicando…" : "Enviar para todos"}
            </Button>
          )}
        </div>
        {mensagem && <p role="status" className="mt-3 text-sm">{mensagem}</p>}
      </Card>
    </div>
  );
}

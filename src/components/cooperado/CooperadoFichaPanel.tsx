"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Wallet, FileText, Camera, CreditCard, FileDown, PenLine } from "lucide-react";
import { useAppData } from "@/hooks/useAppData";
import { usePermissions } from "@/hooks/usePermissions";
import { Card } from "@/components/ui/Card";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { NotaStatusBadge } from "@/components/ui/NotaStatusBadge";
import { Button } from "@/components/ui/Button";
import { Select, FormField } from "@/components/ui/Form";
import {
  getResumoPagamentoExibicao,
  getStatusCotaCooperado,
  getMensalidadeFixaMes,
  getArquivoMensalCooperado,
  getAjustesCompartilhadosFichaMes,
  listarFichasExtratoCooperadoMes,
  agregarItensFichaMes,
} from "@/services/notaPedidoService";
import { ResumoDescontosMes } from "@/components/ficha/ResumoDescontosMes";
import { ValoresAvulsosReceberPanel } from "@/components/ficha/ValoresAvulsosReceberPanel";
import { fichaPertenceCooperado, notaPertenceCooperado, pagamentoCooperadoPertenceCooperado, pushCooperadoToCloud } from "@/services/cooperadoCloudService";
import { mensalidadePertenceCooperado } from "@/services/mensalidadeService";
import { updateData, addAuditEntry } from "@/services/dataStore";
import { getUserCooperativaId, normalizeCnpj } from "@/utils/cooperativa";
import { formatCurrency, formatDate, formatMesReferencia, formatCPFCNPJ, formatPhone, getCurrentMesReferencia } from "@/utils/format";
import { baixarRecibo, nomeArquivoRecibo } from "@/utils/recibo";
import type { Cooperado } from "@/types";

function getEscolaLabel(nota: { instituicaoId: string; escolaAvulsaNome?: string }, instituicoes: { id: string; nome: string }[]) {
  if (nota.escolaAvulsaNome?.trim()) return nota.escolaAvulsaNome.trim();
  return instituicoes.find((i) => i.id === nota.instituicaoId)?.nome ?? "—";
}

export function CooperadoFichaPanel({ cooperado }: { cooperado: Cooperado }) {
  const data = useAppData();
  const { check, user } = usePermissions();
  const podeEditar = check("cooperados", "edit");
  const [mesFilter, setMesFilter] = useState(getCurrentMesReferencia());
  const [salvandoDiretoria, setSalvandoDiretoria] = useState(false);

  const toggleMembroDiretoria = async (marcado: boolean) => {
    if (!user || !data || salvandoDiretoria) return;
    setSalvandoDiretoria(true);
    const now = new Date().toISOString();
    let saved: Cooperado | null = null;
    updateData((d) => {
      const idx = d.cooperados.findIndex((c) => c.id === cooperado.id);
      if (idx < 0) return d;
      const atualizado: Cooperado = {
        ...d.cooperados[idx],
        membroDiretoria: marcado,
        updatedAt: now,
      };
      saved = atualizado;
      let next = {
        ...d,
        cooperados: d.cooperados.map((c) => (c.id === cooperado.id ? atualizado : c)),
      };
      next = addAuditEntry(next, {
        entityType: "cooperado",
        entityId: cooperado.id,
        action: "editar",
        userId: user.id,
        userName: user.name,
        changes: marcado ? "Marcado como membro da diretoria" : "Removido da diretoria",
      });
      return next;
    });
    if (saved) {
      const coopId = getUserCooperativaId(user, data);
      const coop = data.cooperativas.find((c) => c.id === coopId);
      const cnpj = normalizeCnpj(coop?.cnpj ?? user.cooperativaCnpj ?? "");
      if (cnpj.length === 14) {
        const push = await pushCooperadoToCloud(cnpj, saved);
        if (!push.ok) {
          window.alert(push.error ?? "Alteração salva localmente, mas não sincronizou na nuvem.");
        }
      }
    }
    setSalvandoDiretoria(false);
  };

  const resumo = useMemo(() => {
    if (!data) return null;
    const notas = data.notasPedido.filter((n) => notaPertenceCooperado(data, n, cooperado.id, cooperado.cooperativaId));
    const ficha = data.fichaCorrida.filter((f) => fichaPertenceCooperado(data, f, cooperado.id, cooperado.cooperativaId));
    const mensalidades = data.mensalidades.filter((m) =>
      mensalidadePertenceCooperado(data, m, cooperado.id, cooperado.cooperativaId)
    );
    const pagamentos = data.pagamentosCooperado.filter((p) =>
      pagamentoCooperadoPertenceCooperado(data, p, cooperado.id, cooperado.cooperativaId)
    );
    const meses = [...new Set([...notas.map((n) => n.mesReferencia), ...ficha.map((f) => f.mesReferencia), getCurrentMesReferencia()])].sort().reverse();
    return { notas, ficha, mensalidades, pagamentos, meses };
  }, [data, cooperado.id]);

  const mesNotas = useMemo(
    () => resumo?.notas.filter((n) => n.mesReferencia === mesFilter) ?? [],
    [resumo, mesFilter]
  );
  const mesFicha = useMemo(
    () =>
      data
        ? listarFichasExtratoCooperadoMes(data, cooperado.id, mesFilter, cooperado.cooperativaId)
        : [],
    [data, cooperado.id, cooperado.cooperativaId, mesFilter]
  );
  const resumoItensMes = useMemo(() => {
    if (!data) return { itens: [], entregas: 0, valorBruto: 0 };
    return agregarItensFichaMes(data, cooperado.id, mesFilter, cooperado.cooperativaId);
  }, [data, cooperado.id, cooperado.cooperativaId, mesFilter]);
  const pagamentosMes = useMemo(
    () => resumo?.pagamentos.filter((p) => p.mesReferencia === mesFilter) ?? [],
    [resumo, mesFilter]
  );
  const pagamentoConfirmadoMes = pagamentosMes.find((p) => p.status === "confirmado");

  const mesMensalidades = useMemo(
    () => resumo?.mensalidades.filter((m) => m.mesReferencia === mesFilter) ?? [],
    [resumo, mesFilter]
  );

  if (!data || !resumo) return <PageSkeleton compact />;

  const resumoPagamento = getResumoPagamentoExibicao(
    data,
    cooperado.id,
    mesFilter,
    cooperado.cooperativaId
  );
  const totalPendente = resumoPagamento.valorLiquido;
  const arquivo = getArquivoMensalCooperado(data, cooperado.id, mesFilter, cooperado.cooperativaId);
  const ajustesCompartilhados = getAjustesCompartilhadosFichaMes(
    data,
    cooperado.cooperativaId,
    mesFilter
  );
  const statusCota = getStatusCotaCooperado(data, cooperado.id, mesFilter);
  const mensalidadeMes = getMensalidadeFixaMes(data, cooperado.id, mesFilter, cooperado.cooperativaId);
  const descontoAvulsoMes =
    arquivo?.descontoAvulso ?? ajustesCompartilhados?.descontoAvulso ?? 0;
  const descontoAvulsoMotivoMes =
    arquivo?.descontoAvulsoMotivo ?? ajustesCompartilhados?.descontoAvulsoMotivo;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-green-700 text-white rounded-2xl p-5 sm:col-span-3">
          <p className="text-green-100 text-sm">A receber · {formatMesReferencia(mesFilter)}</p>
          <p className="text-3xl font-bold mt-1">{formatCurrency(totalPendente)}</p>
          {(resumoPagamento.valorBruto > 0 || totalPendente > 0) && (
            <ResumoDescontosMes
              valorBruto={resumoPagamento.valorBruto}
              descontoCooperativa={resumoPagamento.descontoCooperativa}
              descontoPadraoPct={data.config.descontoPadraoCooperativa}
              valorEntregas={resumoPagamento.valorEntregas}
              descontosExtras={resumoPagamento.descontosExtras}
              totalLiquido={totalPendente}
              rotuloTotal="Total a receber"
              tema="escuro"
            />
          )}
        </div>
        <div className="bg-white border rounded-2xl p-5">
          <p className="text-gray-500 text-sm">Entregas no mês</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{mesNotas.length}</p>
        </div>
        <div className="bg-white border rounded-2xl p-5">
          <p className="text-gray-500 text-sm">Mensalidades no mês</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{mesMensalidades.length}</p>
        </div>
      </div>

      <FormField label="Mês">
        <Select value={mesFilter} onChange={(e) => setMesFilter(e.target.value)} className="max-w-xs">
          {resumo.meses.map((m) => (
            <option key={m} value={m}>{formatMesReferencia(m)}</option>
          ))}
        </Select>
      </FormField>

      <Card title="Dados do cooperado">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {statusCota === "paga" ? (
            <span className="text-xs font-medium text-green-700 bg-green-50 px-2 py-1 rounded-full">Cota paga</span>
          ) : (
            <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-1 rounded-full border border-red-200">Cota não paga</span>
          )}
          {cooperado.membroDiretoria ? (
            <span className="text-xs font-medium text-purple-700 bg-purple-100 px-2 py-1 rounded-full">Diretoria</span>
          ) : null}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div><span className="text-gray-500">CPF/CNPJ:</span> {cooperado.cpfCnpj ? formatCPFCNPJ(cooperado.cpfCnpj) : "—"}</div>
          <div><span className="text-gray-500">Telefone:</span> {formatPhone(cooperado.telefone) || "—"}</div>
          <div><span className="text-gray-500">PIX:</span> {cooperado.chavePix || "—"}</div>
          <div><span className="text-gray-500">Comunidade:</span> {cooperado.comunidade || "—"}</div>
          <div className="flex items-center gap-2"><span className="text-gray-500">Status:</span> <StatusBadge status={cooperado.status} /></div>
          {cooperado.avulso && <div className="text-amber-700 text-xs font-medium">Cooperado avulso (sem app)</div>}
        </div>

        {podeEditar && (
          <label className="mt-4 flex items-start gap-3 p-3 border border-purple-200 bg-purple-50/60 rounded-xl cursor-pointer hover:bg-purple-50">
            <input
              type="checkbox"
              checked={Boolean(cooperado.membroDiretoria)}
              disabled={salvandoDiretoria}
              onChange={(e) => toggleMembroDiretoria(e.target.checked)}
              className="mt-1 rounded border-gray-300 text-purple-700 focus:ring-purple-500"
            />
            <span>
              <span className="block text-sm font-semibold text-gray-900">Membro da diretoria</span>
              <span className="block text-xs text-gray-600 mt-0.5">
                Marque se este cooperado faz parte da diretoria. Ele poderá votar em pautas restritas e receber avisos exclusivos.
              </span>
            </span>
          </label>
        )}

        <div className="flex flex-wrap gap-2 mt-4">
          <Link href={`/ficha-corrida?cooperado=${cooperado.id}&mes=${mesFilter}`}>
            <Button variant="secondary" size="sm"><Wallet size={16} /> Ficha corrida / pagar</Button>
          </Link>
          <Link href={`/notas-pedido?cooperado=${cooperado.id}`}>
            <Button variant="secondary" size="sm"><FileText size={16} /> Entregas</Button>
          </Link>
        </div>
      </Card>

      <ValoresAvulsosReceberPanel
        cooperadoId={cooperado.id}
        cooperativaId={cooperado.cooperativaId}
        mesReferencia={mesFilter}
        modo="responsavel"
      />

      <Card title="Entregas e notas">
        {mesNotas.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhuma entrega neste mês.</p>
        ) : (
          <div className="space-y-3">
            {mesNotas.map((n) => (
              <div key={n.id} className="flex gap-3 p-3 border rounded-xl">
                {n.fotoPedido ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={n.fotoPedido} alt="" className="w-16 h-16 rounded-lg object-cover shrink-0" />
                ) : (
                  <div className="w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                    <Camera size={20} className="text-gray-400" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-sm">{n.numeroNota}</span>
                    <NotaStatusBadge status={n.status} />
                  </div>
                  <p className="text-xs text-gray-600 mt-1">{getEscolaLabel(n, data.instituicoes)} · {formatDate(n.dataEntrega)}</p>
                  {n.valorLiquido > 0 && <p className="text-sm font-semibold text-green-700 mt-1">{formatCurrency(n.valorLiquido)}</p>}
                  {(n.itens ?? []).length > 0 && (
                    <ul className="text-xs text-gray-500 mt-2 space-y-0.5">
                      {n.itens.map((i) => (
                        <li key={i.produtoInstituicaoId}>{i.produtoNome} · {i.quantidade} {i.unidade} · {formatCurrency(i.valorBruto)}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title={`Ficha corrida · ${formatMesReferencia(mesFilter)}`}>
        {mensalidadeMes > 0 && (
          <p className="text-sm text-gray-600 mb-3">Mensalidade do mês: <strong>{formatCurrency(mensalidadeMes)}</strong></p>
        )}
        {(descontoAvulsoMes ?? 0) > 0 && (
          <p className="text-sm text-red-600 mb-3">
            {descontoAvulsoMotivoMes?.trim() || "Desconto avulso"}: - {formatCurrency(descontoAvulsoMes!)}
          </p>
        )}
        {resumoItensMes.itens.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhuma entrega conferida neste mês.</p>
        ) : (
          <div>
            <p className="text-sm text-gray-600 mb-3">
              {resumoItensMes.entregas} entrega{resumoItensMes.entregas !== 1 ? "s" : ""} · totais por item
            </p>
            <div className="border rounded-xl overflow-hidden text-sm">
              <table className="w-full">
                <thead className="bg-green-700 text-white">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold">Item</th>
                    <th className="text-right px-3 py-2 font-semibold">Qtd</th>
                    <th className="text-right px-3 py-2 font-semibold">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {resumoItensMes.itens.map((i) => (
                    <tr key={i.produtoInstituicaoId}>
                      <td className="px-3 py-2 font-medium">{i.produtoNome}</td>
                      <td className="px-3 py-2 text-right">{i.quantidade} {i.unidade}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(i.valorBruto)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 border-t">
                  <tr>
                    <td className="px-3 py-2 font-semibold" colSpan={2}>Total bruto</td>
                    <td className="px-3 py-2 text-right font-bold">{formatCurrency(resumoItensMes.valorBruto)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {mesFicha.some((f) => f.status === "pendente") && (
              <p className="text-sm text-amber-700 mt-3">Aguardando pagamento da cooperativa.</p>
            )}
            {mesFicha.length > 0 && mesFicha.every((f) => f.status === "pago") && (
              <p className="text-sm text-green-700 mt-3">Pagamento registrado neste mês.</p>
            )}
          </div>
        )}
      </Card>

      <Card title="Mensalidades">
        {mesMensalidades.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhuma mensalidade neste mês.</p>
        ) : (
          <div className="space-y-2">
            {mesMensalidades.map((m) => (
              <div key={m.id} className="flex justify-between items-center p-3 border rounded-xl text-sm">
                <div>
                  <p className="font-medium">{formatCurrency(m.valor)}</p>
                  <p className="text-xs text-gray-500">Vence {formatDate(m.vencimento)}</p>
                </div>
                <StatusBadge status={m.status} />
              </div>
            ))}
          </div>
        )}
      </Card>

      {arquivo && arquivo.notaPedidoIds.length > 0 && (
        <Card title={`Arquivo de fotos · ${formatMesReferencia(mesFilter)}`}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {arquivo.notaPedidoIds.map((nid) => {
              const nota = data.notasPedido.find((n) => n.id === nid);
              if (!nota?.fotoPedido) return null;
              return (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={nid} src={nota.fotoPedido} alt="" className="w-full h-24 object-cover rounded-lg border" />
              );
            })}
          </div>
        </Card>
      )}

      {pagamentoConfirmadoMes && (
        <Card title={`Recibo assinado · ${formatMesReferencia(mesFilter)}`}>
          <div className="flex flex-col sm:flex-row gap-4 sm:items-start">
            <div className="flex-1">
              <p className="text-sm text-gray-600 mb-2">
                Confirmado em {pagamentoConfirmadoMes.assinadoEm ? formatDate(pagamentoConfirmadoMes.assinadoEm.split("T")[0]) : formatDate(pagamentoConfirmadoMes.pagoEm.split("T")[0])}
                {" · "}{formatCurrency(pagamentoConfirmadoMes.valorLiquido)}
              </p>
              {pagamentoConfirmadoMes.assinaturaCooperado && (
                <div className="inline-block border border-gray-200 rounded-xl p-2 bg-gray-50">
                  <p className="text-xs text-gray-500 mb-1 flex items-center gap-1"><PenLine size={12} /> Assinatura do cooperado</p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={pagamentoConfirmadoMes.assinaturaCooperado}
                    alt="Assinatura"
                    className="h-14 object-contain"
                  />
                </div>
              )}
            </div>
            {pagamentoConfirmadoMes.reciboHtml && (
              <Button
                size="lg"
                className="shrink-0"
                onClick={() =>
                  void baixarRecibo(
                    pagamentoConfirmadoMes.reciboHtml!,
                    nomeArquivoRecibo(mesFilter, cooperado.nomeCompleto)
                  )
                }
              >
                <FileDown size={18} /> Baixar recibo
              </Button>
            )}
          </div>
        </Card>
      )}

      {pagamentosMes.length > 0 && (
        <Card title="Pagamentos registrados">
          {pagamentosMes.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 p-3 border rounded-xl text-sm mb-2 last:mb-0">
              <div className="flex items-center gap-2 min-w-0">
                <CreditCard size={18} className="text-green-600 shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium">{formatCurrency(p.valorLiquido)}</p>
                  <p className="text-xs text-gray-500 truncate">
                    {p.status === "confirmado" ? "Confirmado com assinatura" : "Aguardando confirmação do cooperado"}
                    {" · "}{formatDate(p.pagoEm.split("T")[0])}
                  </p>
                </div>
              </div>
              {p.status === "confirmado" && p.reciboHtml && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void baixarRecibo(p.reciboHtml!, nomeArquivoRecibo(p.mesReferencia, cooperado.nomeCompleto))}
                >
                  <FileDown size={14} /> Recibo
                </Button>
              )}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

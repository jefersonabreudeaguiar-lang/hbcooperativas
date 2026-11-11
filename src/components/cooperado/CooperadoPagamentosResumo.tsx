import type { CooperadoFinanceiroRemoto } from '@/lib/cooperado/cooperadoFinanceiroRemotoTypes';
import { formatCurrency, formatDate, formatMesReferencia } from '@/utils/format';
import { ChevronDown, Package } from 'lucide-react';

export function CooperadoItensEntregues({ financeiro }: { financeiro: CooperadoFinanceiroRemoto }) {
  return financeiro.entregasPorMes?.map(({ mes, itens }, mesIndex) => {
    const totais = new Map<string, { produtoNome: string; unidade: string; quantidade: number }>();
    for (const item of itens) {
      const produtoNome = item.produtoNome.trim();
      const unidade = item.unidade.trim().toLowerCase();
      const chave = JSON.stringify([produtoNome.toLocaleLowerCase('pt-BR'), unidade]);
      const total = totais.get(chave);
      if (total) total.quantidade += item.quantidade;
      else totais.set(chave, { produtoNome, unidade, quantidade: item.quantidade });
    }
    return (
      <details key={mes} open={mesIndex === 0 ? true : undefined} className="group overflow-hidden rounded-2xl border border-green-200 bg-white">
        <summary className="flex cursor-pointer list-none items-center gap-3 bg-green-50 px-4 py-3 text-green-900 focus-visible:outline focus-visible:-outline-offset-2 focus-visible:outline-green-700 [&::-webkit-details-marker]:hidden">
          <Package size={20} aria-hidden="true" className="shrink-0" />
          <span className="flex-1">
            <span className="block font-semibold">Total de itens entregues</span>
            <span className="block text-xs text-green-800">{formatMesReferencia(mes)}</span>
          </span>
          <ChevronDown size={18} aria-hidden="true" className="shrink-0 group-open:rotate-180" />
        </summary>
        <p className="border-t border-green-100 px-4 pt-3 text-xs text-gray-600">Inclui entregas conferidas em aberto e já pagas.</p>
        <ul className="divide-y divide-gray-100 px-4 pb-2 text-sm">
          {[...totais].map(([chave, item]) => (
            <li key={chave} className="flex justify-between gap-3 py-2">
              <span className="min-w-0 break-words text-gray-900">{item.produtoNome}</span>
              <span className="shrink-0 rounded-lg bg-green-50 px-2 py-0.5 font-semibold tabular-nums text-green-900">{item.quantidade.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} {item.unidade}</span>
            </li>
          ))}
        </ul>
      </details>
    );
  });
}

export function CooperadoPagamentosResumo({ financeiro, mostrarItens = true }: {
  financeiro: CooperadoFinanceiroRemoto;
  mostrarItens?: boolean;
}) {
  const history = financeiro.historicoPagamentos;
  if (!history) return null;
  const latest = history.pagamentos[0];
  return <section aria-label="Saldo e pagamentos confirmados" className="mb-6 space-y-4">
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-2xl border border-green-200 bg-green-50 p-4">
        <p className="text-sm text-green-900">A receber agora</p>
        <p className="mt-1 text-2xl font-bold text-green-900">{formatCurrency(financeiro.paridade.valorLiquido)}</p>
        <p className="mt-1 text-xs text-green-800">{financeiro.paridade.valorLiquido > 0 ? 'Saldo ainda pendente de pagamento' : 'Nenhum valor pendente nesta leitura'}</p>
      </div>
      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <p className="text-sm text-gray-600">Último pagamento</p>
        <p className="mt-1 text-2xl font-bold text-gray-900">{latest ? formatCurrency(latest.valorRecebido) : '—'}</p>
        <p className="mt-1 text-xs text-gray-600">{latest ? `Pago em ${formatDate(latest.pagoEm)}` : 'Nenhum pagamento confirmado'}</p>
      </div>
      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <p className="text-sm text-gray-600">Recebido no histórico</p>
        <p className="mt-1 text-2xl font-bold text-gray-900">{formatCurrency(history.totalRecebido)}</p>
        <p className="mt-1 text-xs text-gray-600">Soma dos pagamentos confirmados</p>
      </div>
    </div>
    {mostrarItens && <CooperadoItensEntregues financeiro={financeiro} />}
    <details open={financeiro.paridade.valorLiquido <= 0} className="rounded-2xl border border-gray-200 bg-white p-4">
      <summary className="cursor-pointer font-semibold text-gray-900">Histórico de pagamentos ({history.pagamentos.length})</summary>
      <p className="my-3 text-sm text-gray-600">Estes valores já foram pagos. Novas entregas entram em A receber agora.</p>
      {history.pagamentos.length === 0 ? <p className="text-sm text-gray-600">Ainda não há pagamentos confirmados.</p> :
        <ul className="divide-y divide-gray-100">{history.pagamentos.map(p => <li key={p.id} className="py-3">
          <details>
            <summary className="cursor-pointer text-sm text-gray-800">
              {p.meses.map(formatMesReferencia).join(' / ')} · <strong>{formatCurrency(p.valorRecebido)}</strong> · pago em {formatDate(p.pagoEm)}
            </summary>
            <dl className="mt-3 space-y-1 text-sm text-gray-700">
              <div className="flex justify-between gap-3"><dt>Valor bruto</dt><dd>{formatCurrency(p.valorBruto)}</dd></div>
              <div className="flex justify-between gap-3"><dt>Desconto da cooperativa</dt><dd>{formatCurrency(p.descontoCooperativa)}</dd></div>
              {p.descontos.map((d, i) => <div key={`${d.descricao}-${i}`} className="flex justify-between gap-3"><dt>{d.descricao}</dt><dd>{formatCurrency(d.valor)}</dd></div>)}
              <div className="flex justify-between gap-3 font-semibold"><dt>Total recebido</dt><dd>{formatCurrency(p.valorRecebido)}</dd></div>
            </dl>
          </details>
        </li>)}</ul>}
    </details>
  </section>;
}

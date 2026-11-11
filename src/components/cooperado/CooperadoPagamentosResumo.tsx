import type { CooperadoFinanceiroRemoto } from '@/lib/cooperado/cooperadoFinanceiroRemotoTypes';
import { formatCurrency, formatDate, formatMesReferencia } from '@/utils/format';

export function CooperadoPagamentosResumo({ financeiro }: { financeiro: CooperadoFinanceiroRemoto }) {
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
    {financeiro.entregasPorMes?.map(({ mes, itens }, mesIndex) => (
      <details key={mes} open={mesIndex === 0 ? true : undefined} className="rounded-2xl border border-gray-200 bg-white p-4">
        <summary className="cursor-pointer font-semibold text-gray-900">Itens entregues · {formatMesReferencia(mes)}</summary>
        <p className="mt-2 text-xs text-gray-600">Inclui entregas conferidas em aberto e já pagas.</p>
        <ul className="mt-2 divide-y divide-gray-100 text-sm">
          {itens.map((item, index) => (
            <li key={index} className="flex justify-between gap-3 py-2">
              <span>{item.produtoNome}</span>
              <span className="shrink-0 font-semibold">{item.quantidade.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} {item.unidade}</span>
            </li>
          ))}
        </ul>
      </details>
    ))}
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

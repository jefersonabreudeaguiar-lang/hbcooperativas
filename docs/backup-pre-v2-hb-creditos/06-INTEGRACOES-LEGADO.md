# Integrações legado — impacto ao remover módulos

## Matriz dependência → HB Créditos

| Módulo removido na V2 | Impacto em HB Créditos | Mitigação |
|------------------------|-------------------------|-----------|
| Notas-pedido | Crédito base deixava de atualizar auto | Valor bruto manual |
| Ficha-corrida | Abatimento “a receber” some na UI cooperado | OK se V2 só HB |
| Livro caixa | Nenhum direto em pagamento QR | Remover menu |
| BIC / paridade início | Card valor a receber some | Remover dashboard |
| CooperativaSync pesado | Atraso ao abrir app | Sync leve só HB |
| Mensalidades/votações | Nenhum | Remover rotas |

## Código que referencia HB fora do módulo crédito

- `src/services/notaPedidoService.ts` — abatimento HB
- `src/app/(app)/ficha-corrida/FichaCorridaContent.tsx` — `HistoricoHbCreditosResumo`
- `src/app/(app)/dashboard/DashboardContent.tsx` — card HB
- `src/app/(app)/relatorios` — extrato HB contador

**Estratégia:** não deletar `HistoricoHbCreditosResumo` até V2 estável; primeiro esconder rotas.

## Parceiro mercado

Manter se cooperativas usam QR em mercado real. Rota `/mercado-parceiro`, `/api/credit/mercado`.

## Contador / admin plataforma

Fora do app “cooperado/responsável V2”; podem continuar no monólito ou URL separada `/admin`.

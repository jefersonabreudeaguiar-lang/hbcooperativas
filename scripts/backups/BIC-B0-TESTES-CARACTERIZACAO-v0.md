# BIC-B0 — Testes de caracterização (pré-facade B1)

**Objetivo:** definir comportamentos que a projeção B1 (`getProjecaoFinanceiraCooperadoBIC` ou equivalente) deve **reproduzir byte-a-byte em regras de negócio** (não necessariamente mesma implementação).

**Execução:** usar fixtures em memória (`AppData`) + casos Orlando documentados; scripts existentes como baseline:

- `scripts/test-cooperado-financeiro-guard.ts`
- `scripts/test-cooperado-operacional-pull-phase1.ts`
- `scripts/test-hb-pix-stale-phase24.ts` (HB — observação only no B1)

---

## 1. Cooperado sem pagamento

**Setup:** fichas pendentes, zero registros em `pagamentosCooperado` para o mês.  
**Esperado:** estado `a_receber`; valor = soma `getResumoValorAPagarRelatorio` / `getTotalAPagarCooperado`; sem card recibo; `aguardandoAssinatura === false`.

---

## 2. Pagamento aguardando confirmação

**Setup:** um `pagamentosCooperado` com `status: aguardando_confirmacao`, valor congelado.  
**Esperado:** estado `aguardando_assinatura`; `valorRecibo === pagamento.valorLiquido`; valor “a receber” adicional conforme `getValorQuantoVouReceber` (outros meses sem aguardando somam separado).

---

## 3. Pagamento confirmado

**Setup:** `status: confirmado`, fichas do escopo marcadas pagas, sem complementares.  
**Esperado:** `getResumoValorAPagarRelatorio` → `valorLiquido 0` para o mês; Início sem card a receber para esse mês.

---

## 4. Pagamento confirmado + recibo assinado

**Setup:** confirmado com assinatura preenchida; mesmo mês.  
**Esperado:** nenhum `getPagamentoAguardandoCooperado` visível; supersedido se existir aguardando legado no JSON.

---

## 5. Novo valor depois de pagamento (complemento)

**Setup:** confirmado parcial (ids escopo) + nova nota conferida pós-PIX (`fichasPendentesComplementaresPosPagamento` não vazio).  
**Esperado:** valor aberto > 0 só do complemento; registro confirmado intacto; card a receber reflete complemento.

---

## 6. Múltiplas notas

**Setup:** mesmo mês, várias notas conferidas, divisão entre cooperados.  
**Esperado:** resumo agrega `fichaIds`/`notaPedidoIds` corretos; pagamento parcial cobre subconjunto.

---

## 7. Múltiplas fotos

**Setup:** nota com N fotos conferidas sequencialmente.  
**Esperado:** projeção financeira independe de contagem de fotos após conferência; valor vem da ficha.

---

## 8. Múltiplos meses

**Setup:** débito em M1 e M2; pagamento aguardando só M1.  
**Esperado:** rótulo multi-mês; valor consolidado conforme `getValorQuantoVouReceber` (não double-count M1).

---

## 9. HB existente

**Setup:** desconto conta coop / transação HB abatendo ficha no mês.  
**Esperado B1:** mesma leitura que `getResumoPagamentoCooperado` + abate HB (sem alterar HB tables); documentar delta se UI HB mostrar valor diferente.

---

## 10. Cooperado com histórico antigo

**Setup:** meses antigos confirmados + mês atual pendente.  
**Esperado:** projeção foca mês(es) abertos; histórico confirmado não reabre saldo.

---

## 11. Dados sincronizados

**Setup:** simular pós-`mergePagamentosCooperadoFromCloud` / pull phase1 com pagamento só na nuvem antes do merge.  
**Esperado:** após hydrated, cards iguais a responsável; durante sync `carregando` se flags ativas.

---

## 12. Dados potencialmente stale

**Setup:** `aguardando_confirmacao` no local + `confirmado` na nuvem mesmo mês (Orlando).  
**Esperado:** `pagamentoAguardandoSupersedidoPorConfirmado` → sem card recibo stale; `mesesReferenciaComDebitoAberto` não trata mês quitado como aberto por aguardando fantasma.

---

## Critério de sucesso B1

Para cada caso, registrar:

- `estado` UI (`EstadoQuantoVouReceberCooperado`)
- `valorDestaque`, `valorRecibo`, `valorAberto`
- presença/ausência cards Início (dashboard)

**Não** persistir “correções” durante testes — apenas assert sobre projeção.

---

*Lista definida em B0; implementação de testes automatizados da facade é escopo B1.*

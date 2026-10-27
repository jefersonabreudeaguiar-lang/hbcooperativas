# V2 HB — paridade responsável × cooperado

**Produção:** https://hbcooperativas.vercel.app · flag `NEXT_PUBLIC_V2_HB_ONLY=1`  
**Núcleo de cálculo:** `src/lib/hb-credit/hbCreditCooperadoInicioV2.ts` (`hbCreditCooperadoInicioV2Totais`)

---

## Um fluxo, duas telas

| Etapa | Responsável | Cooperado |
|-------|-------------|-----------|
| Lançar entregas 1–5 | Cooperados → **Lançar entregas** → ficha HB (editar) | **Minha ficha HB** (somente leitura) |
| Bruto na nuvem | Salvar ficha → `manual_valor_bruto_cents` | Mesmo campo, mesma fórmula (entregas − desconto %) |
| Ver bruto / a receber | Ficha HB (prévia paridade) + **HB Créditos → Limites** | Início **A receber** + **Minha conta HB** |
| Liberar crédito mercado | **Limites** — percentual / liberação coletiva | **Disponível para pagar** (após %) |
| Fim do mês | Marcar **pago** na ficha / registrar pagamento | Valores zeram; nova ficha vazia no ciclo |

Salvar a ficha **não** libera limite nem valida teto — só grava valores. Liberação é sempre na aba **Limites**.

---

## Fórmulas (iguais nos dois lados)

- **Bruto:** soma entregas 1–5 na ficha ativa, menos desconto % (`brutoFichaPlanoCents`).
- **A receber:** bruto − `amount_used` (crédito HB já usado no mercado).
- **Disponível para pagar:** regra HB com limite liberado capado pelo % configurado em Limites.

---

## Mapa de telas

| Dado | Responsável | Cooperado |
|------|-------------|-----------|
| Ficha ativa | `/cooperados/{id}#ficha-hb` | `/minha-ficha-hb` |
| Bruto + a receber (lista) | `/conta-coop` → Limites | `/minha-conta-coop` |
| Card Início | — | `/dashboard` → A receber |
| Histórico entregas | Nuvem (`historico_ciclos`), não exibido ao coop. | Oculto |

---

## Ciclo mensal (V2)

1. Responsável lança e **Salvar ficha** → cooperado vê na ficha / Início após sync (eventos `HB_FICHA_PLANO_UPDATED`, conta HB).
2. Responsável define **%** em Limites quando for liberar compras.
3. Cooperado usa HB no mercado (`amount_used` sobe; **a receber** cai).
4. Responsável marca **pago** do mês → `closeHbV2FichaMesAposPagamentoResponsavel`: arquiva ficha, zera bruto e reinicia conta HB.

Opcional no meio do mês: **Arquivar entregas e lançar novas** (só limpa ciclo na tela; não substitui pagamento do mês).

---

## Portão de homologação (R6 HB)

| # | Critério |
|---|----------|
| 1 | Mesmo cooperado: bruto na ficha (resp.) = bruto em Limites = bruto em Minha conta HB |
| 2 | **A receber** no Início = ficha HB (coop.) = coluna Limites (resp.) |
| 3 | Após % em Limites: **Disponível** coop. = liberado capado na nuvem |
| 4 | Após pago do mês: ficha zerada + bruto 0 em Limites |

**Gates:** `npm run responsavel:verify:lancamento` · `npm run confirm:production:wait`

---

## Registro

| Data | Nota | Build |
|------|------|-------|
| 27/10/2026 | Paridade `paridadeV2` na API ficha; Limites usa `hbCreditCooperadoInicioV2Totais` | 757+ |

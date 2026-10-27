# Fluxos cooperado — ponta a ponta (estado atual)

## 1. Entrada no app

1. URL canônica: `/login?hb-pwa=<build>&next=/dashboard` (`buildCooperadoLoginPath`).
2. PWA: `pwa-launch.html` → login com flags de reparo.
3. `AuthProvider` + `doLogin` → JWT + `coopeagriplla_session` em localStorage.
4. Cooperado: redirect `/dashboard` (`window.location.assign`).
5. `CooperativaSyncProvider` puxa `operacional.json` / notas conforme política mobile.

## 2. Aba Início (`/dashboard`)

- Card **valor a receber** (paridade BIC / `cooperadoFinanceiroParidadeUniversal`).
- Atalhos: entregas, financeiro, **HB Créditos** (`CooperadoHbCreditResumoCard`).
- Sync chip “Atualizar”.
- Staff misturado se sessão errada (guard de vazamento gestão).

**V2:** Início deixa de existir como hub; entrada direta em `/minha-conta-coop`.

## 3. Entregas (`/notas-pedido`)

- Lista notas do cooperado, fotos, status (rascunho → conferida → quitada).
- Sync nuvem `notasPedido` + storage Supabase.
- Não é HB Créditos; alimenta **ficha** e indiretamente **crédito base** para limite.

## 4. Preços (`/precos`)

- Tabela de preços da cooperativa (instituições/produtos).

## 5. Financeiro (`/ficha-corrida`)

- Extrato mensal, pagamentos, recibos.
- Bloco **Compras HB Créditos** (`HistoricoHbCreditosResumo`) — abatimento no valor a receber.
- Integração: `notaPedidoService` desconta compras HB do mês.

## 6. HB Créditos cooperado (fluxo completo)

### 6.1 Elegibilidade UI

- `isHbCreditCooperadoNavEligible` + `NEXT_PUBLIC_CONTA_COOP_UI_PUBLIC`.
- CNPJ cooperativa resolvido: `resolveCooperadoHbCreditCnpjDigits`.

### 6.2 Bootstrap e sync limite

- `HbCreditAccountPersistBootstrap` (layout): poll `revision`, cache `hb.coop.hbCreditAccount.v5`.
- API: `GET /api/credit/account` — paridade com `/api/credit/limites`.
- Doc: `docs/hb-credito-sync-cooperado.md`.

### 6.3 Minha conta (`/minha-conta-coop`)

- Exibe limite liberado, usado, disponível.
- Cadastro/alteração **PIN** pagamento.
- Histórico transações.

### 6.4 Pagar no mercado

1. Mercado gera cobrança (parceiro) ou cooperado escaneia QR (`/escanear`).
2. Draft em sessionStorage (`hbCreditPaymentDraft`).
3. `/pagar`: validação M6 `prepareHbCreditPaymentAuthorize`, PIN (`HbCreditPinDotsInput`).
4. `POST` authorize → atualiza limite → evento cache.

### 6.5 Pós-pagamento

- Limite usado sobe; responsável vê em `/conta-coop`.
- Ficha do mês pode abater valor a receber (integração legado).

## 7. Mensalidades / comunicados / prestação

Fluxos secundários no drawer; sync operacional; **fora do escopo V2 HB-only**.

## Diagrama simplificado (HB)

```mermaid
flowchart LR
  login[Login JWT] --> dash[Dashboard]
  dash --> mcc[minha-conta-coop]
  mcc --> scan[escanear QR]
  scan --> pay[pagar + PIN]
  pay --> api["/api/credit/authorize"]
  api --> pg[(hb_credit_*)]
  pg --> staff[conta-coop responsável]
```

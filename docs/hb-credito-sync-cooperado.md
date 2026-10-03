# HB Créditos — cooperado sempre atualizado

## Fonte da verdade (exibição)

- **Nuvem:** `hb_credit_accounts` (`limit_released_cents`, `amount_used_cents`), mesma leitura da aba **Limites** do responsável (`GET /api/credit/limites?fast=1`).
- **API cooperado:** `GET /api/credit/account` → `getLimiteCooperadoExibicaoParidadeLimites` (titular + conta na nuvem).

## O que o app faz automaticamente

| Gatilho | Comportamento |
|--------|----------------|
| Login / sync operacional | `HbCreditAccountPersistBootstrap` busca conta e grava cache local (v5). |
| A cada ~20s (app visível) | Poll de `revision` (`updated_at` + limites); se mudou, refetch. |
| Responsável altera Limites / pagamento | `revision` muda → cooperado refetch em background. |
| Volta online | Refetch imediato da conta. |
| Abre **Minha Conta Coop** | Cache instantâneo + `reload` na nuvem; poll + `visibilitychange`. |
| Card **HB Créditos** na home | Poll + eventos de cache; mesmo ID JWT da API. |

## Cache local

- Chave `hb.coop.hbCreditAccount.v5:{cnpj}:{cooperadoId}`.
- Shell zerado sem PIN **não** é reutilizado (força nova leitura).

## Pagamentos

- Validação continua com M6 (`prepareHbCreditPaymentAuthorize`) — independente do valor exibido.

## Se o cooperado ainda ver R$ 0

1. Confirmar deploy com commit de paridade na API.
2. Sair e entrar no app (sessão JWT).
3. Limpar dados do site / reinstalar PWA (cache antigo v4).
4. Conferir login em `app_users` (Idelcy/Joseane sem login não acessam o app).

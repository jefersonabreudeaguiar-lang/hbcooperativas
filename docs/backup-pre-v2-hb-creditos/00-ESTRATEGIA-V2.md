# Estratégia V2 — só HB Créditos (cooperado + responsável)

## Objetivo de negócio

- **Cooperado:** app enxuto = **HB Créditos** (conta, limite, pagar QR, PIN, histórico). Login/senha **inalterados**.
- **Responsável:** app enxuto = **HB Créditos** (painel `/conta-coop`) + **lista de cooperados** com **valor bruto manual** (sem depender de conferência de notas / ficha automática para crédito base).
- **V2:** mesma base de auth e APIs de crédito; UI e navegação simplificadas; menos acoplamento com notas-pedido, ficha-corrida, BIC, PWA pesado.

## O que permanece (não negociável)

| Item | Motivo |
|------|--------|
| `/login`, cadastro, recuperação de senha | Mesmos usuários |
| `app_users` + JWT (`hb_session`) | Credenciais na nuvem |
| `localStorage` `coopeagriplla_session` | Sessão no PWA |
| Postgres `hb_credit_*` + `contaCoopStorage` | Fonte HB Créditos |
| `/api/credit/*` | Backend do produto |
| `/minha-conta-coop` (+ pagar, escanear, receber) | Cooperado |
| `/conta-coop` | Responsável |
| `/cooperados` (lista + cadastro mínimo) | Responsável — lista + valor bruto manual |
| Mercado parceiro (`/mercado-parceiro`) | Cobrança QR (se cooperativa usa mercados) |

## O que sai do app (após backup + tag git)

**Cooperado — remover do menu e rotas principais:**

- Início “valor a receber”, card entregas, BIC pesado
- `/notas-pedido`, `/precos`, `/ficha-corrida` (financeiro legado)
- Mensalidades, prestação de contas, votacoes (drawer), etc.

**Responsável — remover do menu:**

- `/notas-pedido` (conferir), `/ficha-corrida` (pagar), `/livro-caixa`
- Fechamento mensal, relatórios amplos, votacoes (opcional manter só leitura)
- Fluxos de pagamento cooperado atrelados a notas

**Manter desligado na V2 mas no código até fase 2:** integração automática **crédito base ← ficha/notas**; substituir por campo manual “valor bruto” por cooperado na lista.

## Valor bruto manual (responsável)

Hoje o limite HB Créditos pode usar **crédito base** projetado da ficha/notas (`credito-base`, `projetarAppDataFinanceiroParaCreditoBase`). Na V2:

1. Tela **Cooperados** (ou aba em `/conta-coop`) com coluna **Valor bruto (R$)** editável.
2. Persistir em nuvem (estender `hb_credit_accounts` ou tabela `hb_credit_manual_gross` — decisão na Fase 2 de schema).
3. Engine: `creditBaseAuthoritative` prioriza manual quando preenchido; senão fallback legado (até desligar).

## Fases de execução

| Fase | Entrega | Risco |
|------|---------|-------|
| **0** | Esta pasta + `git tag backup/pre-v2-full-app` | Nenhum |
| **1** | Feature flag `NEXT_PUBLIC_V2_HB_ONLY=1`: menus só HB + cooperados (**sem apagar APIs/dados** — ver [08-PRESERVACAO-COMPRAS-E-HB.md](./08-PRESERVACAO-COMPRAS-E-HB.md)) | Baixo |
| **2** | Valor bruto manual + API; desliga sync notas→crédito base | Médio |
| **3** | Remover rotas mortas, lazy chunks, testes legado | Médio |
| **4** | PWA/manifest só `/minha-conta-coop` ou `/login` | Alto (testar WebAPK) |
| **5** | Homologação Coopeagri + 3 cooperados piloto | — |

## V2 “área” vs Hobelisco lab

O diretório `archived/hobelisco-lab` é **observabilidade/lab**, não o app V2 do cooperado. A **V2 do produto** = este repo com escopo reduzido + UI focada. Reaproveitar ideias do Hobelisco só se for monitoramento interno HB.

## Critérios de aceite V2

- Cooperado: login → vê limite → paga com QR → histórico; sem abas entregas/financeiro.
- Responsável: login → lista cooperados → edita valor bruto → ajusta limites HB → liquida/conferir NF se mantido no painel atual.
- Nenhum cooperado perde acesso (mesmo e-mail/senha).
- Deploy com `confirm:production:wait` verde.

## Próximo passo imediato (após sua aprovação)

1. Criar branch `feat/v2-hb-only-menus` com flag `V2_HB_ONLY`.
2. Alterar `permissions/index.ts` (`COOPERADO_MENU`, `RESPONSAVEL_HREFS`, bottom tabs).
3. Redirect `/dashboard` → `/minha-conta-coop` (cooperado) e → `/conta-coop` (responsável).
4. **Não** apagar arquivos de notas/ficha até tag de backup.

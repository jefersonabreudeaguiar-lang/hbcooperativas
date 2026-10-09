# HB Cooperativas — arquitetura (marco zero)

Aplicação **Next.js** (App Router) para gestão de cooperativas agrícolas: cooperados no celular (PWA), responsável/tesoureiro na conferência e pagamentos, plataforma HB para administração e **HB Créditos**.

## Fontes de verdade

| Camada | O quê | Onde |
|--------|--------|------|
| **Notas** | Entregas, conferência, status | `notasPedido` (local + tabela/storage Supabase) |
| **Operacional** | Ficha, pagamentos cooperado, livro caixa | `operacional.json` na nuvem (`cooperativaSyncStorage`) |
| **Leitura financeira UI** | Valor a receber, meses, painel | Paridade universal + BIC (`cooperadoFinanceiroParidadeUniversal`, `bicLeituraCentralCooperado`) |
| **HB Créditos** | Limites, transações, conta coop | Postgres (`hb_credit_*`) + projeção em `arquivosMensais.contaCoopDescontos` |
| **Sessão / usuários** | Login app | JWT + `app_users` (não confundir com Auth Supabase público) |

O cliente mantém **`AppData`** em memória/local (`dataStore.ts`), sincronizado pela `CooperativaSyncProvider`. Escritas destrutivas na nuvem passam por serviços (`cooperativaSyncCloudService`, `notaPedidoCloudService`).

## Domínios de re-render (performance)

Notificações por domínio: `shell` | `notas` | `financeiro` | `operacional` (`appDataDomainNotify.ts`). Telas cooperado pesadas usam `useAppDataSelectorForDomainsWhenActive` e keep-alive de abas (`CooperadoMobileTabKeepAlive`).

## Papéis

- **Cooperado:** Início, Notas, Preços, Financeiro (`/ficha-corrida`).
- **Responsável / tesoureiro:** conferência, fila pagar, ficha, livro caixa.
- **Admin cooperativa / criador plataforma:** `/admin`, APIs `api/admin/*`.

## BIC (leitura central)

Em produção oficial, flags em `.env.production-official.example` e `verify:official-rollout`. Leitura autoritativa evita divergência entre Início, Financeiro e HB. Lab em `src/app/lab/bic` — não deve ser o caminho de produção.

## Release

1. Subir `APP_BUILD_VERSION` em `src/lib/appBuildVersion.ts` e `CACHE_VERSION` em `public/sw.js`.
2. `npm run release:verify` (ou `release:verify:fast` em iterção). No deploy oficial: `RELEASE_VERIFY_STRICT=1 npm run release:verify`.
3. Deploy Vercel (`DEPLOY.md`).
4. Homologação humana (cooperado + responsável + 1 fluxo HB).

## Scripts operacionais (nuvem)

Sem alterar o app no dia a dia; usar com `.env.local` e service role:

- Integridade pagamentos + livro caixa: `repair-operacional-pagamentos-integridade.ts` (upload completo: pagamentos, livro caixa, arquivos mensais).
- HB limites: `sync-hb-credit-limites-cooperativa.ts`.
- Auditorias: `audit-contadores-alinhamento-once.ts`, `audit-a-receber-vs-ficha-once.ts`, `audit-hb-limites-ghost.ts`.

Ver `docs/RUNBOOK-POS-PAGAMENTOS.md`.

## O que não fazer

- Nova rota de “valor a receber” fora paridade/BIC.
- Commit de `.env`, backups operacionais ou secrets.
- `wipe-platform` / `reset-operacional` sem backup (`backup:cloud`).

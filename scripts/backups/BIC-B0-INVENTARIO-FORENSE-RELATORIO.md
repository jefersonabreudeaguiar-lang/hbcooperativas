# B0 — Inventário forense + contrato (relatório completo)

**Data:** 2026-09-27  
**Escopo executado:** somente análise e documentação  
**Repositório:** `C:\Image-Cipher\coopeagriplla-gestao`  
**Produção:** `https://hbcooperativas.vercel.app` · Supabase `ifptyzikekrswippzmsf`

**Status:** **B0 — INVENTÁRIO FORENSE CONCLUÍDO**  
**BIC implantada?** **NÃO.** Nenhuma facade funcional, nenhuma alteração de dados/comportamento.

---

## 1. Arquitetura atual encontrada

### Camadas

```text
┌─────────────────────────────────────────────────────────────┐
│ UI Next.js (app router) — pages + components                │
└───────────────┬───────────────────────────────┬─────────────┘
                │ read/write AppData            │ fetch API
                ▼                               ▼
┌───────────────────────────┐     ┌────────────────────────────┐
│ dataStore (localStorage)   │     │ /api/notas-pedido, credit,│
│ key: coopeagriplla_data    │     │ cooperativa-sync, auth…   │
└───────────────┬───────────┘     └─────────────┬──────────────┘
                │ merge/pull/push                 │
                ▼                                 ▼
┌───────────────────────────┐     ┌────────────────────────────┐
│ cooperativaSyncCloudService│◄───►│ Supabase Storage           │
│ notaPedidoService (motor)  │     │ hb-cooperativa-sync/       │
└───────────────────────────┘     │   {cnpj}/operacional.json  │
                                  │ hb-entregas, hb-cooperados │
                                  └─────────────┬──────────────┘
                                                │
                                  ┌─────────────▼──────────────┐
                                  │ Supabase Postgres          │
                                  │ notas_pedido, app_users,   │
                                  │ hb_credit_*, audit…        │
                                  └────────────────────────────┘
```

### Contexto runtime

- **Sem `DataProvider` React:** estado via `getData` / `updateData` / `subscribe` (`dataStore.ts`).
- **`CooperativaSyncProvider`:** sync cooperado/gestão, expõe `cooperadoPagamentosHydrated`, `syncing`.
- **HB:** domínio server (`src/modules/hb-credit`, `contaCoopStorage.ts`, RPC Postgres).

---

## 2. Fontes de verdade atuais (autoridade)

| Domínio | Verdade operacional percebida | Observação |
|---------|----------------------------------|------------|
| Notas/entregas (cloud) | Postgres `notas_pedido` + fotos Storage | Cooperado escreve; responsável conferência atualiza row + local |
| Ficha / pagamentos / mensalidades | **`operacional.json`** após push gestão | Cooperado recebe via pull merge |
| Trabalho offline imediato | **`localStorage` AppData** | Pode adiantar/atrasar nuvem |
| HB consumo/saldo | **Postgres HB + RPC** | Não vive só no operacional |
| Usuários/sessão | `app_users` + session local/API | Fora do ledger BIC |

**Conclusão B0:** não existe hoje **uma** fonte única; existe **par** gestão-operacional (Storage) + local + notas Postgres + HB Postgres.

---

## 3. Fontes de projeção (leitura derivada)

| Função / serviço | Consumidores |
|------------------|--------------|
| `getResumoValorAPagarRelatorio` | Relatórios, `getTotalAPagarCooperado` |
| `getTotalAPagarCooperado` | Gestão dashboard, conciliação, sobras |
| `getValorQuantoVouReceber` | Início cooperado, ficha-corrida |
| `getResumoQuantoVouReceberCooperado` | Painéis cooperado (facade UI parcial H8.17) |
| `getValorExibicaoCooperado` / pilot | Ficha cooperado (exibição alternativa) |
| `creditBaseAuthoritative` | API crédito-base |
| `dashboardService` | Stats gestão |

Projeções **calculam** e **não** devem gravar — exceto quando UI chama `updateData` por outro motivo (fora do escopo B1).

---

## 4. Pontos de duplicidade

| Valor | Cálculo A | Cálculo B | Risco |
|-------|-----------|-----------|-------|
| A receber cooperado | `getValorQuantoVouReceber` | `getValorExibicaoCooperado` / `CooperadoFichaPanel` | Rotas UI diferentes |
| Total gestão | `getTotalAPagarCooperado` | `relatorioService` agregações | Mesmo motor, filtros distintos |
| HB vs ficha | Desconto conta coop no resumo | Ledger HB Postgres | Divergência histórica conhecida |
| Crédito base | Motor local ficha | `creditBaseAuthoritative` nuvem | Dual motor documentado H8.x |
| Pagamento mês | `getPagamentoAguardandoCooperado` | Lista bruta `pagamentosCooperado` | Stale se sem supersedido |

**Duplicidade de autoridade:** local vs `operacional.json` vs notas row — **principal problema** que BIC endereça em fases.

---

## 5. Pontos de risco

1. **Merge operacional** sobrescreve arrays (`mergeOperacionalIntoData`) — mitigado por guards pagamento/ficha.
2. **Full reset / wipeNotas** — risco catastrófico; guards em `avaliarFullResetOperacionalPullSeguro`.
3. **Recibo stale** — mitigado em `20d9dea` (`pagamentoAguardandoSupersedidoPorConfirmado`).
4. **5 MB cap** `operacional.json` — risco operacional sync fail.
5. **localStorage não no POSBIC** — restore nuvem ≠ restore browser Orlando.
6. **Audit export truncado** (1000 linhas) — forense incompleta no JSON backup.
7. **Big bang BIC** — ver seção 10.

---

## 6. Mapa completo de escrita (financeiro-relevante)

| Ponto | Arquivo / rota | Altera |
|-------|----------------|--------|
| Conferência nota | `NotasPedidoContent.tsx` → `rebuildFichasNota` | notas, ficha |
| Correções entregas | `CorrecoesEntregasPanel.tsx` | notas, ficha |
| Registrar PIX | `ficha-corrida/page.tsx` → `registrarPagamentoCooperado` + API | pagamentos, ficha status |
| Confirmar recibo | `ficha-corrida/page.tsx` → `confirmarPagamentoCooperado` + API | pagamentos |
| Ajustes ficha mês | serviços ajustes / UI ficha | `ajustesFichaMes` |
| Valores avulsos | `ValoresAvulsosReceberPanel` | `valoresAvulsosReceber` |
| Mensalidades/descontos | páginas financeiro/mensalidades | arrays AppData |
| Livro caixa | `livro-caixa/page.tsx` | `livroCaixa` |
| Sync push | `cooperativaSyncCloudService` | operacional local→cloud |
| Sync pull | idem | cloud→local (**pode sobrescrever**) |
| Pagamento nuvem | `pagamentoIntegridadeService` + routes registrar/confirmar | operacional.json |
| HB authorize | RPC + API credit | ledger, receivables, descontos |
| Cron repair HB | `operacional-hb-descontos-repair` | operacional.json |
| Admin reset | `/api/admin/reset-operacional` | operacional / reset flags |
| Notas API | `/api/notas-pedido` | Postgres + merge storage |

**Nenhum destes pontos foi alterado no B0.**

---

## 7. Mapa completo de leitura (financeiro)

| Tela / componente | Função origem | Fonte |
|-------------------|---------------|-------|
| Início cooperado | `getResumoQuantoVouReceberCooperado`, cards dashboard | AppData + sync flags |
| `CooperadoQuantoVouReceberPainel` | idem | idem |
| Ficha corrida (gestão) | `getResumoPagamentoCooperado`, registrar flows | AppData |
| Ficha cooperado | `CooperadoFichaPanel`, `getValorExibicaoCooperado` | AppData |
| Relatórios | `relatorioService` | AppData |
| Financeiro / pagamentos pages | serviços diversos | AppData |
| Conta Coop / minha conta | `creditApiService` | Postgres HB |
| Contador dossie/snapshot | fechamento snapshots | AppData + cloud |

---

## 8. Mapa financeiro (proveniência — respostas 1–11)

| Valor | 1 Fonte original | 2 Calcula | 3 Transforma | 4 Persiste | 5 Replica | 6 Exibe |
|-------|------------------|-----------|--------------|------------|-----------|---------|
| Valor notas | Conferência itens×preço | `buildFichaFromNota` | `rebuildFichasNota` | AppData + nota row | push notas/sync | Notas UI |
| Qtd conferida | Nota item | conferência UI | — | nota + ficha | API | Notas |
| Valor conferido | Ficha | soma fichas | alinhar nota | fichaCorrida | operacional | Ficha/recibo |
| Ficha corrida | Conferência | `notaPedidoService` | dedupe/purge | localStorage | operacional.json | Extrato |
| Valor a receber | Ficha pendente + descontos | `getResumoPagamentoCooperado` | HB abate | — (projeção) | — | Quanto vou receber |
| Pagamento registrado | Responsável | `registrarPagamentoCooperado` | escopo ids | pagamentosCooperado | API registrar | Ficha/gestão |
| Aguardando confirmação | Registro PIX | — | merge | local+JSON | pull merge | Recibo card |
| Confirmado | Assinatura | `confirmarPagamentoCooperado` | supersedido | local+JSON | API confirmar | Histórico |
| Recibo assinado | Campo assinatura | — | — | pagamento | sync | Cooperado UI |
| Supersedido | Regra compare status | `pagamentoAguardandoSupersedidoPorConfirmado` | filtro get | — | — | Início |
| Complemento pós-pagamento | Novas fichas | `fichasPendentesComplementaresPosPagamento` | resumo parcial | ficha nova | sync | A receber |
| Multi-mês | Sets em motor | `mesesReferenciaComDebitoAberto` | consolidação | — | — | Labels |
| HB / débitos | Transações HB + conta coop | `getResumoPagamentoParaRegistro` | netHbAbate | HB PG + operacional descontos | cron repair | Conta coop |
| Arquivos mensais | Snapshot gestão | fechamento | — | arquivosMensais | operacional | PDF/histórico |

**7 Duplicidade?** Sim — ver secção 4.  
**8 Stale?** Sim — pagamentos aguardando pós-confirmado (patch recente).  
**9 Merge?** Sim — `mergeOperacionalIntoData`, `mergePagamentosCooperadoFromCloud`.  
**10 Fallback?** Sim — leitura local se cloud falhar; valores desatualizados.  
**11 Duplicidade autoridade?** Sim — local vs operacional vs notas.

---

## 9. Mapa HB

- **Escrita:** RPC (`hb_credit_authorize_payment`, refund, settlement, app repasse, pool liquidate) via `contaCoopStorage.ts`.
- **Leitura cooperado:** `/api/credit/account`, `utilizacao-resumo`, UI minha-conta-coop.
- **Leitura gestão:** conta-coop page, dashboard credit API.
- **Pontes ficha:** `contaCoopDescontos`, cron repair operacional, `getResumoPagamentoParaRegistro`.
- **B1:** OBSERVAR apenas — **NÃO TOCAR** (matriz proteção).

---

## 10. Mapa sincronização

| Mecanismo | Arquivo | Direção |
|-----------|---------|---------|
| Bundle GET | `/api/cooperativa-sync` | Cloud → client |
| POST operacional/contratos | same | Client → cloud (gestão) |
| `syncCooperativaBackground` | cooperativaSyncCloudService | Cooperado pull |
| `syncCooperativaBidirectional` | idem | Gestão pull+push |
| Pagamento dedicado | registrar/confirmar routes | Partial JSON merge |
| Meta | `syncMetaService`, `operationalReset.ts` | Version/authoritative |
| Lease | `operacionalPullLease.ts` | Concorrência pull |
| Provider boot | `CooperativaSyncProvider` | force sync cooperado |

**Reconciliação:** `repararIntegridadeFichaNotas`, `pagamentoIntegridadeService`, `fichaSyncGuard`, full-reset guards.

---

## 11. Arquivos criados (B0)

| Arquivo |
|---------|
| `scripts/backups/BIC-CONTRATO-v0.md` |
| `scripts/backups/BIC-DATA-PROTECTION-MATRIX-v0.md` |
| `scripts/backups/BIC-B0-TESTES-CARACTERIZACAO-v0.md` |
| `scripts/backups/BIC-B0-INVENTARIO-FORENSE-RELATORIO.md` (este) |

---

## 12. Arquivos que NÃO foram modificados

Todo `src/**`, `supabase/migrations/**`, APIs, componentes, scripts de backup POSBIC, pasta `backups/POSBIC_*`, banco, Storage, localStorage usuários.

*(Documentos pré-existentes `POSBIC-RELATORIO-BIC-IMPLANTACAO.md` não foram reescritos neste passo.)*

---

## 13. Tabelas que NÃO foram modificadas

Todas as tabelas Postgres listadas no `manifest.json` POSBIC — incluindo `notas_pedido`, `hb_credit_*`, logs — **sem** migration, **sem** SQL de escrita neste passo.

---

## 14. Evidências coletadas

- Varredura `src/` (services, API routes, pages, components) — ver inventário resumido abaixo.
- Leitura motores: `notaPedidoService.ts` (L1716+, L1916+, L2324+), `cooperadoEntregasService.ts` (L519+).
- Payload operacional: `cooperativaSyncStorage.ts` `OperacionalSyncPayload`.
- Tag git: `git log -1 POSBIC` → `20d9dea`.
- Backup: pasta `backups/POSBIC_2026-09-27_01-53-47` com `codigo-fonte-app.zip`, `manifest.json`, `db/`, `storage/` — **presentes**.

---

## 15. Dúvidas encontradas

1. Tag `POSBIC`: `git rev-parse POSBIC` pode resolver para objeto tag; commit de conteúdo confirmado **`20d9dea`** via `git log -1 POSBIC`.
2. Extensão exata de `contaCoopDescontos` — memória sessão vs arquivo mensal vs operacional (H8 CI fix); B1 deve respeitar comportamento **atual** sem “consertar”.
3. Homologação Orlando pós-`20d9dea` no browser real — fora do B0 (sem acesso localStorage produção).

---

## 16. Riscos para B1

| Risco | Mitigação proposta |
|-------|---------------------|
| Facade diverge de `getValorQuantoVouReceber` | Characterization tests sec. B0 |
| Refator UI quebra cards loading | Manter flags `cooperadoPagamentosHydrated` |
| Escopo creep HB | Matriz NÃO TOCAR |
| Acidental persistência | Proibir `updateData` na facade |
| Duplicidade `CooperadoFichaPanel` | B1 limitado a Início + Quanto vou receber (contrato) |

---

## 17. Recomendação GO / NO-GO B1

### **GO B1**

**Razões:**

- Inventário confirma que **projeção duplicada** é o problema central — unificável **sem escrita**.
- POSBIC **BACKUP CRIADO** (não confundir com restore validado).
- Guards stale e sync cooperado já existem — facade pode **delegar** sem big bang.
- Matriz proteção delimita escopo.

**Condições:**

- B1 **somente leitura** conforme contrato v0.
- Não alterar HB, registrar pagamento, conferência, merge sync.
- Testes caracterização antes de merge B1.

### NO-GO seria se:

- Exigissem HB + BIC + sync + pagamento num único PR → **bloqueio big bang** (sec. 10).

---

## Inventário completo (referência condensada)

### A) Fontes de dados

| Nome | Localização | Finalidade |
|------|-------------|------------|
| AppData | `localStorage` / `dataStore.ts` | Estado cooperativa offline-first |
| notas_pedido | Postgres | Notas entrega cloud |
| operacional.json | Storage `hb-cooperativa-sync` | Ficha, pagamentos, mensalidades… |
| hb-cooperados | Storage | Perfil cooperados cloud |
| hb-entregas | Storage | Metadados fotos |
| hb_credit_* | Postgres | HB Crédito |
| IndexedDB/media | `mediaDb`, `localMediaStore` | Fotos locais |

### B) Tabelas Postgres (migrations principais)

`cooperativas`, `notas_pedido`, `app_users`, `security_audit_log`, `cooperative_audit_log`, `password_reset_tokens`, `hb_platform_settings`, `hb_asaas_*`, `hb_credit_*` (accounts, partners, intents, transactions, ledger_entries, receivables, refunds, settlements, fiscal_notes, cashback, allocations, app_repasse, …).

### C–G) Serviços / APIs / RPC / cálculo

- **75 rotas** `/api/*` (sync, notas, credit, auth, cron, admin).
- **RPC:** `hb_credit_authorize_payment`, refund, settlement, app repasse, limit sync state, etc. (`contaCoopStorage.ts`).
- **Motor financeiro cooperativa:** `notaPedidoService.ts` (~40 exports ficha/pagamento).
- **Projeção cooperado:** `cooperadoEntregasService.ts`.
- **Sync:** `cooperativaSyncCloudService.ts` (~30 exports).
- **Hooks:** `useAppData`, `useAppDataSelector`, `useSyncStatus`, `useAuth`.

### H–I) localStorage keys relevantes

`coopeagriplla_data`, `coopeagriplla_session`, `coopeagriplla_sync_meta`, chaves `operacional_authoritative_*`, `operacional_pull_merged_at_*`, pending cooperado push, PWA keys.

### J–K) Operacional / Storage

Ver `OperacionalSyncPayload` — inclui `fichaCorrida`, `pagamentosCooperado`, `arquivosMensais`, livro caixa, votacao, snapshots.

### L) Componentes leitura financeira

`CooperadoQuantoVouReceberPainel`, `CooperadoFichaPanel`, `CooperadoMinhaFichaTab`, `CooperadoHistoricoPagamentoMes`, `ReciboResumoView`, `ResumoDescontosMes`, `NotaStatusTimeline`, painéis HB Conta Coop, relatórios.

### M) Componentes escrita financeira

`NotasPedidoContent`, `ficha-corrida/page`, `livro-caixa/page`, `ValoresAvulsosReceberPanel`, fluxos HB authorize UI, admin reset.

### N–O) Sync / reconciliação

Listados sec. 10; merge pagamentos; integridade; fichaSyncGuard; full reset guards.

---

## 9. Backup / restore (POSBIC)

| Item | Status |
|------|--------|
| Pasta `backups/POSBIC_2026-09-27_01-53-47` | Existe |
| `codigo-fonte-app.zip`, `manifest.json`, `db/`, `storage/` | Existe |
| Tag `POSBIC` → commit `20d9dea` | Identificável |
| Limitações (audit 1000 linhas, sem .env, sem localStorage) | Documentadas em `POSBIC-LEIA-ME.txt` |
| **Classificação** | **BACKUP CRIADO** — **RESTORE NÃO VALIDADO** neste B0 |

POSBIC **não** foi modificado nem sobrescrito.

---

## 10. Regra contra big bang — bloqueios registrados

Unificar **simultaneamente** pagamento + HB + notas + sync + banco + ledger **exigiria**:

| Etapa futura | Tratar |
|--------------|--------|
| **B2** | Escrita única responsável (registrar/conferir → pipeline) |
| **B3** | HB na projeção/autoridade ficha |
| **B2/B4** | Event log / merge simplificado |
| **Fora BIC** | Migrar notas_pedido authority vs operacional |

**B1 não implementa** nenhum item acima.

---

## Relação BIC (fase atual)

| Item | Estado |
|------|--------|
| B0 contrato | ✅ Documentado |
| B0 inventário | ✅ Este relatório |
| B1 facade | ❌ Não iniciado |
| Implantação BIC | ❌ **Não** |

---

*Integridade dos dados > continuidade produção > BIC > refactor — respeitado neste passo.*

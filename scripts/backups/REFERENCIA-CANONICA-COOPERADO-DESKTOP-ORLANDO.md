# Referência canônica — Cooperado Desktop (base Orlando)

**Versão:** 1.0  
**Data:** 2026-09-28 (UTC-3)  
**Propósito:** Este documento fixa **o fluxo que hoje funciona no Orlando Desktop** como **padrão único** para **todo cooperado**, em **qualquer cooperativa**, sem copiar dados do Orlando e **sem alterar** HB Crédito nem a área do responsável.

---

## 1. O que esta referência é (e o que não é)

| É | Não é |
|---|--------|
| Modelo de **sequência**: login → warm → sync → projeção → UI | Cópia de pagamentos, notas, fichas ou AppData do Orlando |
| Contrato para **novos cooperados** e **novas cooperativas** | Exceção `if (Orlando)` ou ID fixo em produção |
| Ponto de **retorno local** de código (manifest + snapshot) | Deploy, migration, escrita Supabase ou “reset” de dados |
| Alinhamento de **relatórios cooperado** (valores derivados do mesmo motor) | Refatoração da área **responsável** ou do **motor HB Crédito** |

**Orlando** entra aqui só como **prova de campo**: desktop, login **cooperado**, relatórios e abas conforme você validou. Outros cooperados devem passar pelo **mesmo pipeline**, com **`cooperadoId` + `cooperativaId` + dados próprios**.

---

## 2. Análise — Login cooperado no desktop (caminho Orlando)

### 2.1 Entrada

1. **`/login`** → `AuthProvider.login` → sessão local + perfil nuvem (`ensureCloudSessionReady`, `applyCloudProfileToLocalSession`).
2. **`preloadAppData`** + `subscribe` → `AppData` quente (`waitForAppDataWarm` antes de sync).
3. **`resolveExperienceUser(accountUser, getData())`**:
   - Conta **cooperado** (`isCooperadoAppUser`) → **`role: cooperado`** + **`cooperadoId`** da sessão (via `resolveCooperadoExperienceId` se aplicável).
   - **Desktop** + conta responsável **não** vira cooperado (linha 59 `mobileExperience`: `if (!mobile) return user`) — isso preserva a área do responsável intacta.
4. **`ProtectedRoute`** → shell autenticado `(app)`.

**Conclusão:** Orlando Desktop = login **nativo cooperado**, não “modo gestor”. Esse é o caminho a generalizar.

### 2.2 Cascata de providers (somente cooperado financeiro)

Ordem em `src/app/(app)/layout.tsx`:

```text
ProtectedRoute
  → CooperativaSyncProvider      (sync + cooperadoPagamentosHydrated)
  → CooperadoFinanceiroGate      (slice financeiro local; banner/sync recovery)
  → GestaoAccessGuard            (bloqueia rotas gestão — não alterar nesta referência)
  → AppShell + páginas cooperado
```

**Fora do escopo desta referência (congelado):** ramo `syncCooperativaBidirectional` / filas / fechamento — usados pelo **responsável**, já alinhados.

### 2.3 Sync — o que faz o Orlando “certo”

Fluxo **global cooperado** (documentado em `cooperadoFluxoFinanceiroGlobal.ts` + `H204-ORLANDO-FLUXO-MAPEADO.md`):

| Ordem | Ação | Onde |
|------:|------|------|
| 1 | Mount: `runSync({ force: true })` | `CooperativaSyncProvider` |
| 2 | Cooperado: `cooperadoPagamentosHydrated = false` | início do `runSync` |
| 3 | `syncCooperativaBackground` + **`ensureCooperadoFinanceiroFromCloud`** | merge operacional **do cooperado logado** |
| 4 | Sanidade local + HB descontos **pós-operacional** (fronteira HB — sem mudar motor crédito) | `aplicarSanidadeFinanceiroCooperadoLocal`, `refreshContaCoopDescontosAfterOperacionalSync` |
| 5 | **`markCooperadoPagamentosHydrated(true)`** apenas no **`finally` do `runSync`** | readiness para UI |
| 6 | Pull operacional leve (`hydrateCooperadoPagamentosFromCloud`) | **não** libera UI definitiva sozinho (H204) |

**O que era ruim (e não deve voltar):** marcar `cooperadoPagamentosHydrated` após pull parcial → UI mostrava projeção sobre AppData incompleto (Orlando muitas vezes “aguenta” por local já alinhado; outros cooperados não).

### 2.4 Readiness e projeção (relatórios cooperado corretos)

**Gate único (H203):** `cooperadoApresentacaoFinanceiraConsolidada`  
→ cooperado só vê valores/recibo/aguardando **definitivos** quando `cooperadoPagamentosHydrated && !syncing`.

**Motores (autoridade numérica — iguais para todos os IDs):**

- `getValorQuantoVouReceber`, `getPagamentoAguardandoCooperado`, `getResumoQuantoVouReceberCooperado`
- Filtro: `resolverCooperadoIdCanonico` + `cooperativaId`

**Facades (envelope BIC — mesma UI Orlando / demais):**

- **Início (M8):** `getInicioCooperadoParaExibicao(..., { apresentacaoConsolidada })`
- **Agregado ficha (M6):** `getQuantoVouReceberCooperadoParaExibicao(..., { apresentacaoConsolidada })`
- **Painel (M7):** `getPainelQuantoVouReceberCooperadoParaExibicao` + `cooperadoFluxoPainelProjecaoOpts`

**Recibo / aguardando assinatura:** `useCooperadoExibirAguardandoAssinatura` (mesmo gate de sync).

---

## 3. Mapa por aba (modelo UI cooperado — referência Orlando Desktop)

| Aba / rota | Componente principal | Fonte da verdade (leitura) | Gate sync |
|------------|----------------------|----------------------------|-----------|
| **Início** | `dashboard/page.tsx` → `CooperadoDashboard` | `getInicioCooperadoParaExibicao`, mensagens/avulsos/mensalidade cards auxiliares | `useCooperadoApresentacaoFinanceiraConsolidada` |
| **Ficha corrida** | `ficha-corrida/page.tsx` | M6/M7 facades, `getPagamentoAguardandoCooperado`, resumos mês | idem + M7 `financeiroSincronizando` |
| **Notas / entregas** | `NotasPedidoContent.tsx` | listagens `cooperadoEntregasService` + sync chip | `useSyncStatus` |
| **Meu cadastro / PIX / assinatura** | fluxos cadastro cooperado | serviços cadastro (não HB core) | sync sob demanda |
| **HB Créditos / conta coop** | rotas visíveis via `contaCoopUiVisibility` | **Congelado** — não alterar motor; cooperado só consome após sync operacional | hook pilot sync valor receber (fronteira) |

Relatórios que o cooperado enxerga **derivam** dos mesmos serviços acima — não há relatório paralelo “só Orlando”.

---

## 4. O que é bom vs o que não é bom (para o projeto)

### Bom — replicar para todos

- Login **cooperado** real + `cooperadoId` canônico por cooperativa.
- **`runSync` completo** antes de apresentação financeira definitiva.
- **Mesmas facades** dashboard/ficha + gates H203/H204.
- **Isolamento:** cada projeção filtra por cooperado/cooperativa (BIC tenant guard in-memory).
- **Preservação:** merge operacional com guards de pagamento confirmado / ficha paga (testes existentes).
- Nova cooperativa: cadastrar cooperados + logins → **mesmo `(app)` layout** → mesmos providers → **zeros** forks por pessoa.

### Ruim — evitar

- Tratar H203 sozinho como “correção funcional” (só apresentação; o funcional é sync + motor).
- Copiar AppData ou IDs Orlando para “igualar” outro cooperado.
- Hardcode Orlando/Jeferson no motor cooperado (`src/` produção).
- Alterar cloud/AppData para forçar número na UI.
- Mexer em **HB Crédito** ou **painéis responsável** ao corrigir cooperado desktop.

---

## 5. Nova cooperativa — checklist operacional (sem perda de dados)

1. Criar cooperativa + cooperados na nuvem (cadastro normal).
2. Provisionar **usuário cooperado** ligado ao `cooperadoId` correto.
3. Primeiro login desktop → fluxo desta referência (automático no código).
4. Validar: Início → Ficha → Notas (mesma ordem Orlando), após “Atualizando…” concluir.
5. **Não** importar dados de outra cooperativa; **não** rodar scripts repair/wipe em produção sem autorização.

---

## 6. Ponto de retorno local

| Item | Local |
|------|--------|
| **Manifest** | `backups/REFERENCIA-ORLANDO-DESKTOP-COOPERADO/REFERENCIA-MANIFEST.json` |
| **Snapshot parcial** | `backups/REFERENCIA-ORLANDO-DESKTOP-COOPERADO/src/...` (arquivos listados no manifest) |
| **Snapshot amplo pré-H204** | `backups/H204-BEFORE-ORLANDO-GLOBAL/` (árvore `src/` inteira anterior) |
| **Instruções restore** | `scripts/backups/REFERENCIA-ORLANDO-DESKTOP-PONTO-DE-RETORNO.md` |
| **Fluxo técnico detalhado** | `scripts/backups/H204-ORLANDO-FLUXO-MAPEADO.md` |

**Política de dados:** restaurar **código** localmente; **nunca** implica DELETE/UPDATE financeiro em Supabase ou limpeza de AppData de produção.

---

## 7. Garantias explícitas desta referência

```text
DADOS_PERSISTIDOS_ALTERADOS = 0   (este artefato é documentação + snapshot local)
HB_CREDITO_MOTOR_ALTERADO   = 0   (escopo congelado)
AREA_RESPONSAVEL_ALTERADA   = 0   (escopo congelado)
REGRA_ESPECIFICA_ORLANDO    = 0   (produção cooperado)
FLUXO_GLOBAL_POR_COOPERADO  = 1   (cooperadoId + cooperativaId + dados próprios)
```

---

## 8. Próximo passo recomendado (quando você autorizar)

- Homologar **um cooperado não-Orlando** no **desktop** com o mesmo roteiro de abas (sem copiar dados).
- Manter HB Crédito e responsável **fora** do diff.
- Usar `npm run test:h204-orlando-global` + bateria H200/H203/BIC tenant como regressão de fluxo (in-memory).

---

**Fim da referência canônica.** Use este documento como contrato de produto + engenharia para “todos iguais ao Orlando Desktop no fluxo, distintos nos dados”.

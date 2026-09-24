# H8.9.35 — Proteção cirúrgica de `fichaCorrida` no writer operacional

**Status:** PASS
**Classificação:** correção local implementada; cenário 36 → 0 bloqueado no upload; sem escrita externa.

---

## 1. Backup pré-alteração

Pasta: `scripts/backups/h8-9-35-pre/`

| Arquivo | SHA-256 (antes) | Alterado? |
|---------|-----------------|-----------|
| `src/lib/supabase/cooperativaSyncStorage.ts` | `4e4b9425f19034858c72e999c18790547136ac84cb565c59e3386c674125d804` | **Sim** |
| `src/services/cooperativaSyncCloudService.ts` | `80e3e57a9f1c18bf546696d73d53da9b265eea726debb2dd3083d2e19379c2cd` | Não |
| `src/services/fichaSyncGuard.ts` | `123b0f43d746672dac6c8f63099f074debaa85872adce1b7abb6e8bf3bbd836b` | Não |
| `src/app/api/cooperativa-sync/route.ts` | `cbf54479394b29c5780702869176b72f177f0f37dd1804f32d4018bb284f37e5` | Não |

Cópia física: `scripts/backups/h8-9-35-pre/cooperativaSyncStorage.ts`
Manifest: `scripts/backups/h8-9-35-pre/manifest.json`

---

## 2. Ponto mínimo de integração

**Decisão:** um único hook em `uploadOperacionalSync` (todos os writers que publicam `operacional.json` passam por aqui).

**Ordem em `uploadOperacionalSync`:**

1. payload recebido
2. `aplicarPreservacaoPagamentosConfirmadosNoOperacional` (H8.9.21, salvo `skipPagamentoConfirmadoProtection`)
3. **`aplicarPreservacaoFichasReferenciadasPorPagamentosNoOperacional`** (H8.9.35)
4. `uploadJson` (replace Storage)

A rota `POST /api/cooperativa-sync` já aplica pagamentos antes do upload; o guard de fichas roda no passo 3 usando o **`existing` da cloud** (referência de `fichaIds` nos pagamentos **da nuvem**, conforme especificação).

**Arquivos novos/alterados:**

| Arquivo | SHA-256 (depois) |
|---------|------------------|
| `src/services/fichaCorridaPagamentoGuard.ts` | `1c086f2b734c94044d37bc8ecb66fc621b0b0adaac2ecfcf5386e6fe9a64f348` |
| `src/lib/supabase/cooperativaSyncStorage.ts` | `e97bdfd87d4fdeecee9a5170cc0b7c2429ceb52ddd0bc5ab7e335b0b0b50c3dbee` |

Também: `scripts/test-ficha-corrida-pagamento-guard-h8935.ts`, entrada `test:ficha-corrida-pagamento-guard-h8935` em `package.json`.

---

## 3. Regra implementada (`preservarFichasReferenciadasPorPagamentos`)

1. Coletar IDs protegidos: `existingOperacional.pagamentosCooperado[].fichaIds` (qualquer status).
2. Indexar `fichaCorrida` da cloud e do incoming por `id`.
3. **União:** incoming + reintrodução de objetos da cloud para IDs protegidos ausentes no incoming.
4. **Incoming prevalece** quando equivalente ou ficha nova (não protegida ou sem divergência).
5. **Conflito** (registrado, sem overwrite silencioso):
   - duplicata do mesmo `id` com conteúdo diferente na mesma lista;
   - mesmo `id` protegido com conteúdo divergente cloud vs incoming → mantém **cloud**.
6. **Não inventa** fichas: só reintroduz objetos já presentes em `existingOperacional.fichaCorrida`.
7. **Não altera** `pagamentosCooperado` nem campos financeiros.
8. **Bypass:** `incoming.fullReset === true` (reset admin explícito).

---

## 4. Diff conceitual

```
+ fichaCorridaPagamentoGuard.ts
    preservarFichasReferenciadasPorPagamentos()
    fichasCorridaEquivalentes() // comparação estável por id

  cooperativaSyncStorage.uploadOperacionalSync()
    existing = fetch ou option
    pagamentos H8.9.21
+   ficha H8.9.35 sobre toUpload
    uploadJson
```

---

## 5. Testes executados

| Comando | Resultado |
|---------|-----------|
| `npm run test:ficha-corrida-pagamento-guard-h8935` | **16/16 PASS** |
| `npm run test:preservar-pagamentos-confirmados` | **9/9 PASS** |
| `npm run test:operacional-cloud-write-h8923` | **9/9 PASS** |
| `npx tsc --noEmit` | **PASS** (sem erros) |

### H8.9.35 — casos obrigatórios

| # | Descrição | Resultado |
|---|-----------|-----------|
| 1 | AB → ABC | PASS |
| 2 | ABD → ABCD | PASS |
| 3 | ABC → ABC | PASS |
| 4 | A → ABC | PASS |
| 5 | pg BC, incoming A → ABC | PASS |
| 6 | nova D | PASS |
| 7 | confirmado + ficha | PASS (pagamento via H8.9.21 + ficha restaurada) |
| 8 | aguardando, ficha omitida | PASS |
| 9 | conteúdo divergente | PASS (conflito + cloud) |
| 10 | sem `pagamentosCooperado` no incoming | PASS |
| 11 | duplicata inconsistente | PASS |
| — | regressão pagamentos inalterados pelo guard | PASS |
| Real | cloud 36 / incoming 0 (`pg_1790011810612`) | PASS → **36 preservadas** |
| Real | cloud 36 / incoming 36 | PASS |
| Real | cloud 36 + novas no incoming | PASS → 38 |

---

## 6. Riscos

| Risco | Nota |
|-------|------|
| Fichas obsoletas ressuscitadas | Só IDs ainda listados em pagamentos na **cloud**; não reconstrói corpo inexistente |
| `fullReset` | Guard desligado quando `fullReset: true` no incoming |
| Conflito silencioso | Evitado: registro em `conflitos[]` (ainda não exposto na API; só merge in-memory) |
| Concorrência A/B out-of-order | Mitiga perda por payload parcial; **não** CAS/ETag |
| 10 fichas nunca materializadas na cloud | **Sem** proteção (não há objeto na cloud para unir) |

---

## 7. O que continua sem proteção

- Fichas **não** referenciadas em `existing.pagamentosCooperado[].fichaIds`
- Notas, Livro Caixa, HB Créditos (inalterados)
- Regressão de **contagem global** sem comparar IDs (deliberadamente não usado)
- Cliente `operacionalPushSeguro` em push **authoritative** (continua contornável no browser; **servidor** agora protege no upload)
- Materialização inicial das 10 fichas ausentes na cloud (recuperação humana H8.9.30/31)

---

## 8. Critério H8.9.35

| Critério | OK? |
|----------|-----|
| Testes específicos | Sim |
| 36 → 0 bloqueado no upload simulado | Sim |
| Fichas novas aceitas | Sim |
| Pagamentos não alterados pelo guard | Sim |
| Conflitos não sobrescritos silenciosamente | Sim |
| Typecheck | Sim |
| Escrita externa | **Nenhuma** |

**Classificação final: PASS** (não BLOCKED)

---

## 9. Produção / deploy

| Área | Alterações |
|------|------------|
| PRODUÇÃO | 0 |
| HOMOLOGAÇÃO | 0 |
| BANCO | 0 |
| STORAGE | 0 |
| PAGAMENTOS | 0 |
| FICHAS | 0 |
| NOTAS | 0 |
| HB CRÉDITOS | 0 |
| LIVRO CAIXA | 0 |
| DEPLOY | não realizado |

Alterações restritas a **código local + testes + relatório**; deploy necessário em etapa futura para efeito em produção.

---

**H8.9.35 CONCLUÍDA — CÓDIGO LOCAL + TESTES, SEM ESCRITA EXTERNA.**

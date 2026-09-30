# H8.9.36 — Validação de integração do writer de fichas

## 1. PASS/FAIL

**PASS**

---

## 2. Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `scripts/test-ficha-corrida-upload-integracao-h8936.ts` | **Novo** — suíte de integração local (sem rede) |
| `package.json` | Script `test:ficha-corrida-upload-integracao-h8936` |
| `scripts/backups/h8-9-36-validacao-integracao-writer-ficha.md` | Relatório |

**Não alterados:** `cooperativaSyncStorage.ts`, `fichaCorridaPagamentoGuard.ts`, `route.ts`, `NotasPedidoContent.tsx`, produção/homologação.

---

## 3. Testes executados e resultado

| Comando | Resultado |
|---------|-----------|
| `npm run test:ficha-corrida-upload-integracao-h8936` | **11/11 PASS** |
| `npm run test:ficha-corrida-pagamento-guard-h8935` | **16/16 PASS** |
| `npm run test:preservar-pagamentos-confirmados` | **9/9 PASS** |
| `npm run test:operacional-cloud-write-h8923` | **9/9 PASS** |
| `npx tsc --noEmit` | **PASS** |

### Cenários H8.9.36 (integração)

| ID | Cenário | Resultado |
|----|---------|-----------|
| A | cloud 36 + incoming vazio + `pg_1790011810612` | 36 no `toUpload` |
| B | 36 + nova D | 37 |
| C | incoming parcial | 36 (nenhuma removida) |
| D | conflito conteúdo X | cloud + `conflitos.length === 1` |
| E | ficha nova | preservada |
| F | pagamentos após H8.9.35 | JSON idêntico ao pós-H8.9.21 |
| G | `fullReset: true` | guard off → 0 fichas |
| H | sem `pagamentosCooperado` | 36 preservadas |
| I | regressão 36→0 | 36 preservadas; 10 ausentes não criadas |

**Supabase/Storage:** não invocados — pipeline replicado in-memory com as mesmas funções de produção.

---

## 4. Fluxo real auditado

```
POST /api/cooperativa-sync (section operacional)
  fetchOperacionalSync(existing)
  sanitizarOperacionalSyncPayload(raw, reconciliarFichaFromNotasConferidas)
  aplicarPreservacaoPagamentosConfirmadosNoOperacional(existing, payload)  ← H8.9.21
  [wipeNotas / markHbStale — fora do payload final de fichaCorrida]
  uploadOperacionalSync(supabase, cnpj, payload, {
    existingOperacional: existing,
    skipPagamentoConfirmadoProtection: true,
  })
    toUpload = payload
    aplicarPreservacaoFichasReferenciadasPorPagamentosNoOperacional(existing, toUpload)  ← H8.9.35
    uploadJson(..., operacional.json, toUpload)  ← replace Storage
```

**Ponto em que o objeto final para o Storage é montado:** variável `toUpload` **imediatamente após** `aplicarPreservacaoFichasReferenciadasPorPagamentosNoOperacional` dentro de `uploadOperacionalSync` (`cooperativaSyncStorage.ts`, linhas ~159–167). Não há transformação de `fichaCorrida` depois disso — apenas `JSON.stringify(toUpload)` em `uploadJson`.

**Ordem H8.9.35 vs upsert:** proteção **sempre antes** de `uploadJson` (upsert). Confirmado por teste `AUDIT` e leitura de código.

---

## 5. Confirmação cenário real 36 → 0

Com fixture `pg_1790011810612` (46 `fichaIds`, 36 corpos na cloud, incoming `fichaCorrida: []`):

- **Antes (H8.9.34):** replace publicaria **0** fichas do lote.
- **Depois (pipeline simulado H8.9.35+36):** **`toUpload.fichaCorrida.length === 36`** — regressão **36 → 0 bloqueada** no payload que iria ao Storage.

---

## 6. Dez fichas ausentes NÃO inventadas

Cenário **I** asserta explicitamente que `fc_pg179_37` … `fc_pg179_46` **não** aparecem em `toUpload.fichaCorrida`. O guard só reintroduz objetos **já presentes** na cloud.

---

## 7. Pagamentos financeiros

Teste **F:** `JSON.stringify(pagamentosCooperado)` igual antes/depois do guard H8.9.35 (com H8.9.21 já aplicado). Sem recálculo de valores/descontos/status/`fichaIds`.

---

## 8. Nenhum upload/rede/Supabase

- Nenhum `fetchOperacionalSync` real, `uploadOperacionalSync` async, nem `uploadJson` executados nos testes.
- `reconciliarFichaFromNotasConferidas` usado apenas via import local (sem I/O).
- HB stale / wipeNotas / audit **omitidos** na simulação (não mutam `fichaCorrida` do blob final).

---

## 9. Caminho posterior que ainda poderia substituir `fichaCorrida`

| Caminho | Risco | Corrigir agora? |
|---------|-------|-----------------|
| `uploadJson` após H8.9.35 | **Não** altera payload — só serializa `toUpload` | N/A |
| Outro writer bypassando `uploadOperacionalSync` | Upload direto Storage (H8.9.23 audit) | **Não** — documentado |
| `sanitizarOperacionalSyncPayload` **antes** de H8.9.21/35 | Pode ajustar `fichaCorrida` via stub AppData; nos fixtures testados **não** esvaziou após sanitização | Monitorar se notas no payload |
| `fullReset: true` | H8.9.35 **desligado** — replace pode zerar fichas | Comportamento intencional |
| Concorrência out-of-order (dois uploads) | Último replace vence; guard não é CAS | Risco residual |
| Cliente `pushOperacionalToCloud` authoritative sem deploy | Produção sem H8.9.35 deployada ainda vulnerável | Deploy necessário |

**Conclusão:** dentro de `uploadOperacionalSync`, **não há** passo pós-H8.9.35 que reescreva `fichaCorrida`.

---

## 10. Riscos restantes

- 10 fichas nunca materializadas na cloud continuam ausentes até recuperação cirúrgica aprovada.
- `fullReset` e writers que ignoram `uploadOperacionalSync`.
- Conflitos registrados in-memory mas **não** expostos na resposta HTTP (operador não vê alerta).
- Race entre uploads simultâneos.
- Sanitização com `notasPedido` no payload sync (caso futuro).

---

## 11. Próximo passo recomendado

1. **Deploy** homologação → smoke test manual read-only (download operacional antes/depois simulado).
2. **Deploy** produção após homolog OK.
3. Recuperação humana das **10** fichas + decisão pagamento **D** (fora deste writer).
4. Opcional: expor `conflitos` / `fichasRestauradasDaCloud` no audit log da API.

---

## FINAL OBRIGATÓRIO

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

**H8.9.36 CONCLUÍDA — INTEGRAÇÃO LOCAL VALIDADA, SEM ESCRITA EXTERNA.**

# BIC-DATA-PROTECTION-MATRIX-v0

**Fase:** B0  
**Data:** 2026-09-27  
**Legenda:** cada domínio recebe **uma ou mais** classificações (não excludentes). Nenhum domínio usa **descartar**.

| Classificação | Significado na implantação BIC |
|---------------|--------------------------------|
| **PRESERVAR** | Dados existentes intocáveis; escrita atual permanece |
| **OBSERVAR** | Monitorar divergência; métricas/logs; sem mudança B1 |
| **PROJETAR** | B1 pode ler via facade; não persiste nova verdade |
| **MIGRAR FUTURAMENTE** | B2+ unificar escrita ou autoridade |
| **NÃO TOCAR NO B1** | Explicitamente fora do escopo B1 |

---

## cooperados

| Classificação | Notas |
|---------------|--------|
| PRESERVAR | `AppData.cooperados` + API `/api/cooperados` + Storage `hb-cooperados` |
| OBSERVAR | Alias/canonical id (`resolverCooperadoIdCanonico`) afeta projeção |
| NÃO TOCAR NO B1 | Cadastro, senha temporária, merge cooperado |

---

## notas

| Classificação | Notas |
|---------------|--------|
| PRESERVAR | Postgres `notas_pedido` + fotos Storage |
| OBSERVAR | Status conferência vs ficha |
| NÃO TOCAR NO B1 | Conferência, `NotasPedidoContent`, API notas |

---

## entregas

| Classificação | Notas |
|---------------|--------|
| PRESERVAR | Fotos `hb-entregas`, metadados na nota |
| OBSERVAR | Fila offline / compressão |
| NÃO TOCAR NO B1 | Upload, divisão entrega |

---

## ficha

| Classificação | Notas |
|---------------|--------|
| PRESERVAR | `fichaCorrida` local + operacional |
| PROJETAR | Saldo a receber derivado de fichas pendentes |
| OBSERVAR | `reconciliarFichaFromNotasConferidas`, dedupe |
| MIGRAR FUTURAMENTE | Escrita única pós-conferência (B2) |
| NÃO TOCAR NO B1 | `rebuildFichasNota`, `marcarFichaComoPaga` |

---

## pagamentos

| Classificação | Notas |
|---------------|--------|
| PRESERVAR | `pagamentosCooperado` + rotas sync pagamento |
| PROJETAR | Cards Início / recibo / valor aberto |
| OBSERVAR | Stale aguardando × confirmado |
| MIGRAR FUTURAMENTE | Pipeline único registro+merge (B2) |
| NÃO TOCAR NO B1 | `registrarPagamentoCooperado`, `registrarPagamentoCooperadoNaNuvem` |

---

## recibos

| Classificação | Notas |
|---------------|--------|
| PRESERVAR | Payload assinatura, `valorLiquido` congelado |
| PROJETAR | `valorRecibo`, estado `aguardando_assinatura` |
| NÃO TOCAR NO B1 | UI assinatura, PDF/recibo views |

---

## assinaturas

| Classificação | Notas |
|---------------|--------|
| PRESERVAR | Campos em pagamento confirmado |
| NÃO TOCAR NO B1 | `confirmarPagamentoCooperado` |

---

## HB

| Classificação | Notas |
|---------------|--------|
| PRESERVAR | Todas tabelas `hb_credit_*`, RPC, ledger |
| OBSERVAR | Abate na ficha via descontos conta coop |
| MIGRAR FUTURAMENTE | B3 — débito explícito na projeção BIC |
| NÃO TOCAR NO B1 | Authorize, limites, settlements, mercado |

---

## mercados

| Classificação | Notas |
|---------------|--------|
| PRESERVAR | Parceiros, termos, PIX |
| NÃO TOCAR NO B1 | `/api/credit/mercado`, painel parceiro |

---

## ledger

| Classificação | Notas |
|---------------|--------|
| PRESERVAR | `hb_credit_ledger_entries`, receivables, allocations |
| OBSERVAR | Cron reconciliation |
| NÃO TOCAR NO B1 | Qualquer RPC ledger |

---

## auditoria

| Classificação | Notas |
|---------------|--------|
| PRESERVAR | Logs local + Postgres (export POSBIC truncado em 1000 linhas em algumas tabelas) |
| OBSERVAR | Completude histórica para forense |
| NÃO TOCAR NO B1 | Retenção/purge policies |

---

## Storage

| Classificação | Notas |
|---------------|--------|
| PRESERVAR | Buckets `hb-cooperativa-sync`, `hb-cooperados`, `hb-entregas` |
| OBSERVAR | Limite 5 MB `operacional.json` |
| NÃO TOCAR NO B1 | Upload paths, reset admin |

---

## sync

| Classificação | Notas |
|---------------|--------|
| PRESERVAR | Merge rules, authoritative version keys |
| OBSERVAR | `CooperativaSyncProvider`, lease pull |
| PROJETAR | Flags `cooperadoPagamentosHydrated` na leitura B1 |
| MIGRAR FUTURAMENTE | Ordem única pull materialização (B2) |
| NÃO TOCAR NO B1 | `mergeOperacionalIntoData`, push gestão |

---

## Resumo B1

**Único domínio com PROJETAR ativo:** leitura financeira cooperado (facade sobre ficha + pagamentos + flags sync).  
**Todo o resto:** PRESERVAR + NÃO TOCAR NO B1, com OBSERVAR onde há risco de divergência.

---

*Nenhum dado foi alterado na elaboração desta matriz.*

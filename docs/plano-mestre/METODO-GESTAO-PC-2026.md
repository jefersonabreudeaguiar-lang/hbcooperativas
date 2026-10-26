# Método de trabalho — gestão (responsável) no PC

**Problema:** várias correções (654–657) atacaram sintomas; faltava **um contrato** para “como o PC se comporta”.

**Decisão:** três trilhas, uma política (`staffGestaoPerfilDesktop`), portões SIM/NÃO seu.

---

## Trilhas (ordem fixa)

| Trilha | Objetivo | Portão seu | Gate repo |
|--------|----------|------------|-----------|
| **T1 — PC vivo** | Abrir, menu, trocar telas sem “não responde” | R1 + R2 | `responsavel:verify:fase-r` + perfil desktop |
| **T2 — Dados certos** | Em aberto, Pagar, F5, nomes Conferir | R3 + R4 | preservar-app + forensic F5 |
| **T3 — Nuvem** | POST sem 500, push sob controle | Homolog | diag F12 + Network |

**Regra:** não avançar T2 enquanto T1 for **NÃO** no seu PC. Não misturar cooperado.

---

## Política única (PC ≥1024px)

Arquivo: `src/lib/staff/staffGestaoPerfilDesktop.ts`  
Versão de contrato: `STAFF_GESTAO_DESKTOP_PERFIL_VERSION`

| Comportamento | Mobile | PC |
|---------------|--------|-----|
| Live sync / fila catch-up / idle sync | Sim | **Não** |
| Abertura automática | `notas_delta` / hydrate | **`pulse` após ~6s** |
| Sync pesado (`financeiro_delta` force, `operacional_full`) automático | Conforme política mobile | **Bloqueado** — só **Atualizar** / ação sua |
| Parse `localStorage` | ~180ms idle | **~4,5s** idle |
| Prefetch agressivo de chunks | Sim | **Adiado (~12s), sem hover no menu** |
| Pausa após troca de rota | ~1,2s | **~2,4s** |

Atributo no HTML (F12): `data-staff-gestao-perfil="desktop"|"mobile"`.

---

## Como o agente entrega

1. **Diagnóstico com prova** — API build, código, script F12 (chave `coopeagriplla_data:CNPJ`), nunca só suposição.
2. **Diff mínimo** na trilha ativa; bump de versão do perfil ou contrato + teste.
3. **`npm run responsavel:verify:fase-r`** verde.
4. **Push + `confirm:production:wait`** — você confirma build e SIM/NÃO.

---

## O que você faz

1. **Ctrl+F5** antes de cada teste.
2. Responder **SIM/NÃO** só aos itens da trilha pedida (R1, R2, …).
3. Se travar: F12 → script `diagnostic-travamento-sync.js` → `copy(JSON.stringify(window.__HB_DIAG_SYNC__))`.

---

## Estado atual (agente)

- **T1:** perfil desktop v1 consolidado (build ≥658); 654–657 viram regras no perfil, não exceções soltas.
- **T2:** forensic F5 confirma reconciliar na abertura quente — **próximo** após T1 **SIM**.
- **T3:** diag antigo lia chave errada; script corrigido no repo.

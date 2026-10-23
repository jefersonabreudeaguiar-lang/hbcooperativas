# Liderança do app responsável — plano de trabalho

**Responsável técnico:** agente (Cursor) + repositório `coopeagriplla-gestao`  
**Papel do piloto (Jeferson):** testar no celular/browser como responsável; responder **SIM** ou **NÃO** nos portões — sem julgar no meio do caminho. Só após **SIM** do piloto, mesma linha para demais responsáveis da cooperativa.  
**Produção:** https://hbcooperativas.vercel.app — cada entrega: build `v{N}`, `confirm:production:wait`, changelog quando afetar PWA.  
**Dados:** notas, fichas e pagamentos na nuvem **não** são restaurados de backup JSON sem pedido explícito.

**Por que agora:** Fase 3 do **cooperado** ficou adiada (23/10/2026) — não dá para validar valor/nuvem no cooperado enquanto o responsável trava e as abas não sincronizam.

**Espelho do cooperado:** mesma disciplina — uma fase por vez, checklist objetivo, deploy com testes de contrato.

---

## Piloto

- **Quem:** mesma sessão piloto usada na cooperativa (Jeferson), papel **responsável** / gestão mobile (`PainelResponsavelMobileBar`, Notas, Ficha pagar cooperados, Livro-caixa).
- **Áreas críticas já mapeadas no repo:** `src/lib/responsavel/*`, `staffResponsavelSyncPolicy`, `NotasPedidoStaffResponsavelApp`, `responsavelTrocaAbasRapida`, testes `test-responsavel-*`, `test-staff-responsavel-desempenho`.

---

## Fases (responsável)

### Fase R1 — Entrada e painel estável

**Objetivo:** abrir como responsável, ver painel/fila, sem tela branca nem travamento no primeiro minuto.

| # | Critério |
|---|----------|
| 1 | Login responsável → badge = build publicado |
| 2 | Painel ou Notas visível em &lt; 15 s (rede normal) |
| 3 | 3 aberturas no mesmo dia sem ficar preso |

**Portão:** **SIM** / **NÃO** — *“Fase R1 aceita?”*

---

### Fase R2 — Abas fluidas e sincronizadas

**Objetivo:** trocar abas do painel responsável (Dashboard, Notas, Ficha/pagar, Livro-caixa) sem travar; estado da aba coerente ao voltar (mesma ideia da v566 cooperado).

| # | Critério |
|---|----------|
| 1 | Trocar abas 10x — UI responde |
| 2 | Fila/conferência não “pula” nem mostra dados de outra aba |
| 3 | Sync em segundo plano sem congelar toque |

**Entrega técnica:** pausa de trabalho pesado na troca de aba, keep-alive alinhado a `responsavelTrocaAbasRapida`, menos pull operacional no frame da troca; testes `test-responsavel-troca-abas-rapida`, `test-responsavel-painel-recuperar-aba`, perf staff.

**Portão:** **SIM** / **NÃO** — *“Fase R2 aceita?”*

---

### Fase R3 — Lançar e refletir (ponte para cooperado Fase 3)

**Objetivo:** responsável confere/lança → cooperado vê valor alinhado (base para reabrir portão Fase 3 cooperado).

| # | Critério |
|---|----------|
| 1 | Conferir/lançar na fila sem travar |
| 2 | Em aberto / pagar cooperados coerente com notas |
| 3 | Cooperado piloto vê mudança em ~2 min ou após Atualizar 1x |

**Portão:** **SIM** / **NÃO** — *“Fase R3 aceita?”* → então retomamos **Fase 3 cooperado** no doc `LIDERANCA-COOPERADO-2026.md`.

---

### Fase R4 — Homologação responsável (opcional antes da Etapa 5 global)

Checklist derivado de `ETAPA-5-homolog-fechamento.md` itens que dependem do responsável.

---

## Registro de portões (responsável)

| Fase | Data | Resposta | Build |
|------|------|----------|-------|
| Plano aceito | 23/10/2026 | SIM (adiar F3 cooperado até responsável verde) | — |
| Fase R1 | 23/10/2026 | NÃO (Jeferson — trava / abas dessinc.) | v567 |
| Fase R1 | 23/10/2026 | NÃO (Jeferson — PC) | v568 |
| Fase R1 | aguardando piloto | deploy v569 (PC sem keep-alive) | v569 |
| Fase R1 (entrada PC) | 23/10/2026 | SIM (Jeferson — sem “página não responde” no login) | v570 |
| Fase R1 (portão completo) | 23/10/2026 | NÃO (Jeferson — PC após login) | v570 |
| Fase R1 (portão completo) | 23/10/2026 | SIM (Jeferson — PC) | v571 |
| Fase R2 | 23/10/2026 | item 3 falhou (conteúdo ≠ menu no PC) | v571 |
| Fase R2 | aguardando piloto | deploy v572 (sync menu/conteúdo PC) | v572 |
| Fase R2 | | | |
| Fase R3 | | | |

---

## Próximo passo técnico (agente)

1. Diagnosticar travamento atual (browser + mobile responsável): fila notas, sync staff, F5/foreground.  
2. Aplicar pacote tipo v566 cooperado: quiescence na troca de aba + pausa sync pesada + contratos de teste verdes.  
3. Novo build → Jeferson testa **Fase R1**, depois **R2**.

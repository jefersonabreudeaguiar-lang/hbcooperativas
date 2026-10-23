# Responsável — sincronização por aba (antes da Fase R3)

**Liderança:** agente + piloto Jeferson (SIM/NÃO por aba)  
**Pré-requisito:** Fase R1 e R2 **SIM** (v571)  
**Bloqueia:** Fase R3 responsável e **Fase 3 cooperado** até as quatro abas abaixo estiverem verdes.

**Referência de domínios:** `docs/FILA-RESPONSAVEL-VS-FINANCEIRO.md`, `scripts/audit-contadores-alinhamento-once.ts`

---

## Ordem de trabalho (uma aba por vez)

| Fase | Aba | “Funciona como deve” | Valores reais |
|------|-----|----------------------|---------------|
| **S1** | **Início** (`/dashboard`) | Fila do dia, totais, links batem com as telas | R$ a pagar = relatório em aberto (tolerância centavos); conferir ≠ pagar |
| **S2** | **Conferir** (`/notas-pedido`) | Fila, cooperado, histórico | Notas na nuvem = fila local após sync/Atualizar |
| **S3** | **Pagar** (`/ficha-corrida`) | Em aberto, PIX, cooperados a pagar | Lista e valores = gestão / nuvem |
| **S4** | **Livro-caixa** (`/livro-caixa`) | Lançamentos após PIX confirmado | Saldo e movimentos coerentes com pagamentos |

Cada fase: correção técnica → build `v{N}` → você testa no **PC** (e celular se quiser) → **SIM** ou **NÃO** só para aquela aba.

---

## Regras técnicas (todas as abas)

1. **Atualizar agora** (header): merge do armazenamento local no PC + sync `operacional_full` **só** manual — não zera painel (`requestStaffGestaoAtualizar`).
2. **PC:** primeiros **2 min** sem sync pesada automática (v571); depois sync **leve por aba** ao entrar na rota (`notas_delta` / domínio certo).
3. **Nunca** `operacional_full` automático ao trocar menu (evita retrocesso na Ficha).
4. Dados na nuvem: **sem** restore JSON em massa.

---

## Portões (Jeferson)

Responda **SIM** ou **NÃO** por linha, na ordem S1 → S4:

- *“S1 Início — valores e fila do dia corretos?”*
- *“S2 Conferir — fila e notas alinhadas?”*
- *“S3 Pagar — em aberto e valores corretos?”*
- *“S4 Livro — movimentos corretos?”*

**Todas SIM** → retomamos **Fase R3** (responsável ↔ cooperado) e depois **Fase 3 cooperado**.

---

## Registro

| Fase | Data | Resposta | Build |
|------|------|----------|-------|
| S1 Início | | | |
| S2 Conferir | | | |
| S3 Pagar | | | |
| S4 Livro | | | |

# Auditoria de fluxo e impacto — HOBELISCO HX (lab)

**Data:** 2026-09-08  
**Escopo:** implementação lab v0.1

---

## 1. O que muda no repositório

| Área | Mudança | Produção? |
|------|---------|-----------|
| `lab/hobelisco-hx/` | Novo organismo completo | Não |
| `src/lib/lab/hobeliscoLabGate.ts` | Gate fail-closed | Só afeta `/lab/hobelisco` |
| `src/app/lab/hobelisco/` | UI admin futurista | Lab only |
| `src/app/api/lab/hobelisco/` | API snapshot + diálogo | Lab only |
| `scripts/lab/run-hobelisco-arena.ts` | CLI Arena | Dev/CI |
| `docs/adr/ADR-HOBELISCO-001.md` | ADR | Documentação |

**Nenhum arquivo em `src/app/(app)/`, `api/credit/*`, middleware prod ou migrations é alterado.**

---

## 2. Fluxos HB existentes — impacto

| Fluxo | Impacto lab v0.1 | Impacto futuro (se promovido) |
|-------|------------------|-------------------------------|
| Login / JWT | Nenhum | Sensor AUTH observe-only |
| Sync cooperativa | Nenhum | Alerta push incoerente |
| Ficha corrida / pagamentos | Nenhum | Integrity sensor |
| HB Créditos / liquidação | Nenhum | **Somente observe**; FinancialGuard bloqueia mutação |
| Assinatura cooperado | Nenhum | Antibody ASSINATURA-FSM |
| Admin plataforma `/admin` | Nenhum | Link opcional para lab |
| Mercado parceiro | Nenhum | Behavior sensor |

**Veredito:** v0.1 **não atrapalha** operação. Zero hooks em produção.

---

## 3. Melhorias imediatas (lab)

- Visibilidade unificada de saúde simulada.
- Cenários Arena reutilizam padrões de `resilience-audit`.
- Pipeline formal para nascer defesas (anticorpos) antes de PR.
- Diálogo estruturado para operadores entenderem estado sem ler JSON.

---

## 4. Riscos residuais

| Risco | Severidade | Mitigação |
|-------|------------|-----------|
| Confusão “lab = prod” | Média | Banner âmbar, gate, robots noindex |
| Metáfora excessiva | Baixa | ADR + auditoria GPT |
| Import acidental lab→prod | Alta | ESLint boundary (futuro), review checklist |
| Diálogo parecer “IA viva” | Média | Label explícito: interface determinística |

---

## 5. Checklist pós-implementação

- [x] Build passa sem import lab em rotas produtivas críticas
- [x] Gate 404 em produção sem flag
- [x] Testes obrigatórios Arena (ledger, crédito, RLS, admin)
- [x] FinancialGuard rejeita ações proibidas
- [x] Audit chain com hash encadeado

---

## 6. Conclusão

A implementação lab **melhora** capacidade de evolução defensiva **sem** alterar fluxos operacionais. Promoção a produção deve ser **incremental, observe-first**, com Canary e auditoria humana.

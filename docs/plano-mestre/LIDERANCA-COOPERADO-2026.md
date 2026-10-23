# Liderança do app cooperado — plano de trabalho

**Responsável técnico:** agente (Cursor) + repositório `coopeagriplla-gestao`  
**Papel do cooperado piloto (Jeferson):** testar primeiro no próprio celular; responder **SIM** ou **NÃO** nos portões — sem julgar “está bom” no meio do caminho. Só após **SIM** do piloto, a mesma mudança vale para todos os cooperados.  
**Produção:** https://hbcooperativas.vercel.app — cada entrega: build `v{N}`, `confirm:production:wait`, changelog.  
**Dados:** notas, fichas e pagamentos na nuvem **não** são restaurados de backup JSON sem pedido explícito.

**Linha de base (23/10/2026):** build **v564** — entrada corrigida (v562–563), performance com valor na tela (v564). Homologação formal (Etapa 5) **ainda não fechada**.

---

## Piloto Jeferson (canário)

- **Quem:** sessão `jefersonabreudeaguiar@gmail.com` / cooperado `c_1781981564381_w67gg` (`isCooperadoMobilePilot` no código).
- **Novas mudanças de comportamento:** entram primeiro **só para o piloto**; os demais cooperados ficam no build estável até seu **SIM**.
- **Transparência:** hoje a base GA já é a experiência “padrão Jeferson” para todos em produção (v564). O canário serve para **próximas** correções, não para refazer o que já está liberado.

## Como vamos trabalhar

1. **Uma fase por vez** — só avanço após seu **SIM** no portão da fase.
2. **Critério de pronto** é checklist objetivo (tempo, abas, valor), não “sensação”.
3. **Deploy** só do que passa testes de contrato no repo + confirmação de produção.
4. **Seu único relato útil no meio:** “travou na aba X” / “não abriu” / “badge não é v564” — sem precisar dizer se a correção está certa.

---

## Fases

### Fase 1 — Entrada confiável (PWA)

**Objetivo:** abrir o app, ver Início, sem tela branca nem splash preso.

| # | Critério |
|---|----------|
| 1 | Fechar app → reabrir → badge = build publicado |
| 2 | Início visível em &lt; 15 s (rede normal) |
| 3 | Repetir 3x no mesmo dia sem ficar só em “Olá” ou branco |

**Entrega técnica:** ajustes só em abertura/auth/splash/PWA; testes `test-cooperado-entrada-*` verdes.

**Portão:** você responde **SIM** ou **NÃO** à pergunta: *“Fase 1 aceita no meu celular?”*

---

### Fase 2 — Uso diário fluido

**Objetivo:** trocar abas (Início, Entregas, Ficha, Financeiro) sem travar com valor já na tela.

| # | Critério |
|---|----------|
| 1 | Trocar abas 10x seguidas — UI responde |
| 2 | Sem “Atualizando…” preso com valor visível |
| 3 | Sync em segundo plano sem congelar toque |

**Entrega técnica:** sync/motor/garantia GA; testes `test-cooperado-perf-*` + homolog parcial.

**Portão:** **SIM** / **NÃO** — *“Fase 2 aceita no meu celular?”*

---

### Fase 3 — Valor e nuvem alinhados

**Objetivo:** A receber e Financeiro batem com a gestão; “Atualizar” uma vez reflete lançamento recente.

| # | Critério |
|---|----------|
| 1 | Valor no Início = expectativa da cooperativa (caso Orlando) |
| 2 | Responsável lança → cooperado vê em ~2 min (ou após Atualizar 1x) |
| 3 | Atualizar manual 1x — valor não some nem zera errado |

**Entrega técnica:** hint/sync/event-driven sem `operacional_full` em rajada; scripts de paridade read-only.

**Portão:** **SIM** / **NÃO** — *“Fase 3 aceita?”*

---

### Fase 4 — Homologação formal (Etapa 5)

**Objetivo:** checklist único de `ETAPA-5-homolog-fechamento.md` (7 itens) verde no celular **e** browser.

**Entrega técnica:** contratos CI v544–v552+ congelados; tag/changelog de release cooperado.

**Portão:** **SIM** / **NÃO** — *“Homologação Etapa 5 fechada?”*

---

### Fase 5 — Expansão (depois do cooperado verde)

Responsável, HB, painel gestão — **somente** após Fase 4 **SIM**. Escopo definido em etapa separada.

---

## Portão Fase 1 (Jeferson — celular aberto agora)

Confira no header do app o badge **`v564`** (ou superior). Depois responda **SIM** ou **NÃO**:

1. Abriu o Início (não ficou branco nem preso só no “Olá”)?
2. Consigo usar o app por 1 minuto sem travar na primeira abertura?

**SIM** = Fase 1 aceita → seguimos Fase 2. **NÃO** = corrijo só no piloto primeiro, novo build, você testa de novo.

---

## Registro de portões

| Fase | Data | Resposta | Build |
|------|------|----------|-------|
| Plano aceito | 23/10/2026 | SIM (Jeferson piloto) | — |
| Fase 1 | 23/10/2026 | SIM (Jeferson) | v564 |
| Fase 2 | 23/10/2026 | NÃO (Jeferson — trava ao trocar abas) | v565 |
| Fase 2 | aguardando piloto | deploy v566 | v566 |
| Fase 3 | | | |
| Fase 4 | | | |

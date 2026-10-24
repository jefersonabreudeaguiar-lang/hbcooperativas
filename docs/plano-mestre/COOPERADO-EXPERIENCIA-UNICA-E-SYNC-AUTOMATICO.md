# Cooperado — mesma experiência para todos + «Atualizar» automático

**Liderança técnica:** agente · **Produção:** https://hbcooperativas.vercel.app

## 1. «Todo mundo igual ao Jeferson» — o que já é verdade no código

| Camada | Jeferson piloto | Demais cooperados |
|--------|-----------------|-------------------|
| **Conta** | `isCooperadoMobilePilot` → estrela no header | Não |
| **App (GA)** | `isCooperadoMobileGaPromoted` | **Sim** — todo `role === cooperado` |
| **Abas / motor / BIC / snapshots** | Mesmo ramo GA | Mesmo ramo GA |
| **Empacotar aparelho** | `empacotarModeloAparelhoJeferson` | **Mesma função** (nome legado; roda para todo GA) |

Ou seja: **não há dois apps**. A diferença que ainda aparece na prática é quase sempre **aparelho frio** (sem snapshots locais, PWA não instalado, cache antigo) — não e-mail.

### Estratégia «paridade de aparelho» (produção)

1. **Login / sync bem-sucedido** → `scheduleEmpacotarModeloAparelhoJeferson` (todos).
2. **Primeira abertura sem dados** → `scheduleCooperadoGaPrimeiraCargaSilenciosa` (todos).
3. **Valor zerado com rede** → recovery + garantia GA (todos) — validado no piloto v644.
4. **Comunicação** — link oficial com `?hb-pwa=<build>` e instalar PWA (`pwa-launch.html`) para Orlando e demais.

Piloto Jeferson continua só como **canário de revisão** (estrela + SIM/NÃO antes de mudanças arriscadas).

---

## 2. «Atualizar» sozinho — modelo em 3 gatilhos

Objetivo: cooperado **não precisa tocar** em Atualizar quando o responsável lança nota/pagamento/ficha na nuvem — mas **sem** rajada na abertura (não travar UI).

| Gatilho | O quê detecta | Ação (silenciosa) |
|---------|----------------|-------------------|
| **A — Pulso BIC** | `watchBicCooperativaCloudRevision` (~55 s mobile, ao voltar ao app) | `requestCooperadoStaffRevisionSync` → `operacional_full` event-driven |
| **B — Foreground** | App volta ao foco / checagens do financeiro | Mesma sync se revisão mudou |
| **C — Notas só** | `notasUpdatedAt` mudou, operacional igual | `runCooperadoNotasContratosLightPull` |

**Botão Atualizar** permanece: ação explícita, sync visível, diagnóstico e suporte.

Flags (Vercel, já padrão):

- `NEXT_PUBLIC_COOPERADO_EVENT_DRIVEN_SYNC` = `true`
- Sync manual cooperado (`isCooperadoManualOperacionalSync`) = ON em produção GA

---

## 3. Rollout e portões

| Etapa | Critério |
|-------|----------|
| **645+** | Correção GA: revisão na nuvem dispara sync silencioso mesmo com valor na tela |
| **Fase 4** | Checklist PWA + Chrome (piloto) |
| **Pós-Fase 4** | Demais cooperados: suporte só orienta PWA + uma abertura online; sem ramo especial |

## 4. O que não fazemos automaticamente (proposital)

- `operacional_full` em loop na abertura (travava v565–643).
- Push/WebSocket por cooperado (não existe hoje) — polling de revisão é o contrato.
- Alterar dados na nuvem sem ação do responsável.

---

**Resumo:** Experiência Jeferson **já é** a experiência GA; o trabalho é **aparelho + sync event-driven confiável**. Build **645** fecha o gatilho A/B para lançamentos do responsável.

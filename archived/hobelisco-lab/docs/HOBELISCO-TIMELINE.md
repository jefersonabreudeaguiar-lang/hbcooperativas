# HOBELISCO — Timeline UI (LAB)

Versão: **HX-0.3.1-LAB-HARDENED**

## Rota

`/lab/hobelisco` — painel **Timeline LAB** integrado à view principal.

## Fonte de dados

Eventos vêm **exclusivamente** do Lab Runtime via:

- `organism/TimelineCollector.ts`
- API: `GET/POST /api/lab/hobelisco/timeline`

Nenhum evento é inventado fora do runtime (demo popula cenários reais do organismo).

## Estrutura de evento

| Campo | Descrição |
|-------|-----------|
| timestamp | ISO do LabClock |
| sequence | Ordem no audit |
| state | Life state no momento |
| organ | Sensor/órgão (AUTH, FINANCIAL, etc.) |
| eventType | Tipo do evento |
| risk | Nível L0–L4 |
| threatDNA | ID do Threat DNA ativo |
| defense | Ação defensiva |
| action | Ação executada |
| result | Resultado (CONTAIN, BLOCK, PASS, etc.) |
| severity | INFO / WARN / CRITICAL |

## Filtros locais

Todos, AUTH, API, SYNC, DATABASE, HB CREDIT, FINANCIAL, INTEGRITY, PERFORMANCE, DEVICE, BEHAVIOR, DEFENSE, GUARDIAN, LEARNING, DEATH, REINCARNATION.

## Abas

### 1. Event Timeline

Fluxo visual: `SENSOR → ANOMALY → Threat DNA → RISK → DEFENSE → RESULT`

### 2. Life Timeline

Estados: BIRTH, BOOT, AWAKE, WATCHING, DEFENDING, FORTRESS, RECOVERING, LEARNING, HIBERNATING, FAILED, DEAD, ANALYSIS, REINCARNATING.

Destaca **transições reais** registradas pelo collector.

### 3. Visão Imunológica

Snapshot runtime: Threat DNA, Antibodies, Active Rules, Defense DNA, Memory, Risk, Vitality, Immunity Readiness.

### 4. Snapshot

lifeState, vitality, risk, DNA, memory, antibodies, active defense, world, clock, audit sequence. **Sem segredos.**

## Incident Detail

Ao selecionar incidente, pipeline:

```
EVENT → SENSOR → MEMORY → THREAT DNA → RULE → RISK → DEFENSE → GUARDIAN → RESULT → LEARNING
```

Inclui flags: detectedReason, defenseChoice, contained, falsePositive, falseNegative, humanRequired.

Explicações derivadas do runtime — **sem LLM**.

## Death View

Eventos DEATH/REINCARNATION mostram lineage:

```
DEFENSE FAILED → DEAD STRATEGY → ANALYSIS → HYPOTHESIS → NEW DNA → ARENA → VALIDATED → REINCARNATION
```

## Replay UI

Botão **REPLAY** por incidente. Compara Original vs Replay:

- **MATCH** — comportamento idêntico
- **DIVERGENCE** — mostra ponto exato de divergência

## Uso

1. Abrir `/lab/hobelisco`
2. Clicar **Carregar demo LAB** no painel Timeline
3. Filtrar, selecionar incidente, executar replay

## Componentes

- `src/app/lab/hobelisco/HobeliscoTimelinePanel.tsx`
- `src/app/lab/hobelisco/HobeliscoLabView.tsx`
- `lab/hobelisco-hx/organism/TimelineTypes.ts`

## Limitações

- Dados demo requerem POST para popular (runtime não persiste entre deploys)
- Não conectado a produção ou Supabase
- Visualização local ao LAB

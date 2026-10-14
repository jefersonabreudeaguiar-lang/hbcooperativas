# Comparativo: Jeferson vs demais cooperados (mobile)

## Resumo

No **código atual**, Jeferson e qualquer cooperado logado com `role === cooperado` entram no mesmo ramo: `isCooperadoMobileGaPromoted` (experiência piloto promovida).  
`isCooperadoMobilePilot` (só Jeferson) serve **apenas** à estrela de revisão no header.

A sensação de “Jeferson não trava e os outros travam” costuma vir de **estado do aparelho**, não de ramo diferente no bundle.

## Tabela — flags no código

| Item | Jeferson | Outro cooperado |
|------|----------|-----------------|
| `isCooperadoMobilePilot` (estrela) | Sim | Não |
| `isCooperadoMobileGaPromoted` (perf PWA, cache, gate) | Sim | Sim |
| `data-cooperado-pilot-perf="1"` | Sim | Sim |
| PWA mensageiro (standalone + mobile) | Se instalado | Se instalado |
| Bloqueio `operacional_full` automático (build 372+) | Sim | Sim |
| Painel responsável no mesmo e-mail | Sim (outro login) | Não |

## Tabela — comportamento que **parecia** produção antiga

Ramo legado (`!isCooperadoMobileGaPromoted`) ainda existia em pontos isolados. Cooperado GA com ficha “bloqueada” caía em:

- `falhaCarregarFicha` → `solicitarRecuperacaoFinanceiroCooperado` + `requestAppSyncImmediate`
- `solicitarRecuperacaoFinanceiroCooperado` sem checagem GA
- Primeira carga automática no warmup (18s) no PWA

**Jeferson** em uso diário: cache de card/ficha quente, `hb-coop-operacional-synced-build` já alinhado → **não** entrava nesses gatilhos.  
**Outros** após purge época 3 / deploy: sem snapshot, `bloqueiaEntrada` true → **rajada de sync** e parse do AppData → travamento.

## Alinhamento (meta = Jeferson)

1. Cooperado GA: **não** recovery automático em `falhaCarregarFicha` / `solicitarRecuperacaoFinanceiroCooperado`.
2. PWA mensageiro: **sem** primeira carga automática; nuvem só em **Atualizar**.
3. `isCooperadoMobileGaPromoted`: `role === cooperado` → sempre GA (evita cair no legado).

## Como validar no celular

- Header: build `APP_BUILD_VERSION` (ex.: v373+).
- `<html data-cooperado-pilot-perf="1">` para cooperado.
- Estrela amarela: só Jeferson (revisão piloto).
- Travou? Anotar se há loop de reload ou só “Atualizando dados…” sem toque responder.

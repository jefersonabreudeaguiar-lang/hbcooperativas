# Hobelisco — LAB espelho (Fase 0)

Produção oficial (`hbcooperativas.vercel.app`) permanece **sem Hobelisco**.  
Todo experimento, observer e evolução futura roda **somente** no deploy LAB dedicado.

## Regras inegociáveis

1. **Deploy produção Vercel** — zero flags `HB_HOBELISCO_*` / `HOBELISCO_*`
2. **Supabase Hobelisco** — projeto **separado** de produção (`HB_HOBELISCO_LAB_SUPABASE_URL`)
3. **Tripwire de ref** — se Hobelisco apontar para o mesmo ref de produção, o sistema **bloqueia**
4. **Promoção** — Hobelisco **nunca** promove alterações para produção (`neverPromoteToProduction()`)

## Deploy Preview Vercel (LAB dedicado)

1. **Git:** branch `lab/hobelisco-mirror` (já no GitHub após push)
2. **Vercel** → projeto HB Cooperativas → Settings → Git  
   - Ativar **Preview Deployments** para a branch `lab/hobelisco-mirror`
3. **Environment Variables** → escopo **Preview** apenas (nunca Production):
   - Copiar todas de `.env.hobelisco-lab.example`
   - Preencher `HB_HOBELISCO_LAB_SUPABASE_URL`, `HB_HOBELISCO_LAB_SERVICE_ROLE_KEY`
   - `HB_HOBELISCO_PRODUCTION_SUPABASE_REF=ifptyzikekrswippzmsf`
   - App LAB: `NEXT_PUBLIC_SUPABASE_URL` = Supabase espelho (não prod financeiro)
4. **Production (confirmar):** nenhuma variável `HB_HOBELISCO_*` / `HOBELISCO_*`
5. Após deploy Preview: abrir `/admin` → Hobelisco → badge **Espelho LAB OK**

## Setup deploy LAB (Preview dedicado)

1. Branch sugerida: `lab/hobelisco-mirror`
2. Copiar `.env.hobelisco-lab.example` → variáveis do projeto Preview no Vercel
3. Preencher:
   - `HB_HOBELISCO_LAB_DEPLOY=true`
   - `HB_HOBELISCO_MIRROR_ENABLED=true`
   - `HB_HOBELISCO_BOUNDARY_STRICT=true`
   - `HOBELISCO_ENVIRONMENT=LAB`
   - `HB_HOBELISCO_LAB_SUPABASE_URL` + `HB_HOBELISCO_LAB_SERVICE_ROLE_KEY`
   - `HB_HOBELISCO_PRODUCTION_SUPABASE_REF` (ref do projeto prod — só comparação)
4. Aplicar SQL: `lab/hobelisco-hx/schema/hb_hobelisco_v2_staging.sql` no Supabase LAB

## Ativação local

```bash
cp .env.hobelisco-lab.example .env.local
# editar credenciais LAB
npm run hobelisco:lab:activate
npm run test:hobelisco-lab-boundary
npm run dev
```

Veredito esperado: `LAB-MIRROR-GREEN`

## Verificação no Admin

- `/admin` → Hobelisco → card **Fronteira LAB ↔ Produção**
- Badge **Espelho LAB OK** (cyan) ou **Produção protegida** (verde no site oficial)
- API: `GET /api/admin/hobelisco/lab-health` (JWT admin)

## Banner visual

- `/lab/hobelisco` exibe faixa **AMBIENTE LAB — espelho isolado**
- Se fronteira violada: faixa vermelha com tripwire

## Checklist produção (Vercel Project oficial)

Confirmar **ausência** de:

- `HB_HOBELISCO_V2_ENABLED`
- `HB_HOBELISCO_LAB_ENABLED`
- `HB_HOBELISCO_MIRROR_ENABLED`
- `HOBELISCO_ACTIVE_DEFENSE_ENABLED`
- `HOBELISCO_ENVIRONMENT=LAB`

Se alguma flag Hobelisco aparecer em produção, o boot registra:

```
[Hobelisco] TRIPWIRE produção: ...
```

## Módulos de fronteira (código)

| Arquivo | Função |
|---------|--------|
| `src/lib/lab/hobeliscoLabBoundary.ts` | Tripwires centrais LAB ↔ prod |
| `src/lib/lab/hobeliscoLabMirrorConfig.ts` | Health check Fase 0 |
| `src/lib/lab/hobeliscoV2Gate.ts` | Observer só se fronteira verde |
| `src/lib/lab/hobeliscoLabGate.ts` | Rotas `/lab/*` bloqueadas em prod |
| `lab/hobelisco-hx/persistence/SupabaseStagingPersistence.ts` | Sem fallback prod em modo espelho |

## Próximas fases (não implementadas aqui)

- **Fase 1** — `ProdMirrorSync` diário prod → LAB (anonimizado)
- **Fase 2** — defesas ativas só no LAB + relatório por ação
- **Fase 3** — relatório diário de evolução
- **Fase 4** — upload de arquivos no Admin
- **Fase 5** — cron orquestrador
- **Fase 6** — gate de maturidade antes de promoção manual

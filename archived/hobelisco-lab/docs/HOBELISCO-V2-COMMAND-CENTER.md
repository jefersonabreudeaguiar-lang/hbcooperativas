# HOBELISCO V2.1 — Auto Observer + Command Center UX

Versão: **HX-0.4.1-v2-command-center**

## V2.1 — Captura automática

- Middleware registra **401 auth** e **tráfego API autenticado** via `/api/lab/hobelisco/v2/ingest`
- Fail-silent — não afeta requests
- Exclui rotas `/api/lab/hobelisco/*`

## Painel de incidentes

- `GET /api/lab/hobelisco/v2/incidents` — lista candidatos
- `POST` com `{ action: "confirm"|"dismiss", incidentId }` — **humano obrigatório**

## Command Center UX

Rota `/lab/hobelisco` — layout unificado:

| Aba | Conteúdo |
|-----|----------|
| **Visão** | Heartbeat, sensores, saúde, ameaças |
| **Observe** | V2 observer, ciclo, métricas, auto-capture |
| **Timeline** | Eventos LAB, life, imunológico |
| **Incidentes** | Confirmar / Descartar candidatos |
| **Canal** | Diálogo determinístico |

## Vitals strip (topo)

Vitalidade · Observer · Integridade · Incidentes · Arena

## Reiniciar após deploy

```bash
npm run dev
```

Abra `/lab/hobelisco` — Command Center futurista, informação essencial em 5 KPIs + 5 abas.

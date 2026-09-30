# HOBELISCO — Limitations (LAB)

## Escopo validado

- Organismo funcional **somente no LAB**
- Sensores alimentados por **LabWorld simulado**
- Memória e Threat DNA **determinísticos** (sem LLM)
- Arena **1000 + 10000 full-core sims** via `FullCoreArenaRunner`
- UI Timeline completa em `/lab/hobelisco`

## Não declarar

- "perfeito"
- "invulnerável"
- "100% seguro"

## Classificações honestas

| Área | Limitação |
|------|-----------|
| Sensores | SIMULATED — não lê middleware prod |
| Health cooperativa | SIMULATED — dados sintéticos |
| UI timeline | IMPLEMENTED — ver HOBELISCO-TIMELINE.md |
| Staging Supabase | PRODUCTION_FORBIDDEN no closure |
| IMMUNITY_READINESS | Experimental — não garantia |
| Auto-modificação código | PROHIBITED |
| Mutação financeira | PROHIBITED mesmo no LAB |

## Gaps remanescentes

1. Time-travel visual investigação avançada (fora do escopo LAB-HARDENED)
2. Observação read-only de sistema real (HOBELISCO V2 — próxima fase)

## Resposta à pergunta central

> "Se este organismo estivesse diante de uma invasão simulada, ele percebeu, lembrou, raciocinou, defendeu, verificou, aprendeu, registrou, recuperou e evoluiu?"

**Sim, nos 25 cenários ATTACK-* e 23 testes CLOSURE-* com evidência executável.**  
Limitado ao escopo LAB documentado acima.

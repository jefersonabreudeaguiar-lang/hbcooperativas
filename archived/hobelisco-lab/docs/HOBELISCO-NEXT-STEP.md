# HOBELISCO — Next Step (pós-closure)

## Closure concluído

Versão: `HX-0.3.0-LAB-CLOSURE`  
Veredito: **ORGANISM-GREEN** (23/23 closure tests)

## Recomendações (sem autorização de produção)

1. **V2 Observe-Only** — conectar sensores a logs reais em staging (já parcialmente implementado em `observation/`)
2. **UI timeline** — evoluir `/lab/hobelisco` com dados do HobeliscoRuntime
3. **10.000 sims** — executar quando recursos permitirem; registrar NOT_EXECUTED até lá
4. **Persistência hb_hobelisco_*** — schema SQL existe; adapter staging separado do organismo runtime

## Não fazer sem comando explícito

- Conectar organismo a produção
- Promover defesas para canary/prod
- Auto-modificação de código
- Mutação financeira real

## Comando de validação contínua

```bash
npm run lab:hobelisco:closure
```

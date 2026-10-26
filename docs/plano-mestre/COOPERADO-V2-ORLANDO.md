# Cooperado v2 — piloto Orlando

**Status:** homologação (não substitui o app oficial até SIM do operador).

## Princípios

- **Nuvem** = fonte da verdade; celular só recebe JSON pequeno (card, resumos).
- **Sem** `CooperativaSyncProvider`, AppData pesado, keep-alive de abas v1.
- **Aparência** = mesmos componentes visuais (card A receber, cores, abas).
- **Piloto:** apenas `c_1782263929381_ncp55` (Orlando).

## URLs

| Rota | Função |
|------|--------|
| `/cooperado-v2/inicio` | Olá + A receber + Atualizar |
| `/cooperado-v2/entregas` | Stub → fase 2 |
| `/cooperado-v2/precos` | Stub |
| `/cooperado-v2/financeiro` | Stub |

Login: `/login?next=%2Fcooperado-v2%2Finicio`

## API

- `GET /api/cooperado-v2/inicio-card` — projeção BIC a partir da nuvem (servidor).
- `POST /api/cooperado-v2/atualizar` — recarrega da nuvem e devolve o mesmo payload.

## Critério de promoção

Orlando **SIM** em: abertura &lt; 2s percebido, Atualizar sem travar tela, valor = cooperativa. Depois: Jeferson/GA e redirect oficial.

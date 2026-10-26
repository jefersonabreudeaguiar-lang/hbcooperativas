# Piloto Jeferson — status

**Último portão:** aguardando SIM/NÃO — **build 688** (complementar pós-PIX + baseline v644).

**Correção build 688 (dados):** valor a receber após 1º pagamento — entrega nova ou conferida depois do PIX não some por “mês já liquidado”.

**Build 687:** quiescência de abertura sem renovar a cada render.

**Correção build 685:** GA não usa mais `div` vazio enquanto `viewLive` carrega — pinta **Olá + cards** (`data-cooperado-inicio-shell`); splash some com casca ou após ~2,4s (não bloqueia em `inicio-loading`).

**Build 684 (mantido):** sync BIC/rematerialização adiados na quiescência de aba (14s).

## O que falhou no teste

O build 682 só alterava o cálculo de **complementar pós-PIX** no `notaPedidoService` para o id do Jeferson. Não restaurava o pacote completo cooperado (abas, Financeiro, sync) que estava na tag v644.

## Próxima tentativa (só Jeferson, antes do GA)

1. Mudanças de **UI/sync cooperado** atrás de `isCooperadoMobilePilot` (não Preview separado).
2. Financeiro complementar no mesmo gate.
3. Estrela + build novo; Jeferson em **https://hbcooperativas.vercel.app**.
4. Novo SIM/NÃO por fase (`LIDERANCA-COOPERADO-2026.md`).

## Identidade piloto

- E-mail: `jefersonabreudeaguiar@gmail.com`
- cooperadoId: `c_1781981564381_w67gg`

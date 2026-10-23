# Plano mestre — Etapa 2: valor certo após lançamento do responsável

**Build alvo:** 550+

## Problema

O hint de lançamento só fazia **pull operacional leve**. A nota **conferida** nova ficava só na nuvem → motor/`A receber` podia zerar ou atrasar até um sync pesado.

## Correção

`runCooperadoLancamentoHintPull`: **notas leves** → **operacional leve** → rematerializa snapshots (já no pull operacional).

## Aceite (cooperado real)

1. Responsável lança/conferir entrega para o cooperado (ex.: Orlando).
2. Cooperado abre o PWA (ou volta ao app) **sem** tocar Atualizar.
3. Em até **~2 min** (hint + revisão), **A receber** mostra o valor da entrega nova (não R$ 0 por PIX antigo no mesmo mês).
4. **Atualizar** mantém o mesmo valor (não some).

| Aceite Etapa 2 | ☐ SIM / ☐ NÃO |
|----------------|---------------|
| Build no header | |
| Observação | |

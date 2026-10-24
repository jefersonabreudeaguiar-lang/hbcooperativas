# Checklist homologação — Responsável (lançamento)

**Tempo sugerido:** ~45 min · **Build mínimo:** cooperado **645+** (sync automático) + gate staff verde.

Marque **SIM** / **NÃO** (celular **e** desktop quando aplicável).

| # | Cenário | Mobile | Desktop |
|---|---------|--------|---------|
| R1.1 | Login → painel gestão (não cooperado) | | |
| R1.2 | F5 — dados e menus voltam sem zerar | | |
| R2.1 | Trocar abas principais 10× — fluido | | |
| R3.1 | Fila **Conferir** coerente com Notas | | |
| R3.2 | **Em aberto** e **Pagar** — mesmo valor por cooperado | | |
| R3.3 | Registrar pagamento — não duplica / não some | | |
| R4.1 | **Atualizar** 1× — totais não zeram | | |
| R4.2 | Painel **A pagar** ≈ soma do relatório em aberto | | |
| R5.1 | Após lançar/pagar — cooperado vê em ~2 min (ou Atualizar 1× no app cooperado) | | |

## Portão final

**“Responsável pronto para lançamento?”** — **SIM** só se todas as linhas críticas (R3 + R4 + R5.1) = SIM.

Repo (agente): `npm run responsavel:verify:lancamento` deve estar verde antes do seu SIM.

# Backup pré–V2 (HB Créditos only)

**Data de referência:** 2026-10-27 · **Build app:** 731 · **Repo:** `coopeagriplla-gestao`

Este pacote documenta **como o app funciona hoje** (todas as abas e fluxos ponta a ponta) antes de enxugar para **só HB Créditos** no cooperado e no responsável, migrando a experiência para **V2**, **mantendo logins e senhas** (`app_users` / JWT / `coopeagriplla_session`).

## Leitura recomendada

| Ordem | Documento | Conteúdo |
|------|-----------|----------|
| 1 | [00-ESTRATEGIA-V2.md](./00-ESTRATEGIA-V2.md) | Objetivo, escopo V2, fases, o que some vs o que fica |
| 2 | [01-INVENTARIO-ROTAS-ABAS.md](./01-INVENTARIO-ROTAS-ABAS.md) | Rotas, menus, papéis |
| 3 | [02-FLUXOS-COOPERADO-E2E.md](./02-FLUXOS-COOPERADO-E2E.md) | Cooperado: login → abas → HB Créditos |
| 4 | [03-FLUXOS-RESPONSAVEL-E2E.md](./03-FLUXOS-RESPONSAVEL-E2E.md) | Responsável: gestão + HB Créditos |
| 5 | [04-HB-CREDITOS-TECNICO.md](./04-HB-CREDITOS-TECNICO.md) | APIs, nuvem, módulo, integração com ficha |
| 6 | [05-AUTENTICACAO-E-DADOS.md](./05-AUTENTICACAO-E-DADOS.md) | Login, sessão, o que **não** pode ser apagado |
| 7 | [06-INTEGRACOES-LEGADO.md](./06-INTEGRACOES-LEGADO.md) | Notas, ficha, abatimento — impacto ao cortar |
| 8 | [07-PLANO-REMOCAO-POS-BACKUP.md](./07-PLANO-REMOCAO-POS-BACKUP.md) | Checklist para remover o resto com segurança |
| 9 | [08-PRESERVACAO-COMPRAS-E-HB.md](./08-PRESERVACAO-COMPRAS-E-HB.md) | **Compras mercado + HB** — o que não pode ser perdido na V2 |
| 10 | [MANIFEST-HB-CREDITOS-ARQUIVOS.txt](./MANIFEST-HB-CREDITOS-ARQUIVOS.txt) | Lista de arquivos do domínio HB Créditos |

## Documentos externos já existentes (referência)

- [`docs/ARQUITETURA.md`](../ARQUITETURA.md) — visão geral
- [`docs/hb-credito-sync-cooperado.md`](../hb-credito-sync-cooperado.md) — sync limite cooperado
- [`docs/diagnostico/RESPONSAVEL-PONTA-A-PONTA-2026.md`](../diagnostico/RESPONSAVEL-PONTA-A-PONTA-2026.md) — gestão responsável
- [`docs/plano-mestre/MARCO-ZERO-PROGRAMA-2026.md`](../plano-mestre/MARCO-ZERO-PROGRAMA-2026.md) — programa marco zero

## Regra de ouro da migração

1. **Backup documental** (esta pasta) — concluído neste passo.  
2. **Tag git / branch `backup/pre-v2-full-app`** — recomendado antes de apagar código.  
3. **Só então** remover rotas/menus fora HB Créditos conforme [07-PLANO-REMOCAO-POS-BACKUP.md](./07-PLANO-REMOCAO-POS-BACKUP.md).

Não apagar `app_users`, auth, APIs `/api/credit/*`, nem storage `hb_credit_*` sem plano explícito.

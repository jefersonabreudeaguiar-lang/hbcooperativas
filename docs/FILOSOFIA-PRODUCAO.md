# Filosofia imutável — HB Cooperativas em produção

Este documento vale para **todo commit e todo push** que altera o app (`coopeagriplla-gestao`). Não é marketing: é o contrato entre desenvolvimento e quem usa o sistema no campo.

## Princípio zero

**O app existe para estar em produção e aparecer, de forma correta, para cada cooperado e cada responsável** (e demais papéis quando aplicável). Código que não chega ao deploy oficial ou que esconde funcionalidade para quem depende dela **não conta como entrega**.

## O que “em produção” significa

1. **Deploy oficial** (Vercel / build com flags de produção documentadas em `.env.production-official.example`).
2. **PWA visível**: quando a mudança afeta UI, fluxo ou cache, subir `APP_BUILD_VERSION` (`src/lib/appBuildVersion.ts`) e `CACHE_VERSION` (`public/sw.js`) para cooperados receberem o bundle novo.
3. **Papel certo, tela certa**: cooperado vê cooperado; responsável/tesoureiro vê conferência e pagamentos; admin vê admin. Não quebrar `usePermissions`, experience mobile do responsável, nem BIC/paridade financeira sem revisão explícita.
4. **Dados reais**: notas, `operacional.json`, livro caixa e HB Créditos são fonte de verdade na nuvem. Mudanças locais não podem “sumir” pagamentos confirmados nem reabrir ficha paga sem trilha de repair documentada.

## Antes de cada commit / push

| Verificação | Como |
|-------------|------|
| Comportamento preservado | Diff cirúrgico; sem refatorar god files “de brinde”. |
| Gate mínimo | `npm run release:verify:fast` (ou `release:verify` antes de release grande). |
| Visibilidade em prod | Se mudou fluxo cooperado/responsável: checklist mental — login, Início, Financeiro ou Notas conforme o escopo. |
| Segredos | Nunca `.env`, backups operacionais ou service role no git. |
| Scripts `_once` | Só ferramentas locais; não substituem repair/runbook oficial sem doc. |

## Depois do merge (humano ou CI)

- Confirmar deploy na URL de produção.
- Homologação curta: **1 cooperado** + **1 responsável** nos fluxos tocados (valores, fila, notas).
- Pós-pagamentos em massa: `docs/RUNBOOK-POS-PAGAMENTOS.md`.

## O que nunca fazer

- Feature só em lab/BIC sem caminho claro para produção oficial.
- Desligar sync ou prefetch de forma que um papel deixe de ver dados atualizados sem aviso.
- “Otimizar” removendo telas, abas ou permissões que usuários já usam no dia a dia.
- Push que depende de workflow GitHub sem token `workflow` e assumir que CI rodou (validar localmente).

## Performance (incl. ondas 2.x)

Melhorar cold start e chunks **não pode** atrasar ou impedir o carregamento da funcionalidade quando o usuário abre a aba. Prefetch leve + chunk pesado no toque (ex.: notas cooperado) segue este princípio: **Início/Financeiro primeiro; Entregas completo quando o usuário pede**.

## Referências

- Arquitetura: `docs/ARQUITETURA.md`
- Release: `npm run release:verify`
- Fila vs financeiro: `docs/FILA-RESPONSAVEL-VS-FINANCEIRO.md`

**Resumo em uma linha:** todo push deve poder ser explicado assim — *“em produção, o cooperado X e o responsável Y continuam vendo e fazendo o que precisam, com dados alinhados.”*

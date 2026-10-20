# Operação HB — trava anti-retrocesso

Este é o sistema operacional da plataforma. Não muda o que o cooperado ou o responsável vê. Trava o que já funciona e define como a próxima cooperativa entra **sem** o app de hoje pagar a conta.

Constituição: `docs/FILOSOFIA-HB-UNICO.md`. Deploy: `docs/FILOSOFIA-PRODUCAO.md`. Gate: `npm run gate:preservar-app`.

## Princípio

Grandes empresas não reescrevem o produto do cliente para escalar. Elas **congelam a experiência**, isolam cada cliente e só então abrem o próximo. Aqui o cliente é o CNPJ, e o prejuízo de um erro é ficha errada e comida no caminhão.

- Cooperado de hoje: Início, Financeiro, Entregas, HB, A receber — iguais ou melhores.
- Responsável de hoje: Conferir, Em aberto, Pagar, Correções, Ficha — iguais ou melhores.
- Escala: isolamento + primeiro dia + saúde por CNPJ. Não é PWA novo. Não é rewrite.

## Raio de explosão

Cada commit pertence a **um** raio de produto. `docs` pode acompanhar. Misturar dois raios de produto no mesmo commit é proibido.

| Raio | O que é | Exemplos |
|------|---------|----------|
| `docs` | Lei, regra, catálogo, CI, este arquivo | `docs/`, `.cursor/rules/`, `src/lib/plataforma/` |
| `tenant-gestao` | Isolamento por CNPJ, persistência staff, troca de cooperativa | `src/lib/staff/` |
| `responsavel` | Conferir, Em aberto, Pagar, Correções, painel | `src/lib/responsavel/` |
| `cooperado-GA` | Início, Financeiro, Entregas, HB, A receber, PWA | `src/lib/cooperado/`, `public/sw.js` |

Classificador: `raioExplosaoDoDiff` em `src/lib/plataforma/preservarAppCatalogo.ts` (só teste — **não** importar em UI).

## Freeze

Se `npm run gate:preservar-app` ficar vermelho:

1. Nenhuma outra correção entra no ar.
2. Não “compensar” quebrando outro contrato.
3. O gate se adapta ao app. O app **não** se adapta ao gate. Se um arquivo de tela precisar mudar para o teste passar, parar e reportar.

## Sequência de escala (um sim por passo)

| Passo | O que é | Estado | Precisa de sim novo? |
|-------|---------|--------|----------------------|
| **0** | Esta trava (lei + catálogo + gate + CI) | Feito | — |
| **1** | Staff sem blob global (`coopeagriplla_data` sem CNPJ). Só gestão. Cooperado GA fora. | Feito | — |
| **2** | Saúde só-leitura por CNPJ (contrato no ar, cooperado com login, ficha = A receber) | Não iniciado | **Sim** |
| **3** | Completar primeiro dia no app (`staffPrimeiroDiaContratos`) | Esboço existe | **Sim** |

Sem sim, não se mexe no passo seguinte. Cooperado GA só muda com pedido explícito **e** `npm run gate:melhor-performance`.

## Superfícies travadas (passo 0)

Versões em `PRESERVAR_APP_CONTRATOS_TRAVADOS`. Subir a versão do contrato exige ordem explícita **e** atualizar o catálogo no mesmo commit.

- Conferir entregas + Em aberto — v2
- Pagar cooperados — v1
- Correções — v1
- Painel responsável (shell) — v3
- Fotos / Ficha cooperado — v2
- Abertura instantânea — v1
- Troca de abas — v1
- LKG staff por CNPJ (`hb-staff-gestao-lkg-v1:{cnpj}`)

## Débitos conscientes (não corrigir agora)

- Blob global `coopeagriplla_data` do **cooperado** (um aparelho, um cooperado) — intocado de propósito.
- Chaves `hb-coop-*` de release/PWA sem tenant (não são lastro financeiro).
- `coopeagriplla_pending_nota_deletes` ainda sem CNPJ (fila de apagar nota).

Passo 1 fechou: gestão não lê nem grava o blob global. Sem CNPJ na sessão, o responsável não toca o arquivo do cooperado.

## O que o passo 0 nunca faz

- Subir `APP_BUILD_VERSION` / `public/sw.js`
- Editar tela, hook de UI, `dataStore`, sync, HB, pagamentos, fila
- Wizard, importação em massa, dashboard de saúde
- Segunda cooperativa no mesmo login do responsável da casa
- Commit de WIP, `_once`, migrations HB

## Como operar

Antes de resumir commit que toque `src/`: `npm run gate:preservar-app`.

O mesmo gate é a primeira fase de `npm run release:verify` e `release:verify:fast`.

CI: `.github/workflows/preservar-app-gate.yml` em PR/push que toque `src/` ou os testes de contrato.

Produção continua o único palco. Commit/push só com confirmação humana. Depois de push na `main`: `npm run confirm:production:wait`.

## Frase

*“Isso deixa o cooperado e o responsável de hoje iguais — e só então aproxima a próxima cooperativa?”*

Se não, não se faz.

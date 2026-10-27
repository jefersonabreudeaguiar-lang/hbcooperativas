# Inventário — rotas, abas e papéis

Fonte: `src/permissions/index.ts`, `src/lib/performance/cooperadoBottomTabRoutes.ts`, `src/app/**/page.tsx`.

## Papéis principais

| Papel | Identificação | Shell |
|-------|----------------|-------|
| **cooperado** | `role=cooperado` + `cooperadoId` | App mobile/PWA |
| **responsavel** / **tesoureiro** / diretoria | `canAccessPainelResponsavel` | Gestão desktop/mobile |
| **parceiro** | mercado HB Créditos | `/mercado-parceiro` |
| **contador** | auditoria | `/contador/*` |
| **admin plataforma** | `/admin` | HB SaaS |

## Cooperado — barra inferior (4 abas)

| Rota | Label | Recurso |
|------|-------|---------|
| `/dashboard` | Início | dashboard |
| `/notas-pedido` | Entregas | notas_pedido |
| `/precos` | Preços | instituicoes |
| `/ficha-corrida` | Financeiro | ficha_corrida |

HB Créditos **não** está na barra inferior; entra por card no Início e menu **HB Créditos** → `/minha-conta-coop` (piloto mobile pode ter atalho HB Pay).

## Cooperado — menu drawer (hamburger)

| Rota | Label |
|------|-------|
| `/dashboard` | Início |
| `/baixar-app` | Baixar aplicativo |
| `/meu-cadastro` | Meu cadastro |
| `/mensalidades` | Mensalidades |
| `/comunicados` | Avisos |
| `/prestacao-contas` | Prestação de contas |

+ item dinâmico **HB Créditos** → `/minha-conta-coop` quando elegível.

## Cooperado — HB Créditos (sub-rotas)

| Rota | Função |
|------|--------|
| `/minha-conta-coop` | Conta, limite, histórico, PIN |
| `/minha-conta-coop/pagar` | Pagamento com PIN + draft QR |
| `/minha-conta-coop/escanear` | Leitura QR |
| `/minha-conta-coop/receber` | Fluxo receber (quando habilitado) |

Componentes: `src/app/(app)/minha-conta-coop/*`, `src/components/hb-credit/*`.

## Responsável — menu mobile (rodapé gestão)

| Rota | Label |
|------|-------|
| `/dashboard` | Início |
| `/notas-pedido` | Conferir |
| `/ficha-corrida` | Pagar |
| `/livro-caixa` | Caixa |
| `/conta-coop` | HB Créditos |
| `/votacoes` | Votações |
| `/cooperados` | Cooperados |
| `/contratos` | Contratos |
| `/meu-perfil` | Perfil |
| `/relatorios` | Relatórios |

Desktop: `RESPONSAVEL_HREFS` + `DIRETORIA_MENU` (lista maior em `permissions/index.ts`).

## Responsável — HB Créditos (`/conta-coop`)

UI principal: `src/app/(app)/conta-coop/ContaCoopContent.tsx` (abas internas: limites, mercados, liquidação, conferir NF, fila, etc.).

## Outras rotas do monólito (referência backup)

| Área | Rotas |
|------|-------|
| Auth | `/login`, `/cadastro`, `/esqueci-senha`, `/redefinir-senha`, `/baixar-app` |
| Gestão ampla | `/financeiro`, `/fechamento-mensal`, `/pagamentos`, `/entregas`, `/descontos`, `/cotas` |
| Contador | `/contador/dashboard`, conciliação, parecer, dossiê, snapshot |
| Votação | `/votacoes`, `/votacao/[pautaId]` |
| Admin | `/admin` |
| Lab | `/lab/bic`, `/bic-d1-diagnostico` |

## V2 alvo (só HB)

| Papel | Rotas visíveis |
|-------|----------------|
| Cooperado | `/login`, `/minha-conta-coop` (+ filhos), `/meu-perfil` opcional |
| Responsável | `/login`, `/conta-coop`, `/cooperados`, `/cooperados/[id]` opcional |

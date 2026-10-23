# Diagnóstico completo: aparelho Jeferson vs demais cooperados

## O que combinamos vs o que aconteceu

- **Combinado:** o piloto Jeferson (`isCooperadoMobilePilot`) não viraria um “produto paralelo” — só estrela de revisão no header.
- **Feito:** a **experiência** do piloto foi promovida para todos via `isCooperadoMobileGaPromoted` (todo `role === cooperado`).
- **Confusão:** outra conta no **mesmo** celular do Jeferson funciona; Orlando no **seu** celular não. Isso prova que o gap é **aparelho**, não e-mail.

## Diferença exata (camadas)

### 1. Conta (só Jeferson)

| Item | Jeferson | Outros |
|------|----------|--------|
| `isCooperadoMobilePilot` (estrela amarela) | Sim | Não |
| `isCooperadoMobileGaPromoted` (GA mobile) | Sim | Sim |

Nenhum outro ramo de negócio depende do e-mail do Jeferson.

### 2. Runtime (antes do build 378)

| Item | Celular Jeferson (típico) | Outros cooperados (típico) |
|------|---------------------------|---------------------------|
| PWA **instalado** (`standalone`) | Sim | Muitas vezes **não** — só link no Chrome |
| `isCooperadoPwaMobileLeveUi` | Sim | **Não** (exigia standalone) |
| `isCooperadoPwaMessengerMode` | Sim | **Não** |
| UI lê **snapshots** + menos AppData na tela | Sim | Não — mais parse/sync na abertura |
| `data-cooperado-pilot-perf="1"` | Sim | Sim (GA) |

**Essa era a diferença estrutural mais importante:** o Jeferson usava o **modo mensageiro PWA**; quem abria só pelo navegador caía num caminho mais pesado, mesmo com o mesmo login.

**Build 378+:** cooperado GA em viewport mobile ativa **leve + mensageiro** também no navegador (mesmo pacote do PWA do Jeferson).

### 3. Armazenamento local (aparelho “quente”)

O celular do Jeferson acumula, com o uso:

| Chave / conceito | Função |
|------------------|--------|
| `coopeagriplla_session` | Sessão |
| `coopeagriplla_data` | AppData operacional parseado |
| `hb.coop.inicioCard.*` | Card “A receber” instantâneo |
| `hb.coop.pwaInicioDash.*` | Snapshot do Início |
| `hb.coop.pwaFichaResumo.*` | Snapshot Financeiro |
| `hb.coop.pwaEntregasResumos.*` | Snapshot Entregas |
| `hb.coop.readModels.*` | Read models escopados |
| `hb-coop-operacional-synced-build` | Build em que o operacional foi aceito |
| `hb-coop-pwa-snapshots-materialized-build` | Registro de materialização PWA |

Aparelho **frio** (pós-instalação, purge época 3, ou deploy): sem snapshots → abertura dependia de sync; builds 376–377 erraram ao **cortar** a primeira carga ou **fingir** sync sem dados.

**Build 377+:** `scheduleCooperadoGaPrimeiraCargaSilenciosa` — uma carga pós-interação.  
**Build 378+:** `empacotarModeloAparelhoJeferson` — após login/sync, grava o mesmo pacote de snapshots que o Jeferson tem.

### 4. Código de diagnóstico (homolog)

- `buildCooperadoAparelhoJefersonDiagnostico(user)` — relatório JSON + texto.
- Incluído no pacote Orlando (`buildOrlandoFullDiagClipboardText`).
- Lista `modeloJeferson.faltando` quando o aparelho ainda não está alinhado.

## Fluxo alvo (todos = modelo Jeferson)

1. Login cooperado GA → shell imediato (`cooperadoInstantShellReady` / GA).
2. Sem cache local → bootstrap nuvem **silencioso** após interação (`cooperadoGaColdBootstrap`).
3. Após AppData/sync → **empacotar** snapshots + card (`cooperadoAparelhoJefersonPacote`).
4. Sync operacional completo no dia a dia → botão **Atualizar** (sem rajada na abertura).
5. Estrela no header → **somente** Jeferson (`isCooperadoMobilePilot`).

## Links produção

- Login (padrão cooperados): `https://hbcooperativas.vercel.app/login?hb-pwa=<APP_BUILD_VERSION>&next=/dashboard`
- Instalar PWA: `https://hbcooperativas.vercel.app/pwa-launch.html?next=%2Flogin%3Fhb-pwa%3D<build>%26next%3D%2Fdashboard` (ou `start_url` do manifest após deploy)
- Resgate cache: `https://hbcooperativas.vercel.app/pwa-rescue.html`

## Estratégia do agente (paridade financeira mobile)

| Camada | O quê |
|--------|--------|
| **Padrão** | `isCooperadoMobileGaPromoted` = experiência Jeferson; Jeferson só tem estrela + diag |
| **Pacote local** | `empacotarModeloAparelhoJeferson` após login/sync; **605+** reempacota quando AppData aquece |
| **Aparelho frio** | `scheduleCooperadoGaPrimeiraCargaSilenciosa` + recovery financeiro **repete** se valor zerado |
| **Contrato CI** | `npm run test:cooperado-experiencia-jeferson-ga-paridade` + `test:cooperado-financeiro` |
| **Portão piloto** | SIM/NÃO: Início card + Financeiro (valores = Jeferson no mesmo build) |

Checklist antes de push em `cooperado*Finance*` / `empacotarModelo*`: testes acima + `release:verify:fast` fase 1.

## Validar no celular

1. Header: `v<build>` atual.
2. Homolog: pacote diagnóstico → seção **APARELHO vs MODELO JEFERSON** com `paridade_completa: SIM`.
3. Se `faltando: modo_mensageiro` em build &lt; 378 → atualizar app.
4. Se `bootstrap_nuvem: true` → aguardar ~10 s online ou tocar **Atualizar** uma vez.

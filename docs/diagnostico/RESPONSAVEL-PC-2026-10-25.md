# Diagnóstico responsável (PC) — 25/10/2026

## Evidência produção (sem login)

| Verificação | Resultado |
|-------------|-----------|
| `GET /api/client-release` | **build 654**, SHA `255ec61a1c42`, deployment `dpl_5sQnYnn1Nj7AGWaxR8fQsw7Y4ixZ` |
| Tela `/login` | Texto público cita **build 654** (reparar atalho) |
| `homolog-responsavel-operacional-slice-readonly` | CNPJ 62351750000165: **309** fichas, **38** pagamentos, **0** notas no slice API (cadastro cooperados vazio na API) |
| Latência HTTP | `/login` e `/dashboard` ~0,27s (servidor OK) |

Captura automática (agente): login HB Cooperativas mostrando build **654** na caixa «Reparar atalho».

## Sintoma relatado (operador)

- **PC**, menu lateral: troca de rotas **não** (itens 2–3).
- Página **deixa de responder** após abrir gestão.

## Hipótese técnica (código + console interno)

1. **Navegação PC** — otimista mobile misturada com rota única (corrigido em 654).
2. **Main thread** — loops de **sync em background** no desktop (live sync 55s, fila catch-up, idle/visibility) competindo com render ao trocar menu (`scripts/console/diagnostic-travamento-sync.js` documenta travamento + push operacional).

## Ação 655 (planejada)

- **Modo desktop:** desliga sync automático de fundo; mantém abertura + botão **Atualizar** + poll só na Conferir (mobile).
- Gates: `test-staff-gestao-desktop-sync-off`, `responsavel:verify:fase-r`.

## Pós-implantação (checklist)

1. `GET /api/client-release` → build **655**.
2. Login gestão PC → menu Início / Notas / Ficha / Livro troca URL e conteúdo.
3. Se travar de novo: F12 → colar `scripts/console/diagnostic-travamento-sync.js` e enviar JSON ao agente.

# Diagnóstico — “This page couldn’t load” antes do login (out/2026)

## Sintoma

No **ícone (WebAPK)** ou Chrome Android, ao abrir o app **antes de ver o formulário de login**, o Chrome mostra:

> **This page couldn’t load** — Reload to try again, or go back.

Não é uma tela do React: é o **navegador** quando a navegação do documento é **abortada** (`location.replace` / `assign` / `router.replace` no meio do carregamento).

## O que confirmamos (build 733 + V2)

| Verificação | Resultado |
|-------------|-----------|
| `GET /login` | **HTTP 200**, HTML completo com `data-app-build=733` |
| APIs HB / Supabase | Não envolvidas neste sintoma |
| Flag `NEXT_PUBLIC_V2_HB_ONLY` | Aumenta redirect pós-sessão para `/minha-conta-coop` (mais cedo que `/dashboard`) |
| Cursor IDE browser | Pode reproduzir a mensagem nativa (webview); servidor responde OK |

## Causas (ordenadas por probabilidade)

### 1. `staleProfileGuard` no `<head>` (WebAPK + cooperado logado)

- Com `hb-coop-app-build-seen` **atrasado** (ex.: 731 após deploy 733), `veryStale` dispara.
- Para cooperado, chama `hbCoopSilentPwaPurgeThen("/login?hb-pwa=…")`.
- Em standalone, isso faz **`location.replace` imediato** enquanto o documento `/login` ainda carrega → **couldn’t load**.
- O script de ack `hb-pwa` rodava **depois** do guard e não evitava o replace.

**Correção (734+):** ack `hb-pwa` **antes** do guard; guard **não roda em `/login` nem `/`**.

### 2. `GuestRoute` com sessão já salva

- Usuário abre `/login` já autenticado → redirect para home (V2: `/minha-conta-coop`).
- `router.replace` no App Router durante bootstrap do documento aborta a carga (histórico build 731).

**Correção (734+):** saindo de `/login`, sempre `location.assign` com **200 ms** de atraso após `load`.

### 3. Mistura de chunks `dpl_*` (histórico)

- Ver [`PWA-TDZ-REMEDIATION-REPORT.md`](../PWA-TDZ-REMEDIATION-REPORT.md).
- SW atual não intercepta documentos; chunks vão pela rede.
- Se persistir após 734: `pwa-rescue.html` ou limpar dados do site.

## O que **não** é a causa

- Remoção de rotas V2 (ainda não apagamos notas/ficha).
- Perda de compras HB (dados em `hb_credit_*` intactos).

## Como validar no aparelho

1. Abrir `https://hbcooperativas.vercel.app/pwa-crash-forensics.html` no mesmo ícone.
2. Conferir `buildSeen`, `hb-pwa`, `crashLog`.
3. Após deploy **734**: ícone → deve mostrar login ou ir direto à HB sem tela de erro.

## Reparo manual (uma vez)

1. Configurações do Chrome → dados do site → **hbcooperativas.vercel.app** → limpar (ou só cache).
2. Abrir `/login?hb-pwa=<build live>` no browser, logar, reinstalar ícone se necessário.

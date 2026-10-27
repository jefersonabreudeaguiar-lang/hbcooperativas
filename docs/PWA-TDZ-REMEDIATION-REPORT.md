# Relatório — erro PWA “This page couldn’t load” / TDZ cooperado

**Sintoma:** `Uncaught ReferenceError: Cannot access 't' before initialization` em `/_next/static/chunks/40u3sood356_n.js` (e framework `1u9rtov-c8mqr.js`) ao abrir `/dashboard`, principalmente no **ícone instalado (WebAPK)**.

**Dados na nuvem (Jeferson / cooperados):** valores financeiros corretos; falha é **cliente (cache / chunks)**, não Supabase.

---

## Causa raiz (confirmada por forensics v2)

| Evidência | Conclusão |
|-----------|-----------|
| `crashLog` com chunk `dpl_fjCm6fNinBfpWiVnvWDfdR29NpQ6` | JS executado de **deploy antigo** |
| `client-release` com `dpl_uWnDSWw2…` (outro deploy, mesmo build 344) | HTML novo + **chunk velho no cache** do Chrome |
| `buildSeen` 248 → 344 após reparo | Perfil local desatualizado agravava o problema |
| `madge` em 777 arquivos `.ts/.tsx` | **Sem** ciclo de import estático no código-fonte |
| Incógnito / após `pwa-rescue` | Funciona → confirma cache/mistura, não “dado errado” |

**Mecanismo:** Vercel publica várias vezes com o **mesmo `APP_BUILD_VERSION`** mas **`deploymentId` (`dpl_…`) diferente**. O celular guarda chunks `?_next/static/…?dpl=ANTIGO` (cache HTTP imutável / WebAPK). A página seguinte pede `dpl=NOVO` ou carrega ordem de chunks inconsistente → TDZ no bundle minificado → tela preta do Chrome.

---

## Linha do tempo de mitigações (builds 334–346)

| Build | Medida |
|-------|--------|
| 334–340 | `browserProfileRepair`, login `hb-pwa`, `ProtectedRoute` / `AuthProvider` reparo |
| 341 | `pwa-rescue` automático; guard standalone; manifest → `pwa-launch`; atalhos com login preparado |
| 342 | Login canônico `hb-pwa`; `prepareBrowserProfileForPwaInstall`; botão Reparar atalho |
| 343 | Forensics HTML + probe servidor; gravador TDZ; `mixed_dpl` / `cloudAhead` no boot |
| 344 | Guard `buildSeen` antigo; forensics corrige falso `MIXED_DEPLOY` |
| 345 | SW `/_next/static` rede; guard `dpl` chunk; TDZ → reparo auto (**loop**) |
| 346 | Remove loop: sem `cloudAhead` boot, sem TDZ auto-rescue, reparo só WebAPK + `localStorage` `hb-coop-pwa-repair-done-build` |

**Ferramentas:** `/pwa-diag.html`, `/pwa-crash-forensics.html`, `/pwa-console-forensics.html`, `npm run probe:pwa-crash`, `hb-console-forensics-paste.js`.

---

## Correção estrutural (347+)

1. **Dashboard sem `lazyAppRoute`** — menos chunks assíncronos na rota que mais quebra.
2. **Headers `Cache-Control` / `CDN-Cache-Control: no-store`** em `/_next/static/*`.
3. **Service worker** — todas as requisições `/_next/` pela rede (`no-store`).
4. **Boot inline** — se `data-dpl-id` do HTML ≠ `client-release.deploymentId`, **um** reload por sessão.
5. **Removido `hardAlign('mixed_dpl')`** automático (evita reload em falso positivo).

---

## Fluxo padrão cooperado (produção)

1. `https://hbcooperativas.vercel.app/login?hb-pwa=<build>`
2. Ícone (build **726+**): `start_url` → **login direto** (sem `pwa-launch`).
3. Ícone antigo: ainda pode usar `pwa-launch` (caminho rápido, sem purge) até reinstalar.
4. **WebAPK:** guards **não** fazem purge/SW unregister automático (causa “This page couldn’t load”). Reparo manual: `pwa-rescue.html` ou `pwa-launch.html?purge=1`.

---

## O que ainda exige ação manual (uma vez)

- Ícone instalado **antes** do 342–347: remover ícone → reparo → reinstalar.
- **Edge** no PC não conserta WebAPK do **Chrome** no Android.

---

*Atualizado com deploy build 347.*

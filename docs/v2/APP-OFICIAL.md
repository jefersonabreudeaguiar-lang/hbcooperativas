# V2 HB Créditos no app oficial

## URL canônica (cooperado e responsável)

**https://hbcooperativas.vercel.app**

Não é necessário outro domínio para usar a versão nova. O projeto oficial já publica com:

- `NEXT_PUBLIC_V2_HB_ONLY=1` em `vercel.json` e **padrão ligado em produção** (`next.config` + `resolveV2HbOnlyPublicEnv`)
- Na Vercel → Environment Variables: **não** deixe `NEXT_PUBLIC_V2_HB_ONLY=0` no projeto oficial
- Mesmos logins, Supabase e dados HB de sempre

## O que cada perfil vê

| Perfil | Menu | Home após login |
|--------|------|-----------------|
| Cooperado | Início, HB Créditos, Meu cadastro | `/dashboard` (card A receber) |
| Responsável / tesoureiro | HB Créditos, Cooperados, Perfil | `/conta-coop` |
| Admin / contador / parceiro | Fluxos completos (sem corte V2) | Como antes |

Rotas antigas (ex.: `/notas-pedido`, `/ficha-corrida`) redirecionam para a home V2 quando o cooperado ou o responsável tenta abrir pelo histórico.

## Conferir produção

```powershell
curl https://hbcooperativas.vercel.app/api/client-release
```

Esperado: `"v2HbOnly": true` e `build` igual a `src/lib/appBuildVersion.ts`.

```powershell
npm run confirm:production:wait
```

## Link V2 separado (opcional)

Só para cooperados com **ícone PWA corrompido** — ver [NOVO-LINK-COOPERADO-VERCEL.md](./NOVO-LINK-COOPERADO-VERCEL.md). O produto V2 **oficial** é o domínio acima.

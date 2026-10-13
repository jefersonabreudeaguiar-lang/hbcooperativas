# Laboratório (homolog) — espelho seguro antes do site oficial

Objetivo: testar **responsável** e **cooperado** com o mesmo código, em **URL e PWA separados**, sem alterar o app instalado em `https://hbcooperativas.vercel.app`.

## Arquitetura (3 camadas)

| Camada | Oficial | Laboratório |
|--------|---------|-------------|
| **Vercel** | Projeto `hbcooperativas` (main) | Projeto novo, ex. `hbcooperativas-lab` |
| **URL** | `https://hbcooperativas.vercel.app` | `https://….vercel.app` (só do lab) |
| **Supabase** | Produção (`ifptyz…`) | Homolog (`ocyfz…` ou outro projeto) |
| **PWA no celular** | Ícone **HB Coop** | Ícone **HB Lab** (outra origem = outro app) |
| **Dados** | Cooperados reais | Cópia/sync de teste ou seed homolog |

O código já bloqueia scripts destrutivos em produção (`APP_ENV=homolog` + ref Supabase ≠ produção). Ver `scripts/lib/assertNotProductionTarget.mjs`.

## Passo a passo — criar o lab na Vercel

**Guia rápido (dashboard + secrets GitHub):** [`VERCEL-LAB-CRIAR-PROJETO.md`](./VERCEL-LAB-CRIAR-PROJETO.md)

1. **Supabase homolog**  
   - Projeto separado (já usado em `.env.homolog.local` no dev).  
   - Usuários de teste (responsável + cooperado) com senhas conhecidas.

2. **Novo projeto Vercel**  
   - Importar o mesmo repositório `hbcooperativas`.  
   - Nome sugerido: `hbcooperativas-lab`.  
   - **Production Branch:** `hb-cooperativas-lab` (recomendado; não use `main` no projeto lab).

3. **Variáveis de ambiente**  
   - Copiar de [`env-homolog-vercel.template`](./env-homolog-vercel.template) para o projeto **lab** (não no projeto oficial).  
   - `APP_ENV=homolog` e `NEXT_PUBLIC_APP_URL=https://<url-do-lab>` são obrigatórios.

4. **Deploy**  
   - Primeiro deploy do branch `hb-cooperativas-lab`.  
   - Confirmar: `HOMOLOG_APP_URL=https://… npm run confirm:homolog`

5. **Não copiar** `vercel.json` env de produção para o lab — o oficial fixa `APP_ENV=production`; o lab usa só o dashboard da Vercel.

## Cooperado no celular (espelho, não toca no oficial)

1. No celular, abra **só a URL do lab** (nunca a oficial para testar build novo).  
2. Login cooperado de teste → `/dashboard`, notas, financeiro — fluxo completo.  
3. **Instalar PWA:** `/baixar-app` no domínio do lab, ou “Adicionar à tela inicial”.  
   - Manifesto: nome **HB Lab**, `id` com `?hb-env=homolog` — **não substitui** o WebAPK oficial.  
4. Faixa **âmbar** no topo: “HB Lab · ambiente de testes”.  
5. Badge `v{N}` no lab é independente do oficial; atualizar o lab não dispara release shield do app de produção (origem diferente).

## Responsável no lab

- Mesma URL do lab, login de responsável/tesoureiro homolog.  
- Notas (Conferir / Em aberto), Ficha → Pagar, Financeiro — contra dados homolog.  
- Medição RQL (Orlando homolog): segure ~1 s no badge `v…` (quando habilitado para a conta de teste).

## Fluxo de liberação para o oficial

```text
hb-cooperativas-lab (branch) → deploy lab → testes manuais + gates
       ↓
merge hb-cooperativas-lab → main → CI verde → npm run confirm:production:wait
       ↓
cooperados recebem build novo só em hbcooperativas.vercel.app
```

### Gates recomendados antes do merge para `main`

```bash
npm run gate:melhor-performance
npm run test:cooperado-financeiro
npm run test:perf-fluxos          # suíte ampla (opcional em PR grande)
npm run release:verify:fast
```

No lab (browser): checklist em `docs/PROTOCOLO-LIBERACAO-PRODUCAO.md` — 1 cooperado + 1 responsável nos fluxos alterados.

## Desenvolvimento local como lab

```bash
# Copiar credenciais homolog (não commitar)
cp .env.homolog.local .env.local
# Garantir APP_ENV=homolog e NEXT_PUBLIC_APP_URL=http://localhost:3000

npm run dev
npm run lab:check-homolog
```

## Referências

- Produção oficial: `.env.production-official.example`, `npm run confirm:production`
- Fase 0 / lab scripts: `docs/FASE-0-LINHA-BASE.md`, `scripts/lab/*`
- Filosofia: `docs/FILOSOFIA-PRODUCAO.md`

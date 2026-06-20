# Publicar o site grátis (Vercel)

O app **HB Cooperativas** funciona de graça na [Vercel](https://vercel.com) (plano Hobby). Assim o cooperado acessa pelo celular com um link público, sem depender do Wi‑Fi do computador.

## 1. Conta na Vercel

1. Acesse [vercel.com/signup](https://vercel.com/signup) (pode entrar com GitHub, Google ou e-mail).
2. Plano **Hobby** = gratuito.

## 2. Enviar o código

**Opção A — pelo site (mais fácil)**

1. Crie um repositório no GitHub com o conteúdo da pasta `coopeagriplla-gestao`.
2. Na Vercel: **Add New → Project → Import** o repositório.
3. Framework: **Next.js** (detectado automaticamente).
4. Root Directory: raiz do projeto (onde está o `package.json`).

**Opção B — pelo terminal**

```bash
cd coopeagriplla-gestao
npx vercel login
npx vercel
```

Na primeira vez, responda às perguntas (nome do projeto, etc.). Depois:

```bash
npx vercel --prod
```

## 3. Variáveis de ambiente (obrigatório)

No painel Vercel: **Project → Settings → Environment Variables**

| Nome | Valor |
|------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://ifptyzikekrswippzmsf.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | chave publishable do Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | chave secret do Supabase |

Copie as chaves em **Supabase → Project Settings → API** (mesmas do `.env.local`).

Marque as três para **Production**, **Preview** e **Development**. Depois clique **Redeploy** no último deploy.

## 4. Supabase

A tabela `cooperativas` já deve existir (SQL em `supabase/migrations/20260320120000_cooperativas.sql`).  
Veja também `SUPABASE_SETUP.md`.

## 5. Testar

- URL do site: algo como `https://seu-projeto.vercel.app`
- Cadastro responsável: `/cadastro` → **Sou Responsável**
- Cooperado no celular: `/cadastro` → **Sou Cooperado** (mesmo link, qualquer rede)

## Limites do plano grátis

- Tráfego e builds generosos para cooperativa pequena/média.
- Dados de cooperados/entregas ainda ficam no **navegador** (localStorage), exceto **CNPJ da cooperativa** na nuvem (Supabase).

## Problemas comuns

| Problema | Solução |
|----------|---------|
| CNPJ não encontrado | Cadastre a cooperativa em **Sou Responsável** ou publique em **Perfil da cooperativa** |
| Página em branco após deploy | Confira as 3 variáveis de ambiente e faça redeploy |
| Build falhou | Rode `npm run build` no PC e corrija erros antes de subir |

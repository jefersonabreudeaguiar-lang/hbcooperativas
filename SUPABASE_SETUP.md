# Configurar Supabase (CNPJ na nuvem)

Com o Supabase ativo, o cadastro da cooperativa fica na nuvem e o CNPJ **funciona em qualquer dispositivo**.

## 1. Criar projeto

1. Acesse [supabase.com/dashboard](https://supabase.com/dashboard)
2. **New project** → anote a senha do banco
3. Em **Project Settings → API**, copie:
   - Project URL
   - `anon` `public` key
   - `service_role` key (secret — nunca no frontend)

## 2. Criar tabela

No Supabase: **SQL Editor → New query**, cole o conteúdo de:

`supabase/migrations/20260320120000_cooperativas.sql`

Clique **Run**.

## 3. Variáveis de ambiente

Na pasta do projeto:

```bash
cp .env.local.example .env.local
```

Edite `.env.local` com suas chaves e reinicie o servidor:

```bash
npm run dev
```

## 4. Testar

1. **Cadastro → Sou Responsável** — registre a cooperativa (ex.: CNPJ `62.351.750/0001-65`)
2. No Supabase → **Table Editor → cooperativas** — deve aparecer a linha
3. Em outro celular ou aba anônima → **Sou Cooperado** — o mesmo CNPJ deve ser encontrado

## Sem Supabase

Se `.env.local` não existir, o app continua funcionando **só neste navegador** (modo local).

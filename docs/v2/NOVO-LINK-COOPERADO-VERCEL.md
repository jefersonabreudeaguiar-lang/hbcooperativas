# Novo link V2 para cooperados (evitar “This page couldn’t load”)

## Por quê um link novo?

O erro **“This page couldn’t load”** no ícone Android vem de **WebAPK + cache** preso ao domínio antigo (`hbcooperativas.vercel.app`), não de perda de dados HB. Um **domínio novo** na Vercel = perfil de site limpo + PWA novo.

## Variáveis mínimas (projeto V2)

```env
NEXT_PUBLIC_APP_URL=https://hbcooperativas-v2.vercel.app
NEXT_PUBLIC_V2_HB_ONLY=1
NEXT_PUBLIC_CONTA_COOP_UI_PUBLIC=1
NEXT_PUBLIC_HB_CREDIT_ENABLED=true
HB_CREDIT_ENABLED=true
# Copiar do projeto oficial: AUTH_SECRET, SUPABASE_*, etc.
```

## Passo a passo (Vercel)

1. **Novo projeto** no mesmo time: `hbcooperativas-v2` (ou nome que preferir).
2. Conectar o **mesmo repositório** GitHub; branch **main**.
3. **Environment Variables (Production):** duplicar do projeto oficial e definir:
   - `NEXT_PUBLIC_APP_URL` = `https://hbcooperativas-v2.vercel.app` (URL real do projeto)
   - `NEXT_PUBLIC_V2_HB_ONLY` = `1`
   - Mesmos `AUTH_SECRET`, Supabase, `HB_CREDIT_*` do oficial (mesmos logins).
4. Deploy Production → anotar URL canônica.
5. Rodar migration na nuvem (se ainda não): `supabase/migrations/20261027143000_hb_credit_manual_valor_bruto.sql`.

## Cooperado

1. **Remover** ícone antigo “HB Cooperativas” (se existir).
2. Abrir no Chrome: `https://<seu-projeto-v2>.vercel.app/login`
3. Entrar com e-mail/senha de sempre.
4. **Adicionar à tela inicial** de novo a partir desse link.

## Responsável

- Pode usar o **mesmo link V2** ou continuar no domínio antigo até alinhar comunicação.
- Valor bruto manual: **HB Créditos → Limites** (coluna “Valor bruto (manual)”).

## Verificação

```powershell
npx tsx scripts/confirm-production-deploy.ts --url https://hbcooperativas-v2.vercel.app --wait
```

## Oficial vs V2

| | Domínio antigo | Domínio V2 (novo) |
|--|----------------|-------------------|
| Cooperado PWA | Cache legado | Recomendado |
| `V2_HB_ONLY` | Pode estar ligado no mesmo domínio | Sempre `1` |
| Dados HB / login | Mesmo Supabase | Mesmo Supabase |

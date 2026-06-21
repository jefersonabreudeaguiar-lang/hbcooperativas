# HB Cooperativas

Plataforma web para gestão de cooperativas de agricultura familiar. Portal do Cooperado e Painel Administrativo com controle de entregas, PNAE, pagamentos, mensalidades, cotas e relatórios financeiros.

**HB Cooperativas** é o nome da plataforma. O nome de cada cooperativa aparece dinamicamente conforme o cadastro vinculado ao CNPJ.

## Tecnologias

- **Next.js 16** (App Router)
- **TypeScript**
- **Tailwind CSS**
- Dados mockados com **localStorage**

## Como Executar

```bash
cd coopeagriplla-gestao
npm install
npm run dev
```

Acesse: [http://localhost:3000](http://localhost:3000)

No celular (mesma Wi‑Fi): `http://SEU-IP:3000` (ex.: `http://192.168.1.7:3000`)

## Site grátis na internet (Vercel)

Para cooperados acessarem de qualquer lugar (4G/Wi‑Fi), publique na Vercel (plano gratuito):

→ Guia completo: **[DEPLOY.md](./DEPLOY.md)**

Resumo: conta em [vercel.com](https://vercel.com) → importar projeto → configurar as 3 variáveis do Supabase → deploy.

## Fluxo de Cadastro

1. **Responsável** acessa **/cadastro** → aba **Sou Responsável** → cadastra CNPJ, nome da cooperativa e cria conta de acesso
2. **Cooperado** acessa **/cadastro** → aba **Sou Cooperado** → informa o **CNPJ da cooperativa**
3. Se o CNPJ existir, o **nome da cooperativa aparece** automaticamente
4. Cooperado completa e-mail, senha e dados pessoais e entra no portal

## Contas de Demonstração

| Perfil        | E-mail                          | Senha    |
|---------------|---------------------------------|----------|
| Administrador | admin@hbcooperativa.org.br      | admin123 |
| Tesoureiro    | tesoureiro@hbcooperativa.org.br | tes123   |
| Responsável   | responsavel@hbcooperativa.org.br | pres123  |
| Cooperado     | jose.silva@email.com            | coop123  |

**CNPJ de teste para cadastro de cooperado:** `12.345.678/0001-90`  
(Cooperativa Agrícola Familiar Primavera)

## Sessão Persistente

Após login ou cadastro, o usuário permanece logado até clicar em **Sair**.

## Resetar Dados Mock

```javascript
localStorage.removeItem('coopeagriplla_data');
localStorage.removeItem('coopeagriplla_session');
location.reload();
```

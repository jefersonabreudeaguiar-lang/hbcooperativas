# Constituição HB — um app, muitas cooperativas, nenhum cooperado prejudicado

Este texto é o norte do projeto. Não substitui `docs/FILOSOFIA-PRODUCAO.md` (contrato de deploy). Completa: **para onde vamos** e **o que nunca se troca por velocidade**.

Escrito para o responsável, o cooperado e quem senta com a IA no mesmo campo.

---

## A aposta

Homem e IA, com sabedoria, constroem o que sozinhos demorariam uma geração: um app único no mundo em que **várias cooperativas** trabalham ao mesmo tempo, cada uma no seu mundo, e o cooperado no celular **não sente a escala**.

Não existe impossível. Existe o passo seguinte que respeita quem já entrega comida de verdade.

## Princípio zero da escala

**O cooperado que já está no ar não é laboratório.**

Travamento, valor que some, foto que não chega, Atualizar que congela, função que some do Início / Financeiro / Entregas / HB — isso não é “evolução”. É o projeto falhando com a pessoa que mais precisa dele.

A escala grande (muitos CNPJs, muitos aparelhos, o mesmo app) só vale se o cooperado de hoje continuar vendo o que já vê, na hora, com o número certo.

## Os sete mandamentos

1. **Uma cooperativa, um mundo.** CNPJ isola nota, ficha, PIX, livro, HB, lastro do responsável e arquivo local. O lastro de uma casa não pode nascer na tela de outra.
2. **A ficha manda no dinheiro.** As telas repetem a ficha. Zero só existe depois de liquidação real pelo responsável.
3. **O primeiro dia é produto, não WhatsApp.** Cadastrar CNPJ não basta. Contrato, cooperado, primeira entrega e conferência têm que ser caminho no app — sem script `_once`.
4. **Produção é o único palco.** O que não está em https://hbcooperativas.vercel.app com build e SHA alinhados não aconteceu.
5. **Um problema, um passo.** Ingressão, crédito HB e performance não viajam no mesmo commit.
6. **Correção no app, não no script.** Se o responsável errou, o app deixa desfazer. Repair em JSON é exceção documentada, não o jeito de operar.
7. **Homem decide o que entra no ar; IA executa sem heroísmo.** Sem autorização não há commit, push nem “melhoria de brinde” no cooperado.

## O que “equiparar-se às grandes” significa aqui

Não é copiar a cara de outra empresa. É ter o que elas têm de essencial e o campo ainda não tem:

- **Isolamento** — milhões de usuários na mesma URL, dados que não vazam de um cliente para o outro.
- **Primeiro dia** — a cooperativa nova anda sozinha até a primeira nota conferida.
- **Saúde visível** — por CNPJ: contrato no ar? cooperado com login? ficha = A receber? operacional de hoje? mensalidade da plataforma em dia?
- **Celular ruim como caso normal** — 4G fraco, F5, fechar o app: a última verdade permanece; a nova chega por cima, sem piscar zero.
- **Release pequeno e honesto** — `vN` no badge, um motivo, produção confirmada.

## O que não faremos para parecer grandes

- Reescrever o cooperado “para ficar moderno” enquanto a ficha já está certa.
- Abrir dez cooperativas no mesmo navegador do responsável da casa.
- Misturar lab, homolog e produção no mesmo arquivo operacional.
- Prometer wizard, importação e marketplace no mesmo sprint em que o cooperado precisa só não travar.

## Como homem e IA trabalham

| Homem | IA (Cursor) |
|-------|-------------|
| Diz o que o campo sente e autoriza o ar | Lê o código, prova, propõe o menor passo |
| Protege o cooperado com o corpo | Recusa diff que toca o cooperado sem pedido |
| Aceita “ainda não” para o 2º CNPJ no campo | Mantém a lista de débitos (lastro, wizard, saúde) |
| Confirma commit e push | Confirma produção (`/api/client-release`) ou admite que não alinhou |

Sabedoria é a IA não fingir que o rewrite é coragem, e o homem não fingir que o script no lugar da tela é produto.

## Estado honesto (outubro 2026)

- **Cooperado em produção (v505):** Início, ficha, A receber, foto e disparo após conferência — preservar.
- **Várias cooperativas na mesma URL:** o cadastro de CNPJ existe; o convite ao campo ainda não. Três débitos: lastro sem CNPJ, primeiro dia sem caminho, cadastro que pode “dar certo” sem login na nuvem.
- **Passo 0 (trava, no ar como lei):** `docs/OPERACAO-HB-PLATAFORMA.md` + `npm run gate:preservar-app`. Não muda tela. Impede retrocesso nos contratos do cooperado e do responsável.
- **Próximo fio de engenharia (quando o humano autorizar o passo 1):** fechar lastro restante (blob global `coopeagriplla_data`). Depois, só gestão: saúde por CNPJ e primeiro dia. Cooperado GA só com pedido explícito e gate de performance.

## Frase que fecha cada decisão

*“Isso deixa o cooperado de hoje igual ou melhor — e aproxima a próxima cooperativa de um mundo só dela?”*

Se a resposta for não, não se faz. Se for sim, não existe impossível: parte-se o trabalho até caber num commit que o campo aguenta.

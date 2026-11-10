# 805 — conferência de entregas e atualização do Financeiro

Base: 804. Cobranças 801 continuam fora deste pacote.

## Correções

- Uma nova foto recebe ID de ficha próprio. Retry da mesma foto mantém o ID. O fallback anterior podia reutilizar o ID de outra foto e perder uma linha na mescla por ID.
- Consolidação mantém preço, unidade e precisão da quantidade; só agrupa quando bruto, desconto e líquido permanecem exatamente iguais à soma das linhas de origem.
- Fechamento impede fotos ausentes, IDs repetidos e totais incompatíveis. Erros aparecem no formulário sem substituir os lançamentos anteriores. Fichas antigas não substituem os itens recém-conferidos.
- Digitação usa estado local, preserva o último dígito e evita atualizar o painel inteiro a cada troca de campo.
- Financeiro do cooperado exige consulta da ativação atual antes de mostrar valores; erro de consulta não vira saldo zero. Leitura completa dos cadastros com concorrência limitada.

## Conferência oficial somente em leitura — 10/11/2026

339 notas com itens: bruto salvo coincide com quantidade × preço registrado. 21 diferenças entre desconto salvo e cálculo por linha, de R$ 0,01 a R$ 0,04 (incluindo canceladas e pagas); não houve reescrita histórica.

374 notas SQL comparadas com 293 fichas do operacional. 53 diferenças estavam associadas exclusivamente a fichas pagas. Essa comparação não prova completude: a nota nova de Jeferson ainda não tinha suas fichas nesse arquivo do operacional.

Conferência visual das 25 fotos da nota 2026-0372 de Jeferson: alface 174 un; coentro/cebolinha 12 mç; abóbora 98 kg; batata-doce 89 kg; laranja 463 kg; melancia 76 un; pepino 20 kg. Todos coincidem com os itens salvos. Preços registrados: 5,94; 5,66; 5,71; 7,93; 8,45; 32,00; 8,16. Bruto R$ 8.874,38; desconto por linha R$ 443,73; líquido da nota R$ 8.430,65. A afirmação de 86 melancias não foi comprovada nas fotos, portanto o saldo não foi aumentado.

Três entregas novas de Idelcy: fotos de 90, 120 e 30 ovos conferidas contra os itens salvos; quantidades e totais coincidem. Não foram alterados dados financeiros oficiais.

## Verificação e publicação

Testes incluem 1.500 combinações multi-foto, preços diferentes, unidades, milésimos de quantidade, serialização/mescla, retry, fechamento, ficha e resumo. Casos inválidos devem ser recusados sem mutação. Suíte completa, typecheck, build na homologação e verificação da versão oficial exigidos antes de concluir a publicação.

Retorno de código: redeploy da 804, preservando os dados da nuvem. Sem migration, sem reprecificação histórica e sem mudança em pagamentos.

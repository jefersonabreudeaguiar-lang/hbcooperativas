# 804 — identificação do cooperado nas fotos de entregas

Base oficial 803: 8efdf961f4350d2789d19b3cd4e59f4a26d498f4. Não inclui cobranças 801.

## Evidência e correção pontual na nuvem

Foram encontrados 20 registros pendentes no CNPJ 62351750000165 com `cooperado_nome` e `cooperadoNomeSnapshot` iguais a “Desconhecido”. Os quatro IDs foram conferidos diretamente nos arquivos `hb-cooperados/<CNPJ>/<ID>.json`, sem comparação aproximada de nomes. Correspondem a Francisco Ribeiro Da Silva (15 entregas), Idelcy Araújo da Silva (3), Jeferson Abreu de Aguiar (1) e Izaque Alves de andrade (1).

A atualização SQL foi limitada à cooperativa, aos quatro IDs, ao status pendente e aos dois campos genéricos. A consulta de retorno verificou que o payload só mudou no nome, preservando status, ID do cooperado, fotos, itens e valores. A nova leitura agrupada confirmou os 20 nomes corretos. Não houve escrita nos arquivos de fotos ou no operacional financeiro.

## Proteção permanente

- Nome genérico ou identificador interno deixa de ser tratado como nome válido.
- Upload por foto, JSON de entrega e upsert SQL consultam o cadastro por ID dentro da cooperativa. Nome confirmado no cadastro prevalece sobre o enviado pelo aparelho.
- Sem nome confirmado nem snapshot válido, uma entrega pendente é recusada com erro explícito, sem inventar titular ou publicar “Desconhecido”. O fluxo de envio deve manter a pendência para nova tentativa.
- A fila e os dois painéis da foto usam a mesma resolução com cadastro e snapshot, sem buscar nome em outra cooperativa.
- Um merge mais recente contendo placeholder não substitui snapshot válido. Homônimos sem documento comum não são agrupados por simples igualdade de nome.
- A prova de reentrada é vinculada à versão atual, para executar leitura completa ao trocar de build.

## Verificação e implantação

Teste de autoria com cadastro exato, placeholder, recuperação por snapshot, indisponibilidade, outra cooperativa, homônimos, preservação da imagem/valor/ID e merge de cache antigo. Regressões de entrada, quota, contador, financeiro, HB e imagens. TypeScript e build de homologação precedem liberação oficial. A correção dos 20 nomes já foi feita; a proteção de código exige publicação da 804 com OK específico. Retorno de código para 803 preserva os nomes corrigidos e todos os lançamentos.

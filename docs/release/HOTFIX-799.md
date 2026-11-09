# Hotfix 799 — entrada da gestão confirma a nuvem

Base oficial 798: `8f057ca0db7a9379d2e54dd68bfe105c38f98328`.

Problema: a sessão normal conserva fichas e notas antigas que não existem na
sessão anônima. A entrada consultava a nuvem, mas mesclava esses registros com o
cache antigo e o fallback baseado em contagens podia recolocá-los na leitura.

A entrada agora exige leitura completa bem-sucedida das entregas e financeiro.
SQL e Storage são paginados; erro de listagem, download ou JSON invalida a
confirmação. A listagem explícita de confirmação não repara nem publica notas.
Coleções explicitamente fornecidas de fichas, avulsos e ajustes prevalecem sobre
cópias anteriores do aparelho. Domínio omitido nunca significa coleção vazia.
Alterações realizadas depois do início da consulta são preservadas. A consulta
continua sem publicar dados na nuvem.

Notas já resolvidas na nuvem prevalecem sobre cópias antigas, inclusive filas de
upload antigas. Fotos ainda não publicadas ficam guardadas como rascunho, fora da
fila de conferência. Filas de publicação e imagens offline permanecem intactas.
Falha na leitura da fila offline bloqueia a confirmação em vez de supor fila vazia.

Versões anteriores substituídas são guardadas em cópia local compactada por CNPJ,
fora do painel ativo e sem republicação automática. Falha ao guardar essa cópia
interrompe a entrada. O cache de leitura e o fallback local são atualizados juntos,
evitando que uma quantidade maior de registros antigos vença a resposta atual.

Não altera pagamentos, recibos, compras, limites, dados ou esquema oficiais.
Testes cobrem cache normal versus privado, pago versus pendente, filas antigas,
rascunhos, upload offline, alterações concorrentes, domínios omitidos e isolamento
entre cooperativas. Regressões de autorização, financeiro e conferência incluídas.

Publicar primeiro Preview no projeto de homologação, depois o mesmo SHA no projeto
oficial. Conferir a identidade da publicação e impressão digital operacional antes
e depois. Retorno somente do tráfego à 798: `dpl_5Hg7W9PUjFRYpYTxdmWokhd4EWrY`.
Não restaurar um arquivo operacional antigo sobre novos pagamentos.

# 803 — armazenamento cheio e reentrada confirmada

Base oficial 802, commit 5f405b9482dce14c37994575d776cd9f5924b7fb. As mudanças de cobrança 801 não fazem parte deste pacote.

## Correção

Quando a gravação do cache da gestão encontra quota, o app também compacta as cópias JSON legadas e os lastros conhecidos da própria aplicação. Antes de substituir uma chave, verifica que a descompactação reproduz exatamente o texto original. Não remove nenhuma chave, não mexe na fila de fotos, sessão ou credenciais e não descarta lançamentos ou comprovantes. Falhas de gravação preservam a cópia anterior. Se a migração do JSON legado não puder ser gravada, ele continua disponível para leitura, evitando tratar dados locais pendentes como uma base vazia.

O script inicial de pré-leitura deixa de entregar o JSON global legado a sessões de gestão; essas sessões usam a leitura normal por CNPJ.

Uma entrada completa bem-sucedida registra uma prova do conteúdo local e da revisão aplicada. Na reabertura, o app pode evitar baixar novamente todas as notas e o financeiro se o conteúdo local, a revisão atual da nuvem e os cadastros consultados coincidirem. Edições locais, mudanças simultâneas, outra conta/cooperativa ou indisponibilidade da nuvem invalidam essa via. O app continua mostrando valores apenas após confirmação remota. Não promete latência zero: conexão e servidor continuam necessários.

## Validação

- Simulação de quota por origem com JSON global antigo, base por cooperativa e nova base da nuvem: a gravação volta a funcionar sem remover chaves.
- Imagem local pendente e recibo preservados byte a byte após descompactação; sessão, filas e chaves de outros serviços intactas.
- Migração sem espaço continua retornando a origem preservada.
- Prova da reentrada exige conteúdo e nuvem atuais, recusa offline, outra conta, edição local e corrida durante a consulta.
- Regressões de entrada, contador, pagamentos, HB Créditos e imagens.

Se o armazenamento físico ou as permissões impedirem qualquer gravação mesmo após compactação, o app ainda sinaliza falha de persistência; não declara que um lançamento foi salvo. Nenhuma limpeza forçada ou confirmação financeira foi introduzida. A homologação e o OK específico precedem publicação oficial. Retorno para 802 altera somente código, sem restaurar dados antigos.

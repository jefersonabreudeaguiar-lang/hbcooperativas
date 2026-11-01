# Responsável V1 — build 772

Medição read-only com 26 cooperados e registros reais mostrou preparação da lista de Pagar consumindo 3942 ms, além de projeção de cerca de 1012 ms. Resolução de IDs repetia milhares de buscas por cadastro/notas; resumo individual percorria dados de toda a cooperativa.

Cache temporário de resolução de cooperado limitado a uma leitura síncrona, liberado em finally (não sobrevive a mudanças ou sessões). Resumos individuais passam pela mesma seleção por cooperado já usada no financeiro remoto. Filas de Pagar reutilizadas por AppData, revisão, cooperativa e mês; mudança dos dados ou revisão invalida cache. Guardas de cooperado e aba inativa permanecem antes de qualquer leitura coletiva.

Benchmark após ajuste: projeção 677 ms, filas 882 ms e repetição <1 ms. Comparação do resumo completo anterior x novo em 26 cooperados reais: todos iguais. Os números são de execução local dos serviços com dados da nuvem, não de latência total de navegação. Nenhum dado remoto alterado. Activity da v771 preserva telas visitadas e pausa efeitos ocultos.

Validação: cache por lote/nested/finally, IDs por cooperativa; filas por papel, inatividade, retomada, alteração dos dados e cooperativa; 39 invariantes E2E; 16 cenários de preservação de pagamentos; paridade financeira e descontos; build. Validação final de navegação após publicação.

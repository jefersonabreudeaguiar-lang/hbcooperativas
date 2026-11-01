# Cooperado V1 — build 767

Corrige resumo remoto que usava somente fichas operacionais existentes e omitia notas conferidas sem ficha sincronizada. Após reunir notas da tabela e Storage, reconcilia fichas em memória usando o serviço canônico antes do cálculo financeiro. Não grava nem altera lançamentos na nuvem.

Auditoria somente leitura de Jeferson: nota np_1792435790863_bumwp conferida, bruto 2719,38 e líquido 2583,41, estava sem ficha. Total correto: bruto 3232,56; cooperativa 161,63; entregas líquidas 3070,93; HB 550,55; líquido a receber 2520,38. Corrige a conclusão incompleta da auditoria da versão 766.

Regressão: nota conferida sem ficha passa a entrar no resumo; fonte preservada; segunda reconciliação não duplica a entrega. Cenários HB, avulsos, estornos, zero e isolamento mantidos.

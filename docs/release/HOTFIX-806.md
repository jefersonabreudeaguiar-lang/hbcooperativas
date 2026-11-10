# 806 — Tab na conferência de entregas

Na 805, a atualização do painel podia ocorrer após 400 ms mesmo com um campo de quantidade em foco. Na 806, Tab e Shift+Tab seguem a ordem nativa do navegador. Enquanto o foco está dentro da tabela, ela não dispara a atualização do painel; ao sair, envia somente o rascunho mais recente. A digitação atualiza a referência usada pela aprovação imediatamente, e a atualização visual de linhas e totais tem prioridade menor.

Comparação no navegador com a tabela real e 40 produtos fictícios: a 805 atualizou o painel com o cursor ainda no campo; a 806 manteve zero atualizações durante a pausa e a troca de campos. Tab e Shift+Tab moveram o foco corretamente. A aprovação simulada recebeu 86, 12,345 e 7, e o painel recebeu uma atualização após sair da tabela. O teste mede o trabalho agendado, sem prometer uma latência igual em todos os dispositivos.

Validação local: 37 suítes e TypeScript. O pacote não muda o cálculo, o fluxo de gravação ou o banco. Retorno de código: versão 805, sem restaurar dados.

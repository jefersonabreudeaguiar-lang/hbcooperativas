# Responsável V1 — build 770

Navegação da gestão passa pelo roteador Next também no celular: desativa o atalho que alterava history.replaceState e exibida cache antes da conclusão da rota. Evita endereço, contexto da rota e painel divergentes durante trocas rápidas.

Prefetch mobile compartilhado entre os dois bootstraps. Inicia após 4 segundos, uma rota a cada 1,5 segundo, somente enquanto a página está visível. Remove importação simultânea de seis telas pesadas durante abertura. Carregamento sob demanda e dados financeiros preservados.

Validação: teste com timers controlados confirma coalescência de dois assinantes, ausência de trabalho inicial, uma rota por etapa, cancelamento e nenhum atalho de histórico no mobile. Testes existentes de navegação desktop, troca de abas e desempenho do responsável aprovados. Verificação visual após publicação.

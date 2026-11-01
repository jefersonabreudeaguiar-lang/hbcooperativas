# Responsável V1 — build 771

O cache antigo guardava children do App Router e mantinha só uma aba montada. A volta reconstruía o componente e perdia estado. Gestão mobile agora mantém componentes de folha das seis abas frequentes com identidade estável: Início, Conferir, Pagar, Livro caixa, Cooperados e HB Créditos. Só monta telas visitadas; até seis entradas. Activity do React preserva estado/DOM e pausa efeitos e assinaturas nas abas ocultas. Desktop mantém rota única. Componentes não recebem cache do invólucro LayoutRouter. Cache reiniciado na troca de usuário ou cooperativa.

Navegação permanece pelo Next, sem alterar histórico antecipadamente. Aquecimento gradual da v770 preservado. Nenhuma regra ou lançamento financeiro alterado.

Validação: TypeScript, compilação e lint do componente; cache LRU/pins, viewport desktop, isolamento de CNPJ, navegação e prefetch gradual. Testes de fonte foram atualizados para exigir Activity em lugar da antiga restrição de uma única árvore montada. Validação de DOM e preservação do formulário após publicação.

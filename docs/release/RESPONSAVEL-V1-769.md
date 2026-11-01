# Responsável V1 — build 769

Sessão real na v768 mostrou fichas mas nenhum cadastro em Cooperados e Contratos e Perfil sem vínculo. Bootstrap staff recupera a cooperativa por CNPJ e sincroniza cooperados e contratos uma vez após abrir a sessão, sem puxar o operacional completo. Vínculo por CNPJ normalizado resolve IDs de cooperativa anteriores à restauração em todas as abas que usam getUserCooperativaId. Preserva vínculo explícito quando não há CNPJ correspondente; não escolhe outra cooperativa arbitrariamente.

Validação: teste de vínculo restaurado por CNPJ e ausência de correspondência; isolamento na troca de CNPJ; prefetch desktop; contrato Conferir entregas; compilação. Validação visual depois da publicação.

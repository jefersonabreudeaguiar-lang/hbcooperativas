# Ponto de restauração — conferência de notas

## O que mudou (2026-09-23)

- **Funcionalidade** de lançamento/conferência restaurada para o estado do commit `5c8e7e0` (última versão estável antes das alterações de performance/multi-foto/persistência em `e8f9afe` … `c034b57`).
- **Layout mantido da versão nova:** foto da nota fixa/centralizada; painel de lançamento de itens com scroll (`fix(ui): conferência com foto centralizada e scroll só no lançamento`).

## Voltar à versão anterior a esta mudança

Use a tag anotada no commit `c034b57`:

```bash
git checkout restore/pre-conferencia-backup-2026-09-23 -- "src/app/(app)/notas-pedido/NotasPedidoContent.tsx"
```

Ou restaure o arquivo inteiro desse commit:

```bash
git show c034b57:"src/app/(app)/notas-pedido/NotasPedidoContent.tsx" > "src/app/(app)/notas-pedido/NotasPedidoContent.tsx"
```

## Voltar ao backup funcional + UI centralizada (esta versão)

```bash
git show 5c8e7e0:"src/app/(app)/notas-pedido/NotasPedidoContent.tsx" > "src/app/(app)/notas-pedido/NotasPedidoContent.tsx"
```

## Referência de commits

| Commit    | Descrição |
|-----------|-----------|
| `5c8e7e0` | UI foto central + scroll itens; fluxo de lançamento estável |
| `e8f9afe` | Concluir entrega sem esperar nuvem (início das mudanças de fluxo) |
| `2dc1dc7` | Multi-foto / concluir entrega |
| `e6298a6` / `c034b57` | Persistência / quota localStorage |

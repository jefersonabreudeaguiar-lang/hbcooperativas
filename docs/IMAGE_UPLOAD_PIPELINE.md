# Pipeline de upload de fotos (HB Cooperativas)

## Problema

Celulares simples estouravam memória ao anexar fotos de entrega: base64 grande no `localStorage`, múltiplas cópias do arquivo original e preview pesado.

## Arquitetura

```
Seleção → validateImageFile → processDeliveryImage (compress + thumbnail)
       → preview via blob: URL (nunca base64)
       → online: uploadImageToSupabase (FormData, sem base64)
       → offline: IndexedDB (hb_cooperativas_media / pending_delivery_images)
       → metadados leves em NotaPedido.fotosMeta
```

### Serviços

| Arquivo | Função |
|---------|--------|
| `src/services/imagePipelineService.ts` | Validação, compressão WebP/JPEG (1280px), thumbnail 320px, upload, migração legado |
| `src/services/offlineImageQueueService.ts` | Fila offline em IndexedDB + retry |
| `src/services/notaPedidoCloudService.ts` | `uploadFotoBlobToCloud`, `syncOfflineDeliveryImages` |

### Metadados na nota (`fotosMeta[]`)

Apenas campos leves: `id`, `storagePath`, `url`, `thumbnailUrl`, `mimeType`, `sizeBytes`, `width`, `height`, `status`, `createdAt`.

Imagens ficam no bucket Supabase **`hb-entregas`**. O `localStorage` não guarda blobs nem base64 de fotos novas.

### Compatibilidade

- Fotos antigas em `fotosEntrega[]` (base64) continuam legíveis via `getFotosExibicaoNota`.
- `migrateLegacyBase64Images()` converte para Storage ao reenviar/editar.

### UI (`NotasPedidoContent`)

Estados: Preparando → Comprimindo → Enviando → Sucesso. Botões: Tirar outra foto, Remover, Tentar novamente. Uma foto por vez (`AbortController`).

## Testes

```bash
npm run test:image-pipeline
npm run test:entregas
```

Cenários manuais recomendados: 1 MB, 5 MB, 15 MB, PNG grande, offline, troca de foto durante envio, retry após falha.

## Logs

Somente em `development`: tamanho original/comprimido, % redução, tempo de compressão. Sem dados pessoais.

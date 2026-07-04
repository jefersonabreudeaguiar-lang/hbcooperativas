import type { AppData, NotaPedido } from "@/types";
import { dataUrlToBlob } from "@/utils/fotoEntrega";
import { putLocalNotaMedia } from "@/services/localMediaStore";
import { isInlineDataUrl } from "@/utils/mediaHelpers";

function notaPrecisaMigrarMidia(nota: NotaPedido): boolean {
  if (nota.fotoNaNuvem) return false;
  if (nota.status === "conferida" || nota.status === "pago" || nota.status === "rejeitada") {
    return false;
  }
  if (isInlineDataUrl(nota.fotoPedido)) return true;
  if (nota.fotosPedido?.some(isInlineDataUrl)) return true;
  if (isInlineDataUrl(nota.fotoPedidoMiniatura)) return true;
  if (nota.fotosPedidoMiniaturas?.some(isInlineDataUrl)) return true;
  return false;
}

async function migrarNotaMidia(nota: NotaPedido): Promise<NotaPedido> {
  let next = { ...nota };
  const fotos = nota.fotosPedido ?? (nota.fotoPedido ? [nota.fotoPedido] : []);
  const thumbs = nota.fotosPedidoMiniaturas ?? (nota.fotoPedidoMiniatura ? [nota.fotoPedidoMiniatura] : []);

  if (fotos.length === 0) return next;

  const novasRefs: string[] = [];
  for (let i = 0; i < fotos.length; i++) {
    const foto = fotos[i];
    if (!isInlineDataUrl(foto)) {
      novasRefs.push(foto);
      continue;
    }
    const blob = dataUrlToBlob(foto);
    const thumbSrc = thumbs[i];
    const thumbBlob = thumbSrc && isInlineDataUrl(thumbSrc) ? dataUrlToBlob(thumbSrc) : undefined;
    const ref = await putLocalNotaMedia(nota.id, i, blob, {
      thumbnailBlob: thumbBlob,
      mimeType: "image/jpeg",
    });
    novasRefs.push(ref);
  }

  next = {
    ...next,
    fotoPedido: novasRefs[0],
    fotosPedido: novasRefs.length > 1 ? novasRefs : novasRefs.length === 1 ? novasRefs : undefined,
    fotoPedidoMiniatura: undefined,
    fotosPedidoMiniaturas: undefined,
  };
  return next;
}

/** Move fotos base64 pendentes para IndexedDB — libera localStorage. */
export async function migrateInlinePhotosToIdb(data: AppData): Promise<AppData> {
  if (typeof indexedDB === "undefined") return data;

  let changed = false;
  const notasPedido: NotaPedido[] = [];

  for (const nota of data.notasPedido) {
    if (!notaPrecisaMigrarMidia(nota)) {
      notasPedido.push(nota);
      continue;
    }
    try {
      notasPedido.push(await migrarNotaMidia(nota));
      changed = true;
    } catch {
      notasPedido.push(nota);
    }
  }

  if (!changed) return data;
  return { ...data, notasPedido };
}

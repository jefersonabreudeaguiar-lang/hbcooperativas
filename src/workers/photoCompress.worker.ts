/// <reference lib="webworker" />

import type { WorkerCompressRequest, WorkerCompressSuccess, WorkerCompressFailure } from "./photoCompress.types";

self.onmessage = async (event: MessageEvent<WorkerCompressRequest>) => {
  const msg = event.data;
  try {
    const blob = new Blob([msg.buffer], { type: msg.mimeType });
    const bitmap = await createImageBitmap(blob, {
      resizeWidth: msg.maxWidth,
      resizeQuality: "medium",
    });

    const width = bitmap.width;
    const height = bitmap.height;
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      throw new Error("Canvas indisponível no worker.");
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const compressed = await canvas.convertToBlob({
      type: msg.outputMime,
      quality: msg.quality,
    });

    const thumbBitmap = await createImageBitmap(compressed, {
      resizeWidth: msg.thumbWidth,
      resizeQuality: "low",
    });
    const thumbCanvas = new OffscreenCanvas(thumbBitmap.width, thumbBitmap.height);
    const thumbCtx = thumbCanvas.getContext("2d");
    if (!thumbCtx) {
      thumbBitmap.close();
      throw new Error("Canvas indisponível no worker.");
    }
    thumbCtx.drawImage(thumbBitmap, 0, 0);
    thumbBitmap.close();

    const thumbnail = await thumbCanvas.convertToBlob({
      type: msg.outputMime,
      quality: msg.thumbQuality,
    });

    const compressedBuf = await compressed.arrayBuffer();
    const thumbnailBuf = await thumbnail.arrayBuffer();

    const response: WorkerCompressSuccess = {
      id: msg.id,
      ok: true,
      compressed: compressedBuf,
      thumbnail: thumbnailBuf,
      width,
      height,
      outputMime: msg.outputMime,
    };
    self.postMessage(response, [compressedBuf, thumbnailBuf]);
  } catch (e) {
    const response: WorkerCompressFailure = {
      id: msg.id,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
    self.postMessage(response);
  }
};

export {};

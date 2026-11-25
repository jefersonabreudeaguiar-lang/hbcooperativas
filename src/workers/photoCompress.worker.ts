/// <reference lib="webworker" />

import type { WorkerCompressRequest, WorkerCompressSuccess, WorkerCompressFailure } from "./photoCompress.types";

import { encodePhotoCanvases } from "./photoCanvas";

self.onmessage = async (event: MessageEvent<WorkerCompressRequest>) => {
  const msg = event.data;
  try {
    const bitmap = await createImageBitmap(msg.file, {
      resizeWidth: msg.maxWidth,
      resizeQuality: "medium",
    });
    const { compressed, thumbnail, width, height } = await encodePhotoCanvases(
      bitmap, bitmap, msg,
      (w, h) => new OffscreenCanvas(w, h),
      (canvas, quality) => (canvas as OffscreenCanvas).convertToBlob({ type: msg.outputMime, quality }),
      () => bitmap.close(),
    );

    const response: WorkerCompressSuccess = {
      id: msg.id,
      ok: true,
      compressed,
      thumbnail,
      width,
      height,
      outputMime: msg.outputMime,
    };
    self.postMessage(response);
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

import type {
  WorkerCompressRequest,
  WorkerCompressResponse,
  WorkerCompressFailure,
} from "@/workers/photoCompress.types";

let worker: Worker | null = null;
let workerFailed = false;
let seq = 0;
/** Encerra worker ocioso no WebAPK — evita heap retido entre sessões de fotos. */
const WORKER_IDLE_TERMINATE_MS = 45_000;
let idleTerminateTimer: ReturnType<typeof setTimeout> | null = null;

function clearIdleTerminateTimer(): void {
  if (idleTerminateTimer) {
    clearTimeout(idleTerminateTimer);
    idleTerminateTimer = null;
  }
}

function scheduleIdleWorkerTerminate(): void {
  clearIdleTerminateTimer();
  if (pending.size > 0) return;
  idleTerminateTimer = setTimeout(() => {
    idleTerminateTimer = null;
    if (pending.size > 0) return;
    worker?.terminate();
    worker = null;
    workerFailed = false;
  }, WORKER_IDLE_TERMINATE_MS);
}

const pending = new Map<
  string,
  {
    resolve: (value: WorkerCompressResponse) => void;
    reject: (reason: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();

function getWorker(): Worker | null {
  if (typeof window === "undefined" || workerFailed) return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL("../workers/photoCompress.worker.ts", import.meta.url));
    worker.onmessage = (ev: MessageEvent<WorkerCompressResponse>) => {
      const entry = pending.get(ev.data.id);
      if (!entry) return;
      clearTimeout(entry.timer);
      pending.delete(ev.data.id);
      entry.resolve(ev.data);
      scheduleIdleWorkerTerminate();
    };
    worker.onerror = () => {
      workerFailed = true;
      worker?.terminate();
      worker = null;
      clearIdleTerminateTimer();
      for (const [, entry] of pending) {
        clearTimeout(entry.timer);
        entry.reject(new Error("Worker de compressão indisponível."));
      }
      pending.clear();
    };
    return worker;
  } catch {
    workerFailed = true;
    return null;
  }
}

export function isPhotoCompressWorkerAvailable(): boolean {
  return getWorker() !== null;
}

export async function compressImageInWorker(
  file: File,
  options: {
    maxWidth: number;
    quality: number;
    thumbWidth: number;
    thumbQuality: number;
    outputMime: "image/jpeg" | "image/webp";
    timeoutMs?: number;
  }
): Promise<
  | { ok: true; compressed: Blob; thumbnail: Blob; width: number; height: number; mimeType: string }
  | { ok: false; error: string }
> {
  const w = getWorker();
  if (!w) return { ok: false, error: "worker_unavailable" };

  if (typeof performance !== "undefined" && performance.mark) {
    performance.mark("hb:foto:compress:start");
  }

  const id = `cmp-${++seq}`;
  clearIdleTerminateTimer();
  const req: WorkerCompressRequest = {
    id,
    file,
    mimeType: file.type || "image/jpeg",
    maxWidth: options.maxWidth,
    quality: options.quality,
    thumbWidth: options.thumbWidth,
    thumbQuality: options.thumbQuality,
    outputMime: options.outputMime,
  };

  const response = await new Promise<WorkerCompressResponse>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error("Timeout na compressão."));
    }, options.timeoutMs ?? 25_000);
    pending.set(id, { resolve, reject, timer });
    w.postMessage(req);
  }).catch((e: Error): WorkerCompressFailure => ({ id, ok: false, error: e.message }));

  if (!("ok" in response) || !response.ok) {
    return { ok: false, error: "error" in response ? response.error : "worker_failed" };
  }

  if (typeof performance !== "undefined" && performance.mark && performance.measure) {
    performance.mark("hb:foto:compress:end");
    try {
      performance.measure("hb:foto:compress:duration", "hb:foto:compress:start", "hb:foto:compress:end");
    } catch {
      /* marks ausentes após timeout/abort — ignorar */
    }
  }

  return {
    ok: true,
    compressed: new Blob([response.compressed], { type: response.outputMime }),
    thumbnail: new Blob([response.thumbnail], { type: response.outputMime }),
    width: response.width,
    height: response.height,
    mimeType: response.outputMime,
  };
}

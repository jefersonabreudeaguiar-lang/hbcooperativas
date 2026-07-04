export interface WorkerCompressRequest {
  id: string;
  buffer: ArrayBuffer;
  mimeType: string;
  maxWidth: number;
  quality: number;
  thumbWidth: number;
  thumbQuality: number;
  outputMime: "image/jpeg" | "image/webp";
}

export interface WorkerCompressSuccess {
  id: string;
  ok: true;
  compressed: ArrayBuffer;
  thumbnail: ArrayBuffer;
  width: number;
  height: number;
  outputMime: "image/jpeg" | "image/webp";
}

export interface WorkerCompressFailure {
  id: string;
  ok: false;
  error: string;
}

export type WorkerCompressResponse = WorkerCompressSuccess | WorkerCompressFailure;

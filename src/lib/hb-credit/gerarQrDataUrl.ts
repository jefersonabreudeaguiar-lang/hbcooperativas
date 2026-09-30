import QRCode from "qrcode";

const dataUrlCache = new Map<string, string>();

/** QR mercado — leve e rápido; cache por payload na sessão. */
export async function gerarQrDataUrl(payload: string): Promise<string> {
  const key = payload.trim();
  const hit = dataUrlCache.get(key);
  if (hit) return hit;

  const url = await QRCode.toDataURL(key, {
    width: 320,
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#000000", light: "#ffffff" },
  });
  dataUrlCache.set(key, url);
  return url;
}

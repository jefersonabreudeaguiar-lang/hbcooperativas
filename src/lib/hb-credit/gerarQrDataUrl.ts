import QRCode from "qrcode";

export async function gerarQrDataUrl(payload: string): Promise<string> {
  return QRCode.toDataURL(payload, {
    width: 520,
    margin: 2,
    errorCorrectionLevel: "H",
    color: { dark: "#000000", light: "#ffffff" },
  });
}

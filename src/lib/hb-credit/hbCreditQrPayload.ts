/** Parser de QR HB Créditos (client + server). */
export function parseHbCreditQrPayload(raw: string): { intentId: string; nonce: string } | null {
  const trimmed = raw.replace(/\uFEFF/g, "").trim();
  if (!trimmed) return null;
  try {
    if (trimmed.startsWith("{")) {
      const json = JSON.parse(trimmed) as { scheme?: string; intentId?: string; nonce?: string };
      if (json.scheme === "hb-credit" && json.intentId && json.nonce) {
        return { intentId: json.intentId, nonce: decodeURIComponent(json.nonce) };
      }
    }

    let urlLike = trimmed;
    if (trimmed.startsWith("hb-credit://")) {
      urlLike = trimmed.replace("hb-credit://", "https://credit.local/");
    } else if (!trimmed.includes("://") && trimmed.includes("nonce=")) {
      urlLike = `https://credit.local/${trimmed.replace(/^\/*/, "")}`;
    }

    const url = new URL(urlLike);
    const parts = url.pathname.split("/").filter(Boolean);
    const intentId = parts[parts.length - 1];
    const nonceRaw = url.searchParams.get("nonce") ?? "";
    const nonce = decodeURIComponent(nonceRaw);
    if (!intentId || !nonce) return null;
    return { intentId, nonce };
  } catch {
    return null;
  }
}

export function buildHbCreditQrPayload(intentId: string, nonce: string): string {
  return `${"hb-credit"}://pay/${intentId}?nonce=${encodeURIComponent(nonce)}`;
}

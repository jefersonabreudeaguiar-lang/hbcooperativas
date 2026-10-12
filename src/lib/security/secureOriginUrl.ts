/**
 * Evita mixed content em PWA HTTPS (Android WebAPK bloqueia ou falha em http://).
 */
export function upgradeInsecureHttpUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed.toLowerCase().startsWith("http://")) return trimmed;
  try {
    const parsed = new URL(trimmed);
    if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
      return trimmed;
    }
    parsed.protocol = "https:";
    return parsed.toString();
  } catch {
    return trimmed.replace(/^http:\/\//i, "https://");
  }
}

export function normalizeAppBaseUrl(raw: string): string {
  const base = raw.replace(/\/$/, "");
  if (!base) return base;
  if (base.startsWith("http://") && !/localhost|127\.0\.0\.1/i.test(base)) {
    return upgradeInsecureHttpUrl(base);
  }
  return base;
}

/** IDs de deploy Vercel (`dpl_` + ~22 caracteres). */
export const VERCEL_DPL_ID_RE = /^dpl_[A-Za-z0-9]{20,}$/;

export function isCanonicalVercelDeploymentId(id: string | null | undefined): boolean {
  if (!id) return false;
  return VERCEL_DPL_ID_RE.test(id.trim());
}

export function parseDplFromAssetUrl(url: string): string | null {
  const m = url.match(/[?&]dpl=([^&]+)/);
  if (!m?.[1]) return null;
  try {
    const id = decodeURIComponent(m[1]).trim();
    return isCanonicalVercelDeploymentId(id) ? id : null;
  } catch {
    return null;
  }
}

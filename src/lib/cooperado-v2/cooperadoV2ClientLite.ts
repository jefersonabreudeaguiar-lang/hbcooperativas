/** Rotas v2 — sem parse/materialização do AppData local (só nuvem via API). */
export const COOPERADO_V2_PATH_PREFIX = "/cooperado-v2";

export function isCooperadoV2Pathname(pathname: string): boolean {
  const p = pathname.trim().toLowerCase();
  return p === COOPERADO_V2_PATH_PREFIX || p.startsWith(`${COOPERADO_V2_PATH_PREFIX}/`);
}

function cooperadoV2NextFromLoginSearch(): string | null {
  if (typeof window === "undefined") return null;
  if (window.location.pathname.trim().toLowerCase() !== "/login") return null;
  try {
    const next = new URLSearchParams(window.location.search).get("next");
    if (!next || !next.startsWith("/") || next.startsWith("//")) return null;
    return isCooperadoV2Pathname(next) ? next : null;
  } catch {
    return null;
  }
}

/** Bloqueia AppData local na rota v2 ou ao entrar pelo login com `next` v2. */
export function cooperadoV2ClientAppDataBlocked(): boolean {
  if (typeof window === "undefined") return false;
  if (isCooperadoV2Pathname(window.location.pathname)) return true;
  return cooperadoV2NextFromLoginSearch() != null;
}

/** Fragmento JS para scripts inline no `<head>` (sem bundle). */
export function cooperadoV2InlineHeadSkipAppDataWarmJs(): string {
  return (
    `var __hbV2Skip=function(){try{var p=String(location.pathname||"").toLowerCase();` +
    `if(p==="/cooperado-v2"||p.indexOf("/cooperado-v2/")===0)return true;` +
    `if(p==="/login"){var nx=new URLSearchParams(location.search).get("next");` +
    `if(nx&&nx.charAt(0)==="/"&&nx.indexOf("//")!==0){var n=nx.toLowerCase();` +
    `if(n==="/cooperado-v2"||n.indexOf("/cooperado-v2/")===0)return true;}}` +
    `}catch(e){}return false;};if(__hbV2Skip())return;`
  );
}

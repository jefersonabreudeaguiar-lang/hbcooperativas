type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 120;
const AUTH_MAX = 20;
const CADASTRO_SENHA_MAX = 8;
const PASSWORD_RESET_MAX = 5;
const PASSWORD_RESET_WINDOW_MS = 15 * 60_000;

function clientKey(request: Request, suffix = ""): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  const ip = forwarded || realIp || "unknown";
  return `${ip}${suffix}`;
}

function checkLimit(key: string, max: number, windowMs = WINDOW_MS): boolean {
  const now = Date.now();
  const cur = buckets.get(key);
  if (!cur || now >= cur.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (cur.count >= max) return false;
  cur.count += 1;
  return true;
}

export function rateLimitApi(request: Request): boolean {
  return checkLimit(clientKey(request), MAX_REQUESTS);
}

export function rateLimitAuth(request: Request): boolean {
  return checkLimit(clientKey(request, ":auth"), AUTH_MAX);
}

export function rateLimitCadastroSenha(request: Request): boolean {
  return checkLimit(clientKey(request, ":cadastro-senha"), CADASTRO_SENHA_MAX);
}

export function rateLimitPasswordReset(request: Request): boolean {
  return checkLimit(clientKey(request, ":password-reset"), PASSWORD_RESET_MAX, PASSWORD_RESET_WINDOW_MS);
}

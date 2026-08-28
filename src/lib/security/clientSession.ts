const TOKEN_KEY = "coopeagriplla_access_token";
const BOOTSTRAP_KEY = "coopeagriplla_cloud_bootstrap";

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  let token = localStorage.getItem(TOKEN_KEY);
  if (!token) {
    token = sessionStorage.getItem(TOKEN_KEY);
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
      sessionStorage.removeItem(TOKEN_KEY);
    }
  }
  return token;
}

export function setAccessToken(token: string | null): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(TOKEN_KEY);
  if (!token) localStorage.removeItem(TOKEN_KEY);
  else localStorage.setItem(TOKEN_KEY, token);
}

export function clearAccessToken(): void {
  setAccessToken(null);
}

export interface CloudSessionProfile {
  id: string;
  email: string;
  name: string;
  role: string;
  cooperativaId?: string;
  cooperadoId?: string;
  cooperativaCnpj?: string;
}

let activeCloudProfile: CloudSessionProfile | null = null;

export function setActiveCloudProfile(profile: CloudSessionProfile | null): void {
  activeCloudProfile = profile;
}

export function userToCloudProfile(user: {
  id: string;
  email: string;
  name: string;
  role: string;
  cooperativaId?: string;
  cooperadoId?: string;
  cooperativaCnpj?: string;
}): CloudSessionProfile {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    cooperativaId: user.cooperativaId,
    cooperadoId: user.cooperadoId,
    cooperativaCnpj: user.cooperativaCnpj,
  };
}

const LOCAL_SESSION_KEY = "coopeagriplla_session";

function loadStoredSessionProfile(): CloudSessionProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LOCAL_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      id?: string;
      email?: string;
      name?: string;
      role?: string;
      cooperativaId?: string;
      cooperadoId?: string;
      cooperativaCnpj?: string;
    };
    if (!parsed.id || !parsed.email || !parsed.name || !parsed.role) return null;
    return userToCloudProfile(parsed as CloudSessionProfile);
  } catch {
    return null;
  }
}

function rememberCloudCredentials(email: string, password: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      BOOTSTRAP_KEY,
      JSON.stringify({ email: email.trim().toLowerCase(), password })
    );
  } catch {
    /* quota */
  }
}

export function clearCloudBootstrapCredentials(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(BOOTSTRAP_KEY);
}

export function updateCloudBootstrapPassword(newPassword: string): void {
  const bootstrap = loadCloudBootstrapCredentials();
  if (bootstrap) rememberCloudCredentials(bootstrap.email, newPassword);
}

function loadCloudBootstrapCredentials(): { email: string; password: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(BOOTSTRAP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { email?: string; password?: string };
    if (!parsed.email || !parsed.password) return null;
    return { email: parsed.email.trim().toLowerCase(), password: parsed.password };
  } catch {
    return null;
  }
}

async function requestCloudToken(
  endpoint: "/api/auth/login" | "/api/auth/provision" | "/api/auth/register",
  payload: Record<string, unknown>
): Promise<string | null> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { token?: string };
  return json.token ?? null;
}

/** Valida credenciais em app_users (Supabase) — usado quando o aparelho ainda não tem users[] local. */
export async function loginViaCloudApi(
  email: string,
  password: string
): Promise<{ token: string; user: CloudSessionProfile } | null> {
  try {
    const normalizedEmail = email.trim().toLowerCase();
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: normalizedEmail, password }),
    });
    if (res.status === 503 || res.status === 429) return null;
    if (!res.ok) return null;

    const json = (await res.json()) as {
      token?: string;
      user?: {
        id?: string;
        email?: string;
        name?: string;
        role?: string;
        cooperativaId?: string | null;
        cooperadoId?: string | null;
        cooperativaCnpj?: string | null;
      };
    };
    if (!json.token || !json.user?.id || !json.user.email || !json.user.name || !json.user.role) {
      return null;
    }

    const profile: CloudSessionProfile = {
      id: json.user.id,
      email: json.user.email.trim().toLowerCase(),
      name: json.user.name.trim(),
      role: json.user.role,
      cooperativaId: json.user.cooperativaId ?? undefined,
      cooperadoId: json.user.cooperadoId ?? undefined,
      cooperativaCnpj: json.user.cooperativaCnpj ?? undefined,
    };

    setAccessToken(json.token);
    rememberCloudCredentials(normalizedEmail, password);
    setActiveCloudProfile(profile);
    return { token: json.token, user: profile };
  } catch {
    return null;
  }
}

export async function establishCloudSession(
  email: string,
  password: string,
  profile: CloudSessionProfile
): Promise<boolean> {
  try {
    const normalizedEmail = email.trim().toLowerCase();
    const fullPayload = { ...profile, email: normalizedEmail, password };

    let token =
      (await requestCloudToken("/api/auth/login", { email: normalizedEmail, password })) ??
      (await requestCloudToken("/api/auth/provision", fullPayload)) ??
      (await requestCloudToken("/api/auth/register", fullPayload));

    if (!token) {
      clearAccessToken();
      return false;
    }

    setAccessToken(token);
    rememberCloudCredentials(normalizedEmail, password);
    return true;
  } catch {
    clearAccessToken();
    return false;
  }
}

export async function refreshCloudSession(): Promise<boolean> {
  const token = getAccessToken();
  if (!token) return false;
  try {
    const res = await fetch("/api/auth/session", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) {
      clearAccessToken();
      return false;
    }
    const json = (await res.json()) as { token?: string; enforced?: boolean };
    if (json.enforced === false) return true;
    if (json.token) setAccessToken(json.token);
    return true;
  } catch {
    return false;
  }
}

/** Restaura JWT antes de sync/envio de fotos — transparente para o usuário. */
export async function ensureCloudSessionReady(profile?: CloudSessionProfile): Promise<boolean> {
  const active = profile ?? activeCloudProfile ?? loadStoredSessionProfile();
  if (!active) {
    if (getAccessToken()) return refreshCloudSession();
    return false;
  }

  activeCloudProfile = active;

  if (getAccessToken()) {
    const refreshed = await refreshCloudSession();
    if (refreshed) return true;
  }

  const bootstrap = loadCloudBootstrapCredentials();
  if (bootstrap && bootstrap.email === active.email.trim().toLowerCase()) {
    return establishCloudSession(bootstrap.email, bootstrap.password, active);
  }

  return Boolean(getAccessToken());
}

/** @deprecated use ensureCloudSessionReady */
export async function ensureAccessTokenForApi(): Promise<boolean> {
  return ensureCloudSessionReady();
}

export function mensagemErroAuthApi(status: number, error?: string): string {
  if (status === 401 || error === "Autenticação necessária.") {
    return "Sessão na nuvem não encontrada. Desconecte, entre de novo com e-mail e senha e abra a Conta Coop.";
  }
  if (error === "Sessão inválida ou expirada.") {
    return "Sessão expirada. Faça login novamente para usar a Conta Coop.";
  }
  if (status === 403) {
    return "Sem permissão para esta cooperativa. Verifique o login ou fale com a diretoria.";
  }
  return error ?? "Erro ao comunicar com o servidor.";
}

export async function secureApiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  await ensureCloudSessionReady();

  const headers = new Headers(init?.headers);
  const token = getAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let res = await fetch(input, { ...init, headers });

  if (res.status === 401) {
    const rebooted = await ensureCloudSessionReady();
    if (rebooted) {
      const retryHeaders = new Headers(init?.headers);
      const newToken = getAccessToken();
      if (newToken) retryHeaders.set("Authorization", `Bearer ${newToken}`);
      res = await fetch(input, { ...init, headers: retryHeaders });
    }
  }

  return res;
}

export async function registerCloudUser(input: {
  id: string;
  email: string;
  password: string;
  name: string;
  role: string;
  cooperativaId?: string;
  cooperadoId?: string;
  cooperativaCnpj?: string;
}): Promise<boolean> {
  const ok = await establishCloudSession(input.email, input.password, {
    id: input.id,
    email: input.email,
    name: input.name,
    role: input.role,
    cooperativaId: input.cooperativaId,
    cooperadoId: input.cooperadoId,
    cooperativaCnpj: input.cooperativaCnpj,
  });
  return ok;
}

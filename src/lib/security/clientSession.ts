const TOKEN_KEY = "coopeagriplla_access_token";

/** Fallback em memória — PWA/mobile quando localStorage falha ou atrasa. */
let memoryAccessToken: string | null = null;

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  if (memoryAccessToken) return memoryAccessToken;
  let token = localStorage.getItem(TOKEN_KEY);
  if (!token) {
    token = sessionStorage.getItem(TOKEN_KEY);
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
      sessionStorage.removeItem(TOKEN_KEY);
    }
  }
  if (token) memoryAccessToken = token;
  return token;
}

export function setAccessToken(token: string | null): void {
  if (typeof window === "undefined") return;
  memoryAccessToken = token;
  sessionStorage.removeItem(TOKEN_KEY);
  if (!token) localStorage.removeItem(TOKEN_KEY);
  else {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      sessionStorage.setItem(TOKEN_KEY, token);
    }
  }
}

export function clearAccessToken(): void {
  setAccessToken(null);
}

/** Remove credencial bootstrap legada — senha nunca deve persistir no cliente. */
export function clearCloudBootstrapCredentials(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem("coopeagriplla_cloud_bootstrap");
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

async function requestCloudToken(
  endpoint: "/api/auth/login" | "/api/auth/provision" | "/api/auth/register" | "/api/auth/sync-session",
  payload: Record<string, unknown>
): Promise<{ token: string | null; error?: string; status?: number }> {
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = (await res.json().catch(() => ({}))) as { token?: string; error?: string; code?: string };
    if (!res.ok) {
      return { token: null, error: json.error ?? res.statusText, status: res.status };
    }
    return { token: json.token ?? null };
  } catch {
    return { token: null, error: "Falha de rede." };
  }
}

let lastCloudSyncError = "";

export function getLastCloudSyncError(): string {
  return lastCloudSyncError;
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
    const json = (await res.json().catch(() => ({}))) as {
      token?: string;
      error?: string;
      code?: string;
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

    if (res.status === 503 || json.code === "APP_USERS_MISSING") {
      lastCloudSyncError =
        json.error ??
        "Conta na nuvem não configurada (tabela app_users). Fale com o suporte HB Cooperativas.";
      return null;
    }
    if (res.status === 429) return null;
    if (!res.ok) {
      lastCloudSyncError = json.error ?? "Credenciais inválidas na nuvem.";
      return null;
    }

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
    clearCloudBootstrapCredentials();
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
    clearCloudBootstrapCredentials();
    const normalizedEmail = email.trim().toLowerCase();
    const fullPayload = { ...profile, email: normalizedEmail, password };

    const sync = await requestCloudToken("/api/auth/sync-session", fullPayload);
    let token = sync.token;
    let syncError = sync.error ?? "";

    if (!token) {
      const login = await requestCloudToken("/api/auth/login", { email: normalizedEmail, password });
      token = login.token;
      syncError = login.error ?? syncError;

      if (!token) {
        const provision = await requestCloudToken("/api/auth/provision", fullPayload);
        token = provision.token;
        syncError = provision.error ?? syncError;
      }

      if (!token) {
        const register = await requestCloudToken("/api/auth/register", fullPayload);
        token = register.token;
        syncError = register.error ?? syncError;
      }
    }

    lastCloudSyncError = token ? "" : syncError;

    if (!token) {
      return false;
    }

    setAccessToken(token);
    setActiveCloudProfile(profile);
    return true;
  } catch {
    lastCloudSyncError = "Erro inesperado ao conectar na nuvem.";
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
    if (res.status === 401) {
      clearAccessToken();
      return false;
    }
    if (!res.ok) {
      return true;
    }
    const json = (await res.json()) as { token?: string; enforced?: boolean };
    if (json.enforced === false) return true;
    if (json.token) setAccessToken(json.token);
    return true;
  } catch {
    return Boolean(getAccessToken());
  }
}

/** Restaura JWT antes de APIs protegidas (Conta Coop, sync, etc.). */
export async function ensureCloudSessionReady(profile?: CloudSessionProfile): Promise<boolean> {
  clearCloudBootstrapCredentials();

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

  return false;
}

/** @deprecated use ensureCloudSessionReady */
export async function ensureAccessTokenForApi(): Promise<boolean> {
  return ensureCloudSessionReady();
}

export function mensagemErroAuthApi(status: number, error?: string): string {
  if (status === 401 || error === "Autenticação necessária.") {
    return "Não foi possível conectar à Conta Coop. Saia, entre de novo e aguarde alguns segundos antes de abrir a Conta Coop.";
  }
  if (error === "Sessão inválida ou expirada.") {
    return "Sessão expirada. Faça login novamente para usar a Conta Coop.";
  }
  if (error === "Credenciais inválidas." || error === "Dados inválidos.") {
    return "Conta na nuvem desatualizada. Saia, entre de novo com e-mail e senha atuais.";
  }
  if (status === 503 || error?.includes("não configurada") || error?.includes("app_users")) {
    return "Conta na nuvem não configurada (tabela app_users). Fale com o suporte HB Cooperativas.";
  }
  if (status === 403) {
    return "Sem permissão para esta cooperativa. Verifique o login ou fale com a diretoria.";
  }
  return error ?? "Erro ao comunicar com o servidor.";
}

export async function secureApiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const profile = activeCloudProfile ?? loadStoredSessionProfile();
  let ready = await ensureCloudSessionReady(profile ?? undefined);

  const headers = new Headers(init?.headers);
  const token = getAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let res = await fetch(input, { ...init, headers });

  if (res.status === 401 && profile) {
    ready = await ensureCloudSessionReady(profile);
    const newToken = getAccessToken();
    if (ready && newToken) {
      const retryHeaders = new Headers(init?.headers);
      retryHeaders.set("Authorization", `Bearer ${newToken}`);
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
  return establishCloudSession(input.email, input.password, {
    id: input.id,
    email: input.email,
    name: input.name,
    role: input.role,
    cooperativaId: input.cooperativaId,
    cooperadoId: input.cooperadoId,
    cooperativaCnpj: input.cooperativaCnpj,
  });
}

/** @deprecated Senha não é mais persistida no cliente. */
export function rememberCloudCredentials(_email: string, _password: string): void {
  clearCloudBootstrapCredentials();
}

/** @deprecated Senha não é mais persistida no cliente. */
export function updateCloudBootstrapPassword(_newPassword: string): void {
  clearCloudBootstrapCredentials();
}

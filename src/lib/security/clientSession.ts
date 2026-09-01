import { normalizeAuthEmail } from "@/lib/security/appCreator";

const TOKEN_KEY = "coopeagriplla_access_token";

/** Sessão ativa via cookie httpOnly (Fase 2). */
let cloudSessionActive = false;

/** Fallback em memória — apenas dev/local quando token ainda vem no JSON. */
let memoryAccessToken: string | null = null;

export function markCloudSessionActive(): void {
  cloudSessionActive = true;
}

export function markCloudSessionInactive(): void {
  cloudSessionActive = false;
}

export function isCloudSessionActive(): boolean {
  return cloudSessionActive;
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  if (memoryAccessToken) return memoryAccessToken;
  if (cloudSessionActive) return "__cookie__";
  return null;
}

export function setAccessToken(token: string | null): void {
  if (typeof window === "undefined") return;
  memoryAccessToken = token;
  sessionStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_KEY);
  if (token) markCloudSessionActive();
}

export function clearAccessToken(): void {
  memoryAccessToken = null;
  markCloudSessionInactive();
  if (typeof window !== "undefined") {
    sessionStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_KEY);
  }
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

type CloudAuthUser = {
  id?: string;
  email?: string;
  name?: string;
  role?: string;
  cooperativaId?: string | null;
  cooperadoId?: string | null;
  cooperativaCnpj?: string | null;
};

function profileFromCloudAuthUser(raw: CloudAuthUser): CloudSessionProfile | null {
  if (!raw.id || !raw.email || !raw.name || !raw.role) return null;
  const cooperadoId = raw.cooperadoId ?? undefined;
  let role = raw.role;
  if (cooperadoId?.trim() && role !== "parceiro" && role !== "contador") {
    role = "cooperado";
  }
  return {
    id: raw.id,
    email: raw.email.trim().toLowerCase(),
    name: raw.name.trim(),
    role,
    cooperativaId: raw.cooperativaId ?? undefined,
    cooperadoId,
    cooperativaCnpj: raw.cooperativaCnpj ?? undefined,
  };
}

async function requestCloudToken(
  endpoint: "/api/auth/login" | "/api/auth/provision" | "/api/auth/register" | "/api/auth/sync-session",
  payload: Record<string, unknown>
): Promise<{ ok: boolean; token?: string | null; user?: CloudAuthUser; error?: string; status?: number }> {
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    const json = (await res.json().catch(() => ({}))) as {
      token?: string;
      error?: string;
      code?: string;
      user?: CloudAuthUser;
    };
    if (!res.ok) {
      return { ok: false, error: json.error ?? res.statusText, status: res.status };
    }
    markCloudSessionActive();
    if (json.token) memoryAccessToken = json.token;
    return { ok: true, token: json.token ?? null, user: json.user };
  } catch {
    return { ok: false, error: "Falha de rede." };
  }
}

let lastCloudSyncError = "";

export function getLastCloudSyncError(): string {
  return lastCloudSyncError;
}

export function setLastCloudSyncError(message: string): void {
  lastCloudSyncError = message;
}

/** Valida credenciais em app_users (Supabase) — usado quando o aparelho ainda não tem users[] local. */
export async function loginViaCloudApi(
  email: string,
  password: string
): Promise<{ token: string; user: CloudSessionProfile } | null> {
  try {
    const normalizedEmail = normalizeAuthEmail(email);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email: normalizedEmail, password }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      token?: string;
      error?: string;
      code?: string;
      user?: CloudAuthUser;
    };

    if (res.status === 503 || json.code === "APP_USERS_MISSING") {
      lastCloudSyncError =
        json.error ??
        "Conta na nuvem não configurada (tabela app_users). Fale com o suporte HB Cooperativas.";
      return null;
    }
    if (res.status === 429) {
      lastCloudSyncError = "Muitas tentativas. Aguarde um minuto e tente de novo.";
      return null;
    }
    if (!res.ok) {
      lastCloudSyncError = json.error ?? "Credenciais inválidas na nuvem.";
      return null;
    }

    if (!json.user?.id || !json.user.email || !json.user.name || !json.user.role) {
      lastCloudSyncError = "Resposta incompleta do servidor de login.";
      return null;
    }

    const profile = profileFromCloudAuthUser(json.user);
    if (!profile) {
      lastCloudSyncError = "Resposta incompleta do servidor de login.";
      return null;
    }

    markCloudSessionActive();
    if (json.token) memoryAccessToken = json.token;
    clearCloudBootstrapCredentials();
    setActiveCloudProfile(profile);
    return { token: json.token ?? "__cookie__", user: profile };
  } catch {
    lastCloudSyncError = "Falha de rede ao validar login na nuvem.";
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
    const normalizedEmail = normalizeAuthEmail(email);
    const fullPayload = { ...profile, email: normalizedEmail, password };

    const sync = await requestCloudToken("/api/auth/sync-session", fullPayload);
    let ok = sync.ok;
    let syncError = sync.error ?? "";

    if (!ok) {
      const login = await requestCloudToken("/api/auth/login", { email: normalizedEmail, password });
      ok = login.ok;
      syncError = login.error ?? syncError;

      if (!ok) {
        const provision = await requestCloudToken("/api/auth/provision", fullPayload);
        ok = provision.ok;
        syncError = provision.error ?? syncError;
      }

      if (!ok) {
        const register = await requestCloudToken("/api/auth/register", fullPayload);
        ok = register.ok;
        syncError = register.error ?? syncError;
      }
    }

    lastCloudSyncError = ok ? "" : syncError;

    if (!ok) {
      return false;
    }

    markCloudSessionActive();
    setActiveCloudProfile(profile);
    return true;
  } catch {
    lastCloudSyncError = "Erro inesperado ao conectar na nuvem.";
    return false;
  }
}

export async function fetchCloudSessionProfile(): Promise<CloudSessionProfile | null> {
  try {
    const res = await fetch("/api/auth/session", {
      credentials: "include",
      cache: "no-store",
    });
    if (res.status === 401) {
      clearAccessToken();
      return null;
    }
    if (!res.ok) return null;
    const json = (await res.json()) as {
      valid?: boolean;
      enforced?: boolean;
      token?: string;
      user?: CloudAuthUser;
    };
    if (json.valid === false || !json.user) return null;
    markCloudSessionActive();
    if (json.token) memoryAccessToken = json.token;
    const profile = profileFromCloudAuthUser(json.user);
    if (profile) setActiveCloudProfile(profile);
    return profile;
  } catch {
    return null;
  }
}

export async function refreshCloudSession(): Promise<boolean> {
  const profile = await fetchCloudSessionProfile();
  return profile !== null || cloudSessionActive;
}

/** Restaura JWT antes de APIs protegidas (Conta Coop, sync, etc.). */
export async function ensureCloudSessionReady(profile?: CloudSessionProfile): Promise<boolean> {
  clearCloudBootstrapCredentials();

  const active = profile ?? activeCloudProfile ?? loadStoredSessionProfile();
  if (active) activeCloudProfile = active;

  // Sempre valida cookie httpOnly — cloudSessionActive é só flag em memória (perde no reload).
  if (await refreshCloudSession()) {
    lastCloudSyncError = "";
    return true;
  }

  if (!active) {
    lastCloudSyncError =
      lastCloudSyncError ||
      "Sessão local não encontrada. Faça login novamente.";
    return false;
  }

  lastCloudSyncError =
    lastCloudSyncError ||
    "Sessão na nuvem expirada ou desalinhada. Saia, entre de novo e aguarde alguns segundos.";
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
  const sessionReady = await ensureCloudSessionReady(profile ?? undefined);

  const headers = new Headers(init?.headers);
  const token = memoryAccessToken;
  if (token && token !== "__cookie__") {
    headers.set("Authorization", `Bearer ${token}`);
  }

  let res = await fetch(input, { ...init, headers, credentials: "include" });

  if (res.status === 401 && profile) {
    const ready = await refreshCloudSession();
    if (ready) {
      const retryHeaders = new Headers(init?.headers);
      const retryToken = memoryAccessToken;
      if (retryToken && retryToken !== "__cookie__") {
        retryHeaders.set("Authorization", `Bearer ${retryToken}`);
      }
      res = await fetch(input, { ...init, headers: retryHeaders, credentials: "include" });
    }
  }

  if (!sessionReady || res.status === 401) {
    lastCloudSyncError =
      lastCloudSyncError ||
      "Sessão na nuvem expirada ou desalinhada. Saia, entre de novo e aguarde alguns segundos.";
  } else if (res.status === 403) {
    lastCloudSyncError =
      mensagemErroAuthApi(403) ||
      "Sem permissão para esta cooperativa. Verifique o login ou fale com a diretoria.";
  }

  return res;
}

export async function logoutCloudSession(): Promise<void> {
  try {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
  } catch {
    /* offline */
  }
  clearAccessToken();
  setActiveCloudProfile(null);
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

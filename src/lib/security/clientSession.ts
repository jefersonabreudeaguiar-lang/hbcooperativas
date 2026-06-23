const TOKEN_KEY = "coopeagriplla_access_token";

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setAccessToken(token: string | null): void {
  if (typeof window === "undefined") return;
  if (!token) sessionStorage.removeItem(TOKEN_KEY);
  else sessionStorage.setItem(TOKEN_KEY, token);
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

export async function establishCloudSession(
  email: string,
  password: string,
  profile: CloudSessionProfile
): Promise<boolean> {
  try {
    let res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      if (res.status === 401 || res.status === 404) {
        res = await fetch("/api/auth/provision", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...profile, email, password }),
        });
      }
    }

    if (!res.ok) {
      clearAccessToken();
      return false;
    }

    const json = (await res.json()) as { token?: string };
    if (json.token) {
      setAccessToken(json.token);
      return true;
    }
    return false;
  } catch {
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
    const json = (await res.json()) as { token?: string };
    if (json.token) setAccessToken(json.token);
    return true;
  } catch {
    return false;
  }
}

export async function secureApiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  const token = getAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let res = await fetch(input, { ...init, headers });

  if (res.status === 401 && token) {
    const refreshed = await refreshCloudSession();
    if (refreshed) {
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
  try {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) return false;
    const json = (await res.json()) as { token?: string };
    if (json.token) setAccessToken(json.token);
    return Boolean(json.token);
  } catch {
    return false;
  }
}

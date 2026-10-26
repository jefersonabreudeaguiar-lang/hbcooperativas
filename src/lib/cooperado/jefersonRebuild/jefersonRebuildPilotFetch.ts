import {
  getAccessToken,
  mensagemErroAuthApi,
  refreshCloudSession,
} from "@/lib/security/clientSession";

const FETCH_TIMEOUT_MS = 50_000;
const SESSION_BUDGET_MS = 6_000;

function authHeaders(init?: RequestInit): Headers {
  const headers = new Headers(init?.headers);
  const token = getAccessToken();
  if (token && token !== "__cookie__") {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return headers;
}

async function refreshBounded(): Promise<void> {
  await Promise.race([
    refreshCloudSession().catch(() => false),
    new Promise<void>((r) => window.setTimeout(r, SESSION_BUDGET_MS)),
  ]);
}

export async function fetchJefersonRebuildPilotApi(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const controller = new AbortController();
  const outer = init?.signal;
  if (outer) {
    if (outer.aborted) controller.abort();
    else outer.addEventListener("abort", () => controller.abort(), { once: true });
  }
  const timer = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  const doFetch = () =>
    fetch(input, {
      ...init,
      headers: authHeaders(init),
      credentials: "include",
      signal: controller.signal,
    });

  try {
    await refreshBounded();
    let res = await doFetch();
    if (res.status === 401) {
      await refreshBounded();
      res = await doFetch();
    }
    if (res.status === 401) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(
        mensagemErroAuthApi(401, body?.error) ||
          "Sessão na nuvem indisponível. Saia e entre de novo."
      );
    }
    return res;
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new Error("A nuvem demorou demais. Toque em Atualizar de novo.");
    }
    throw e;
  } finally {
    window.clearTimeout(timer);
  }
}

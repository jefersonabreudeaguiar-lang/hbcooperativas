import {
  getAccessToken,
  mensagemErroAuthApi,
  refreshCloudSession,
} from "@/lib/security/clientSession";

/** Card início v2 — operacional na nuvem; teto total inclui refresh de sessão. */
const V2_FETCH_TIMEOUT_MS = 55_000;
const V2_SESSION_REFRESH_BUDGET_MS = 7_000;

function mergeAuthHeaders(init?: RequestInit): Headers {
  const headers = new Headers(init?.headers);
  const token = getAccessToken();
  if (token && token !== "__cookie__") {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return headers;
}

async function refreshCloudSessionBounded(): Promise<void> {
  await Promise.race([
    refreshCloudSession().catch(() => false),
    new Promise<void>((resolve) => {
      window.setTimeout(resolve, V2_SESSION_REFRESH_BUDGET_MS);
    }),
  ]);
}

/**
 * Fetch v2 sem `secureApiFetch` — evita `ensureCloudSessionReady` sem teto e redirect
 * que dispara `logoutAndClearSession` (parse pesado do AppData no celular).
 */
export async function fetchCooperadoV2Api(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const controller = new AbortController();
  const outer = init?.signal;
  if (outer) {
    if (outer.aborted) controller.abort();
    else outer.addEventListener("abort", () => controller.abort(), { once: true });
  }
  const timer = window.setTimeout(() => controller.abort(), V2_FETCH_TIMEOUT_MS);

  const doFetch = () =>
    fetch(input, {
      ...init,
      headers: mergeAuthHeaders(init),
      credentials: "include",
      signal: controller.signal,
    });

  try {
    await refreshCloudSessionBounded();
    let res = await doFetch();

    if (res.status === 401) {
      await refreshCloudSessionBounded();
      res = await doFetch();
    }

    if (res.status === 401) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(
        mensagemErroAuthApi(401, body?.error) ||
          "Sessão na nuvem indisponível. Saia, entre de novo e abra o link do piloto v2."
      );
    }

    return res;
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new Error("A nuvem demorou demais. Toque em Atualizar ou saia e entre de novo.");
    }
    throw e;
  } finally {
    window.clearTimeout(timer);
  }
}

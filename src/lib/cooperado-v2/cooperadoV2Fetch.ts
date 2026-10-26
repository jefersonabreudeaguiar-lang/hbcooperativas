import { secureApiFetch } from "@/lib/security/clientSession";

/** Card início v2 — operacional na nuvem; timeout curto para não ficar sem feedback. */
const V2_FETCH_TIMEOUT_MS = 55_000;

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
  try {
    return await secureApiFetch(input, { ...init, signal: controller.signal });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new Error("A nuvem demorou demais. Toque em Atualizar ou saia e entre de novo.");
    }
    throw e;
  } finally {
    window.clearTimeout(timer);
  }
}

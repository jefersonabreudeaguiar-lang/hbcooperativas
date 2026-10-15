/**
 * Estratégia avançada — integridade de release (HTML + chunks + runtime)
 * ---------------------------------------------------------------------
 *
 * ## Problema
 * O cooperado pode ver HTML/build novo na nuvem, mas executar **JS antigo** por:
 * - aba mantida viva (tab keep-alive) sem novo documento;
 * - Cache API / HTTP cache de `/_next/static`;
 * - mistura de `dpl_*` (deploy Vercel) entre script principal e dynamic imports;
 * - `localStorage` marcando build “visto” com tolerância `build-1`.
 *
 * ## Camadas (ordem de execução)
 *
 * | Camada | Onde | O quê |
 * |--------|------|--------|
 * | L0 | `<head>` inline | Crash forensics, stale profile, launch guard |
 * | L1 | `<head>` inline | `htmlDeploymentAlign` + `deploymentBoot` (mixed DPL, blocked deploy) |
 * | L2 | `<head>` inline | **chunk DPL align** (PerformanceObserver — chunk ≠ HTML/nuvem) |
 * | L3 | React boot | `ClientReleaseShieldHost` (fetch `/api/client-release`, align hard) |
 * | L4 | Cooperado GA | **Integrity watch** 12s→30s→60s→120s pós-interação |
 * | L5 | Financeiro GA | Refresh 20s→40s→60s (dados; não substitui L4) |
 * | L6 | Época frota | `COOPERADO_FLEET_MAINTENANCE_EPOCH` — só snapshots UI, não SW |
 *
 * ## Regras de produto (filosofia)
 * - **Nunca** reload em massa por `APP_BUILD_VERSION` sozinho.
 * - Reload/align **só** com evidência: build atrás, DPL misto, chunk mismatch, ou API oficial à frente.
 * - Cooperado: align **pós-interação** no cold start; exceção = probe leve imediato se bundle < nuvem.
 * - Preservar sessão + AppData; purge de Cache API no align, não apagar operacional local.
 *
 * ## Operação / deploy
 * - Toda publicação deve atualizar `APP_BUILD_VERSION` + passar em CI.
 * - Validar `data-app-build` e `git` em `/login` após deploy.
 * - Diagnóstico campo: `/pwa-diag.html`, badge `vNNN` no cooperado.
 *
 * @see cooperadoProductionUpdatePhilosophy.ts
 */

export const PWA_RELEASE_INTEGRITY_POLICY = {
  /** Observa carregamento de chunks com dpl diferente do HTML. */
  inlineChunkDplAlignGuard: true,
  /** Compara bundle embutido vs `/api/client-release` após interação. */
  cooperadoIntegrityWatchDelaysMs: [12_000, 30_000, 60_000, 120_000] as const,
  /** Shield completo adiado (não bloquear 1º frame). */
  cooperadoDeferredShieldBootMs: 45_000,
  staffDeferredShieldBootMs: 90_000,
  /** Mínimo entre probes de foreground (evita rajada). */
  integrityProbeMinGapMs: 20_000,
} as const;

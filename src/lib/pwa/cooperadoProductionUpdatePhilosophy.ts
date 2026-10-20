/**
 * Filosofia de atualização — cooperado mobile / PWA em produção
 * ----------------------------------------------------------------
 *
 * 1. **Abrir ≠ operar** — Na abertura só pintar shell e dados já locais.
 *    Manutenção pesada só após primeira interação (toque/scroll) ou idle longo.
 *
 * 2. **Sem reload surpresa** — Nunca `location.reload()` em massa por época de deploy.
 *    Reload só quando release shield detecta chunk/DPL incompatível (já existente).
 *
 * 3. **Preservar verdade local** — Não apagar sessão, AppData operacional nem rascunhos
 *    de entrega. Snapshots de UI (card início, resumos) podem ser invalidados por época.
 *
 * 4. **Service Worker é último recurso** — Não desregistrar SW em “limpeza de frota”
 *    nem no align do atalho instalado (WebAPK). Cache API + `registration.update()` +
 *    um `location.replace` depois do cold start. Nunca limpar cookie/sessão para atualizar.
 *
 * 5. **Uma alavanca por época** — `COOPERADO_FLEET_MAINTENANCE_EPOCH` sobe quando precisar
 *    invalidar cache de UI em todos os aparelhos; não amarrar a cada `APP_BUILD_VERSION`.
 *
 * 6. **Respeitar fluxo crítico** — Com anexar/envio de fotos ativo, adiar manutenção.
 *
 * 7. **Fail-open** — Falha na manutenção não bloqueia login nem navegação.
 *
 * 8. **Cooperado GA** — Sync operacional_full continua manual / event-driven leve;
 *    deploy não dispara sync completo na abertura.
 *
 * 9. **Integridade de chunks (L0–L4)** — Ver `pwaReleaseIntegrityStrategy.ts`:
 *    guards inline (DPL/build), release shield, vigia cooperado 12s→120s.
 *    Tab keep-alive não pode executar JS antigo sem probe vs `/api/client-release`.
 *
 * 10. **Build ≠ comportamento** — Badge `vNNN` vem do bundle; HTML `data-app-build` pode
 *     divergir até align. Diagnóstico: `/pwa-diag.html` + comparar com nuvem.
 */

import {
  COOPERADO_FLEET_MAINTENANCE_DONE_KEY,
  COOPERADO_FLEET_MAINTENANCE_EPOCH,
} from "@/lib/pwa/cooperadoFleetCachePurgeOnce";

/** Sinalização para ferramentas/diagnóstico — política ativa no cliente. */
export const COOPERADO_PRODUCTION_UPDATE_POLICY = {
  deferUntilPostInteractive: true,
  allowForcedReloadOnFleetMaintenance: false,
  allowServiceWorkerUnregisterOnFleetMaintenance: false,
  preserveSessionAndOperationalAppData: true,
  maintenanceEpoch: COOPERADO_FLEET_MAINTENANCE_EPOCH,
  maintenanceDoneStorageKey: COOPERADO_FLEET_MAINTENANCE_DONE_KEY,
} as const;

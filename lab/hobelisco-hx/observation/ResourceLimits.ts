/** Limites de recurso — DROP_WITH_AUDIT, sem crash loop */

export interface ResourceLimitsConfig {
  maxEventBytes: number;
  maxMetadataKeys: number;
  maxBatchSize: number;
  maxQueueSize: number;
  maxRetries: number;
  maxPersistPerCycle: number;
}

export const DEFAULT_RESOURCE_LIMITS: ResourceLimitsConfig = {
  maxEventBytes: 16_384,
  maxMetadataKeys: 32,
  maxBatchSize: 50,
  maxQueueSize: 500,
  maxRetries: 3,
  maxPersistPerCycle: 100,
};

export interface ResourceCheckResult {
  allowed: boolean;
  reason?: string;
  action?: "DROP_WITH_AUDIT";
}

export function checkEventSize(
  payload: string,
  limits: ResourceLimitsConfig = DEFAULT_RESOURCE_LIMITS
): ResourceCheckResult {
  if (Buffer.byteLength(payload, "utf8") > limits.maxEventBytes) {
    return { allowed: false, reason: "event_too_large", action: "DROP_WITH_AUDIT" };
  }
  return { allowed: true };
}

export function checkMetadataKeys(
  count: number,
  limits: ResourceLimitsConfig = DEFAULT_RESOURCE_LIMITS
): ResourceCheckResult {
  if (count > limits.maxMetadataKeys) {
    return { allowed: false, reason: "metadata_too_large", action: "DROP_WITH_AUDIT" };
  }
  return { allowed: true };
}

export function checkQueueCapacity(
  currentSize: number,
  limits: ResourceLimitsConfig = DEFAULT_RESOURCE_LIMITS
): ResourceCheckResult {
  if (currentSize >= limits.maxQueueSize) {
    return { allowed: false, reason: "queue_full", action: "DROP_WITH_AUDIT" };
  }
  return { allowed: true };
}

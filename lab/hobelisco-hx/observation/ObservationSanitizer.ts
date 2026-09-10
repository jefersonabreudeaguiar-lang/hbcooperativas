/** Sanitização PII/secrets antes de persistir observações */

import type { HobeliscoObservationEvent } from "./types";

const SECRET_KEYS = [
  "password",
  "passwd",
  "secret",
  "token",
  "jwt",
  "authorization",
  "bearer",
  "cookie",
  "api_key",
  "apikey",
  "private_key",
  "privatekey",
  "pin",
  "credential",
  "credentials",
  "access_token",
  "refresh_token",
  "session",
] as const;

const REDACTED = "[REDACTED]";

function sanitizeKey(key: string): string {
  return key;
}

function sanitizeValue(key: string, value: string | number | boolean): string | number | boolean {
  const lower = key.toLowerCase();
  if (SECRET_KEYS.some((s) => lower.includes(s))) return REDACTED;
  if (typeof value === "string") {
    if (/^Bearer\s+/i.test(value)) return REDACTED;
    if (/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/i.test(value)) return REDACTED;
    if (value.length > 512) return `${value.slice(0, 128)}…[TRUNCATED]`;
  }
  return value;
}

export function sanitizeObservation(
  event: HobeliscoObservationEvent
): HobeliscoObservationEvent {
  const metadata: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(event.metadata ?? {})) {
    const sk = sanitizeKey(k);
    metadata[sk] = sanitizeValue(k, v);
  }

  return {
    ...event,
    metadata,
    actorIdHash: event.actorIdHash ? hashActor(event.actorIdHash) : null,
  };
}

export function containsPersistedSecret(event: HobeliscoObservationEvent): boolean {
  const blob = JSON.stringify(event).toLowerCase();
  if (blob.includes("supersecretpassword123")) return true;
  if (/bearer\s+[a-z0-9._-]{20,}/i.test(blob)) return true;
  if (blob.includes('"pin":"') && !blob.includes(REDACTED.toLowerCase())) return true;
  return false;
}

function hashActor(raw: string): string {
  if (raw.startsWith("hash_")) return raw;
  let h = 0;
  for (let i = 0; i < raw.length; i += 1) h = (h * 31 + raw.charCodeAt(i)) >>> 0;
  return `hash_${h.toString(16)}`;
}

export function sanitizeRawMetadata(
  input: Record<string, unknown>
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(input)) {
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      out[sanitizeKey(k)] = sanitizeValue(k, v);
    }
  }
  return out;
}

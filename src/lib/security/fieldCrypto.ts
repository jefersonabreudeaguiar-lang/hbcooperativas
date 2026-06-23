import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { getFieldEncryptionKey } from "@/lib/security/env";

const PREFIX = "enc:v1:";

function deriveKey(): Buffer | null {
  const raw = getFieldEncryptionKey();
  if (!raw) return null;
  return createHash("sha256").update(raw).digest();
}

export function encryptSensitiveField(plain: string): string {
  if (!plain) return plain;
  const key = deriveKey();
  if (!key) return plain;

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptSensitiveField(value: string): string {
  if (!value || !value.startsWith(PREFIX)) return value;
  const key = deriveKey();
  if (!key) return value;

  const payload = value.slice(PREFIX.length);
  const [ivB64, tagB64, dataB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !dataB64) return value;

  try {
    const iv = Buffer.from(ivB64, "base64url");
    const tag = Buffer.from(tagB64, "base64url");
    const data = Buffer.from(dataB64, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    return value;
  }
}

export function isEncryptedField(value: string): boolean {
  return value.startsWith(PREFIX);
}

/** TOTP RFC 6238 — sem dependências externas */

import { createHmac, randomBytes } from "crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function generateTotpSecret(length = 20): string {
  const bytes = randomBytes(length);
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output.slice(0, 32);
}

function base32Decode(input: string): Buffer {
  const cleaned = input.replace(/=+$/, "").toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function hotp(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", secret).update(buf).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const code =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  return String(code % 1_000_000).padStart(6, "0");
}

export function generateTotpCode(secretBase32: string, timeMs = Date.now(), window = 0): string {
  const counter = Math.floor(timeMs / 1000 / 30) + window;
  return hotp(base32Decode(secretBase32), counter);
}

export function verifyTotpCode(secretBase32: string, token: string, window = 1): boolean {
  const normalized = token.replace(/\D/g, "").padStart(6, "0").slice(-6);
  if (normalized.length !== 6) return false;
  for (let w = -window; w <= window; w++) {
    if (generateTotpCode(secretBase32, Date.now(), w) === normalized) return true;
  }
  return false;
}

export function buildTotpUri(secret: string, email: string, issuer = "HB Cooperativas"): string {
  const label = encodeURIComponent(`${issuer}:${email}`);
  const q = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: "6",
    period: "30",
  });
  return `otpauth://totp/${label}?${q.toString()}`;
}

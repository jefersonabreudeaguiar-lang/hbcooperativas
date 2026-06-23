import bcrypt from "bcryptjs";

const BCRYPT_PREFIX = "$2";
const ROUNDS = 12;

export function isPasswordHash(value: string): boolean {
  return typeof value === "string" && value.startsWith(BCRYPT_PREFIX) && value.length >= 50;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export function hashPasswordSync(plain: string): string {
  return bcrypt.hashSync(plain, ROUNDS);
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  if (!stored) return false;
  if (isPasswordHash(stored)) {
    return bcrypt.compare(plain, stored);
  }
  return plain === stored;
}

export function verifyPasswordSync(plain: string, stored: string): boolean {
  if (!stored) return false;
  if (isPasswordHash(stored)) {
    return bcrypt.compareSync(plain, stored);
  }
  return plain === stored;
}

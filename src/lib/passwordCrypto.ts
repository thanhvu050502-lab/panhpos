/**
 * Password hashing using Web Crypto PBKDF2-SHA256.
 * Format: `pbkdf2$<iter>$<saltB64>$<hashB64>`
 *
 * Why PBKDF2 + Web Crypto: no extra dependency, key stretching prevents
 * brute force on stolen localStorage dumps, async-safe in the browser.
 */

const ITER = 100_000;
const HASH_BITS = 256;
const SALT_BYTES = 16;

const b64 = {
  encode(bytes: Uint8Array) {
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  },
  decode(str: string) {
    const bin = atob(str);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
};

async function pbkdf2(password: string, salt: Uint8Array, iter: number) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, hash: 'SHA-256', iterations: iter },
    keyMaterial,
    HASH_BITS
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await pbkdf2(password, salt, ITER);
  return `pbkdf2$${ITER}$${b64.encode(salt)}$${b64.encode(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (!stored || !stored.startsWith('pbkdf2$')) return false;
  const parts = stored.split('$');
  if (parts.length !== 4) return false;
  const iter = Number(parts[1]);
  if (!Number.isFinite(iter) || iter < 1000) return false;
  try {
    const salt = b64.decode(parts[2]);
    const expected = b64.decode(parts[3]);
    const got = await pbkdf2(password, salt, iter);
    if (got.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < got.length; i++) diff |= got[i] ^ expected[i];
    return diff === 0;
  } catch {
    return false;
  }
}

export const isHashed = (v?: string | null) => !!v && v.startsWith('pbkdf2$');

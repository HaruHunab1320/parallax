import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

// OWASP's minimum scrypt configuration. Node performs this off the event loop.
const COST = 131072;
const BLOCK_SIZE = 8;
const PARALLELISM = 1;
const KEY_LENGTH = 64;
let activeDerivations = 0;
const pendingDerivations: Array<() => void> = [];

export class PasswordServiceBusyError extends Error {
  readonly code = 'PASSWORD_SERVICE_BUSY';
  readonly statusCode = 503;
  constructor() {
    super('Password service is busy; try again later');
  }
}

export const passwordSchema = z
  .string()
  .min(8)
  .max(1024)
  .regex(/[a-zA-Z]/, 'Password must contain a letter')
  .regex(/\d/, 'Password must contain a number')
  .describe('Password, 8–1024 characters including a letter and a number');

async function deriveKey(password: string, salt: string): Promise<Buffer> {
  // At most two 128 MiB jobs at once, with a bounded queue shared by all routes.
  if (activeDerivations >= 2) {
    if (pendingDerivations.length >= 16) throw new PasswordServiceBusyError();
    await new Promise<void>((resolve) => pendingDerivations.push(resolve));
  } else {
    activeDerivations++;
  }
  try {
    return await new Promise((resolve, reject) => {
      scrypt(
        password,
        salt,
        KEY_LENGTH,
        {
          N: COST,
          r: BLOCK_SIZE,
          p: PARALLELISM,
          maxmem: 192 * 1024 * 1024,
        },
        (error, key) => (error ? reject(error) : resolve(key))
      );
    });
  } finally {
    const next = pendingDerivations.shift();
    if (next) next();
    else activeDerivations--;
  }
}

export async function hashPassword(password: string): Promise<string> {
  z.string().max(1024).parse(password);
  const salt = randomBytes(16).toString('hex');
  const key = await deriveKey(password, salt);
  return `scrypt$${COST}$${BLOCK_SIZE}$${PARALLELISM}$${salt}$${key.toString('hex')}`;
}

export function isLegacyPasswordHash(storedHash: string): boolean {
  return /^[a-f0-9]{32}:[a-f0-9]{64}$/.test(storedHash);
}

export async function verifyPassword(
  password: string,
  storedHash: string
): Promise<boolean> {
  if (typeof password !== 'string' || password.length > 1024) return false;
  if (isLegacyPasswordHash(storedHash)) {
    const [salt, hash] = storedHash.split(':');
    const actual = createHash('sha256')
      .update(salt + password)
      .digest();
    return timingSafeEqual(Buffer.from(hash, 'hex'), actual);
  }

  const parts = storedHash.split('$');
  // Accept only our supported parameters; corrupted records cannot request unbounded work.
  if (
    parts.length !== 6 ||
    parts[0] !== 'scrypt' ||
    parts[1] !== String(COST) ||
    parts[2] !== String(BLOCK_SIZE) ||
    parts[3] !== String(PARALLELISM) ||
    !/^[a-f0-9]{32}$/.test(parts[4]) ||
    !/^[a-f0-9]{128}$/.test(parts[5])
  )
    return false;
  const actual = await deriveKey(password, parts[4]);
  return timingSafeEqual(Buffer.from(parts[5], 'hex'), actual);
}

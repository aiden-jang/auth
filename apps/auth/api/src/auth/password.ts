import { argon2id, argon2Verify } from 'hash-wasm';

// argon2id, WASM (native argon2 can't run on Workers). OWASP baseline sized to fit
// the Workers 128MB memory limit: 19 MiB, 2 iterations, 1 lane.
const PARAMS = { parallelism: 1, iterations: 2, memorySize: 19456, hashLength: 32 } as const;

/** Returns an encoded `$argon2id$...` string (salt + params embedded). */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return argon2id({ password, salt, ...PARAMS, outputType: 'encoded' });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2Verify({ password, hash });
  } catch {
    return false;
  }
}

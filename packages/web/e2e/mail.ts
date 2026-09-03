import { readFileSync } from 'node:fs';
import { expect } from '@playwright/test';
import { WORKER_LOG } from '../playwright.config';

/* The database stores only a token's hash, so the raw one exists nowhere but the mail -- which the
   worker prints instead of sending when there is no RESEND_API_KEY. */
export async function linkEmailedTo(email: string, path: string): Promise<string> {
  const find = (): string | null => {
    // Split on the log's own prefix and read only the block addressed to this account. Scanning the
    // whole file with one expression picked up a neighbouring test's token.
    for (const block of readFileSync(WORKER_LOG, 'utf8').split('[email:dev] ')) {
      if (!block.startsWith(`to=${email} `)) continue;
      const link = new RegExp(`(http://localhost:34110${path}\\?token=[\\w-]+)`).exec(block);
      if (link) return link[1] ?? null;
    }
    return null;
  };
  await expect
    .poll(find, {
      message: `no ${path} mail for ${email} appeared in the worker log`,
      timeout: 15_000,
    })
    .not.toBeNull();
  return find()!;
}

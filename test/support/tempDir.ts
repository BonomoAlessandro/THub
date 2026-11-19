import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach } from 'vitest';

const created: string[] = [];

afterEach(() => {
  for (const dir of created.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

/** Legt einen leeren Temp-Ordner an, der nach dem Test wieder gelöscht wird. */
export function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'thub-test-'));
  created.push(dir);
  return dir;
}

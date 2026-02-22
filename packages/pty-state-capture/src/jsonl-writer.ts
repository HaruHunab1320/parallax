import { mkdir, appendFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export async function ensureParent(filePath: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
}

export async function writeJsonLine(filePath: string, value: unknown): Promise<void> {
  await ensureParent(filePath);
  await appendFile(filePath, `${JSON.stringify(value)}\n`, 'utf8');
}

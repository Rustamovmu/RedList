import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

/**
 * Where media bytes live (PLAN §3 "Storage"). The database stores only metadata and a storage key.
 * R1 ships the local-disk adapter; an S3-compatible adapter is part of the M5 deployment work (DECISIONS D-022).
 *
 * Keys are `<sha256 hex>/<width>.webp`. They are built by the media service, never taken from a request
 * as-is: `assertKey` rejects anything else, so no path can escape the media directory.
 */
export interface StorageAdapter {
  put(key: string, bytes: Buffer): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  exists(key: string): Promise<boolean>;
  remove(prefix: string): Promise<void>;
}

export const STORAGE = Symbol('STORAGE');

const KEY = /^[a-f0-9]{64}\/\d{2,4}\.webp$/;
const PREFIX = /^[a-f0-9]{64}$/;

export function variantKey(storageKey: string, width: number): string {
  return `${storageKey}/${width}.webp`;
}

function assertKey(key: string) {
  if (!KEY.test(key)) throw new Error('Invalid storage key');
}

export class LocalDiskStorage implements StorageAdapter {
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  private path(key: string) {
    return join(this.root, key);
  }

  async put(key: string, bytes: Buffer) {
    assertKey(key);
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true });
    // Write then rename, so a reader never sees a half-written file.
    const tmp = `${p}.${process.pid}.tmp`;
    await writeFile(tmp, bytes);
    await rename(tmp, p);
  }

  async get(key: string) {
    assertKey(key);
    try {
      return await readFile(this.path(key));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw e;
    }
  }

  async exists(key: string) {
    assertKey(key);
    try {
      return (await stat(this.path(key))).isFile();
    } catch {
      return false;
    }
  }

  async remove(prefix: string) {
    if (!PREFIX.test(prefix)) throw new Error('Invalid storage prefix');
    await rm(join(this.root, prefix), { recursive: true, force: true });
  }
}

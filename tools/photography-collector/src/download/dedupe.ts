import { readdir } from "node:fs/promises";
import { extname, join } from "node:path";
import type { CollectionLedger } from "../types.js";
import { findEntryByHash } from "../storage/ledger.js";
import { sha256File } from "./hash.js";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

export interface DuplicateCheck {
  readonly duplicate: boolean;
  readonly existingPath?: string;
}

export function checkDuplicate(ledger: CollectionLedger, sha256: string): DuplicateCheck {
  const existing = findEntryByHash(ledger, sha256);
  if (existing === undefined) return { duplicate: false };
  return { duplicate: true, existingPath: existing.localPath };
}

export async function checkFilesystemDuplicate(collectionRoot: string, sha256: string): Promise<DuplicateCheck> {
  const entries = await readdir(collectionRoot, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!IMAGE_EXTENSIONS.has(extname(entry.name).toLowerCase())) continue;

    const path = join(collectionRoot, entry.name);
    const existingHash = await sha256File(path);
    if (existingHash === sha256) {
      return { duplicate: true, existingPath: path };
    }
  }

  return { duplicate: false };
}

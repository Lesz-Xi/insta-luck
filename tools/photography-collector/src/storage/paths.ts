import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export function defaultCollectionRoot(): string {
  return resolve(here, "../../../../");
}

export function defaultLedgerPath(collectionRoot = defaultCollectionRoot()): string {
  return resolve(collectionRoot, "collection-ledger.json");
}

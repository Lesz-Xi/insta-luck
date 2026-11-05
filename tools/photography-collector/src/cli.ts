#!/usr/bin/env node
import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { errorMessage } from "./errors.js";
import { normalizeInstagramUrl } from "./instagramUrl.js";
import { downloadCandidate } from "./download/downloader.js";
import { sha256File } from "./download/hash.js";
import { readLedger } from "./storage/ledger.js";
import { defaultCollectionRoot, defaultLedgerPath } from "./storage/paths.js";
import { PublicReaderResolver } from "./resolvers/publicReaderResolver.js";
import { renderCandidates } from "./ui/renderCandidates.js";
import { parseSelection, promptSelection } from "./ui/prompt.js";
import type { MediaCandidate } from "./types.js";

interface ParsedArgs {
  readonly command: string | undefined;
  readonly positional: readonly string[];
  readonly flags: ReadonlyMap<string, string | boolean>;
}

async function main(argv: readonly string[]): Promise<void> {
  const args = parseArgs(argv);
  switch (args.command) {
    case "save":
      await saveCommand(args);
      return;
    case "list":
      await listCommand(args);
      return;
    case "verify":
      await verifyCommand(args);
      return;
    default:
      printHelp();
  }
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const [command, ...rest] = argv;
  const positional: string[] = [];
  const flags = new Map<string, string | boolean>();

  for (let index = 0; index < rest.length; index += 1) {
    const item = rest[index];
    if (item === undefined) continue;
    if (!item.startsWith("--")) {
      positional.push(item);
      continue;
    }

    const key = item.slice(2);
    const next = rest[index + 1];
    if (next !== undefined && !next.startsWith("--")) {
      flags.set(key, next);
      index += 1;
    } else {
      flags.set(key, true);
    }
  }

  return { command, positional, flags };
}

async function saveCommand(args: ParsedArgs): Promise<void> {
  const url = args.positional[0];
  if (url === undefined) throw new Error("Missing Instagram URL.");

  const collectionRoot = getStringFlag(args, "collection", defaultCollectionRoot());
  const ledgerPath = getStringFlag(args, "ledger", defaultLedgerPath(collectionRoot));
  const normalized = normalizeInstagramUrl(url);
  const resolver = new PublicReaderResolver();
  const candidates = await resolver.resolve(normalized);

  console.log(`Source: ${normalized.canonicalUrl}`);
  console.log(renderCandidates(candidates));

  if (args.flags.get("dry-run") === true) return;

  const selectedIndexes = getStringFlag(args, "select") === undefined
    ? await promptSelection(candidates.length)
    : parseSelection(getStringFlag(args, "select", ""), candidates.length);

  if (selectedIndexes.length === 0) {
    console.log("No valid candidates selected. Nothing downloaded.");
    return;
  }

  for (const selectedIndex of selectedIndexes) {
    const candidate = candidates[selectedIndex - 1];
    if (candidate === undefined) continue;
    await saveCandidate(candidate, args, collectionRoot, ledgerPath);
  }
}

async function saveCandidate(candidate: MediaCandidate, args: ParsedArgs, collectionRoot: string, ledgerPath: string): Promise<void> {
  const manualName = getStringFlag(args, "name");
  const downloadOptions = {
    collectionRoot,
    ledgerPath,
    ...(manualName === undefined ? {} : { manualName }),
    overwrite: args.flags.get("overwrite") === true,
    ...(args.flags.get("skip-dns-check") === true ? { resolveDns: false } : {})
  };
  const result = await downloadCandidate(candidate, downloadOptions);

  switch (result.status.type) {
    case "downloaded":
      console.log(`Saved: ${result.status.path}`);
      console.log(`SHA-256: ${result.status.sha256}`);
      return;
    case "duplicate":
      console.log(`Duplicate: already saved at ${result.status.existingPath}`);
      console.log(`SHA-256: ${result.status.sha256}`);
      return;
    case "failed":
      console.log(`Failed: ${result.status.code} — ${result.status.message}`);
      return;
    case "candidate":
      return;
  }
}

async function listCommand(args: ParsedArgs): Promise<void> {
  const collectionRoot = getStringFlag(args, "collection", defaultCollectionRoot());
  const ledger = await readLedger(getStringFlag(args, "ledger", defaultLedgerPath(collectionRoot)));
  if (ledger.entries.length === 0) {
    console.log("Collection ledger is empty.");
    return;
  }

  for (const entry of ledger.entries) {
    console.log(`${entry.filename}\n  ${entry.sha256}\n  ${entry.originalUrl}`);
  }
}

async function verifyCommand(args: ParsedArgs): Promise<void> {
  const collectionRoot = getStringFlag(args, "collection", defaultCollectionRoot());
  const ledger = await readLedger(getStringFlag(args, "ledger", defaultLedgerPath(collectionRoot)));
  let failures = 0;

  for (const entry of ledger.entries) {
    try {
      await stat(entry.localPath);
      const hash = await sha256File(entry.localPath);
      const ok = hash === entry.sha256;
      if (!ok) failures += 1;
      console.log(`${ok ? "OK" : "FAIL"} ${entry.filename}`);
    } catch (error) {
      failures += 1;
      console.log(`FAIL ${entry.filename}: ${errorMessage(error)}`);
    }
  }

  if (failures > 0) process.exitCode = 1;
}

function getStringFlag(args: ParsedArgs, key: string): string | undefined;
function getStringFlag(args: ParsedArgs, key: string, fallback: string): string;
function getStringFlag(args: ParsedArgs, key: string, fallback?: string): string | undefined {
  const value = args.flags.get(key);
  if (typeof value === "string") return value;
  return fallback;
}

function printHelp(): void {
  console.log(`photography-collector

Commands:
  save <instagram-url> [--dry-run] [--select 1,2] [--name filename.jpeg]
  list
  verify

Options:
  --collection <path>       Collection folder. Defaults to current photography_collections root.
  --ledger <path>           Ledger path. Defaults to collection-ledger.json in collection folder.
  --skip-dns-check          Testing escape hatch only; do not use for untrusted URLs.
`);
}

main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(errorMessage(error));
  process.exitCode = 1;
});

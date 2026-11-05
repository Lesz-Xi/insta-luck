# Insta Luck

A local-first Instagram post image collector: preview media candidates, choose what to save, and keep a verified local collection ledger.

## Run the web app

```bash
cd tools/photography-collector
npm ci
npm run web
```

Open <http://localhost:4177>, paste a public Instagram post URL, choose a candidate, and download it. The port can be changed with `PHOTOGRAPHY_COLLECTOR_PORT`.

## CLI

From `tools/photography-collector`:

```bash
npm run collector -- save "https://www.instagram.com/p/SHORTCODE/"
npm run collector -- list
npm run collector -- verify
```

The `save` command shows candidates before prompting for selection. Use `--dry-run` to inspect without downloading, or `--select 1,2` to choose candidate indexes non-interactively. Run `npm run collector --` to see all options.

## What it does

- Normalizes Instagram post and Reel URLs.
- Resolves visible public-page candidates for manual selection; related thumbnails are distinguished from likely post media.
- Validates media URLs and downloaded image bytes, computes SHA-256, and detects duplicates.
- Records downloads in a local JSON ledger.

The public-reader resolver depends on what Instagram and its public page reader expose, so results can vary. This is a personal archiving tool, not a hosted downloader. It does not store Instagram credentials or bypass private-content controls, CAPTCHAs, or other access restrictions. Only save media you are authorized to access and archive.

## Local collection data

By default, downloaded files and `collection-ledger.json` are written to the repository root. They are local collection data, ignored by Git, and are intentionally not included in this repository. Back them up separately if needed; do not commit or publish them.

## Development

```bash
cd tools/photography-collector
npm ci
npm test
npm run typecheck
npm run build
```

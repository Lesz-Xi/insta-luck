# Insta Luck

Turn the public Instagram links you find into one inspectable sheet and an explicit download.

You do the browsing. Paste a post, Reel or profile, or a list of them, and each link lands on one sheet as numbered, uncropped frames, each saying why it sits where it does. An image two links share appears once. Nothing is chosen until you mark it.

| Route | What it is |
| --- | --- |
| `/` | The landing page: what the tool does, a labeled sample sheet, and its limits |
| `/app` | The sheet: paste links, review the frames, download what you marked |
| `tools/photography-collector` | The local CLI and web tool, which keep a verified archive on your disk |

## What it can and can't do

- Public pages only. It never asks for an Instagram login, and when Instagram demands one it says so.
- Any post, Reel or profile link works as input, including `/<user>/p/…`, `m.instagram.com` and `instagr.am` forms. Stories don't, because they need a login.
- A profile link is read from Instagram's public embed page, so it returns a few recent posts, not the whole account. Any older post is reachable by pasting its own link.
- A sheet holds 20 links, read one at a time. There is no download-all and no walking through an account, on purpose: see the terms note in [docs/DEPLOY.md](docs/DEPLOY.md).
- Results can be incomplete, so no set is ever called complete.
- The sort is an estimate. Likely post images come first, each frame shows what its place rests on, and profile pictures are left out of post and Reel sheets.
- Images only. A Reel link may return a still, not the video.
- Hosted downloads are individual files handed to your browser. The hosted tool keeps no archive and no history; that belongs to the local CLI.
- Your link goes to the server and to [Jina Reader](https://github.com/jina-ai/reader), a public page reader.
- Save only what you're authorized to save. Insta Luck isn't affiliated with Instagram or Meta.

## Run it

```bash
npm ci
npm run dev:sample   # the whole interface with scripted upstreams; no network
npm run dev          # Vite with the real upstreams; needs a .env
npm run build && npm start   # the built site, served the way Vercel serves it
```

`npm run dev` and `npm start` stay closed until `.env` opens them; see `.env.example`.

## Local CLI

```bash
cd tools/photography-collector
npm ci
npm run collector -- save "https://www.instagram.com/p/SHORTCODE/"
npm run collector -- list
npm run collector -- verify
npm run web    # the local web tool, on port 4177
```

`save` shows the candidates before prompting. `--dry-run` inspects without downloading, and `--select 1,2` chooses non-interactively. Downloaded files and `collection-ledger.json` go to the repository root by default. They're ignored by Git; back them up separately and don't publish them.

## Verify

```bash
npm run typecheck
npm test            # handlers, state, classifier, fetch boundary
npm run test:e2e    # real browsers against scripted upstreams
```

Automated tests never contact Instagram. A live check is separate evidence; see [docs/DEPLOY.md](docs/DEPLOY.md).

## How it's built

`hosted/` is the server operation as plain request-to-response functions, and `api/` is a one-line Vercel entry for each. `tools/photography-collector/src` holds the shared core: link parsing, classification, the bounded fetch path and image checks. The CLI and the hosted tool are separate delivery adapters over that core.

Nothing is held between requests. A candidate travels inside a short-lived reference encrypted with AES-256-GCM and bound to the visitor's session, so preview and download work on any instance, and CDN URLs never reach the browser.

Deployment, environment variables and release gates: [docs/DEPLOY.md](docs/DEPLOY.md). The design brief is in [CLAUDE_HANDOFF.md](CLAUDE_HANDOFF.md).

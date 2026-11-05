# Insta Luck — landing page + collection workspace

**Handoff to:** Claude Code (repository implementation); Claude Design may prototype the surfaces, but cannot certify the backend or deployment.
**Prepared:** 2026-11-05
**Repository:** https://github.com/Lesz-Xi/insta-luck
**Local checkout:** `/Users/lesz/Projects/insta-luck`
**Inspected baseline:** `84a8443` — `feat: add insta luck collector`
**Status:** Direction chosen 2026-11-05; the approved brief is recorded at the end of §4. This document is a handoff, not implementation, release approval, or a security certification.

## 1. Assignment

Create one coherent product with two deliberately different surfaces:

- `/` — a high-production landing page that explains the tool honestly and leads into it.
- `/app` — a separate minimal, modern workspace for resolving a public Instagram post link, reviewing image candidates, and downloading selected images.

Also resolve the hosting mismatch: the current repository is a local Node application, not yet an inspected Vercel web application. Do not deliver a beautiful landing page over a broken tool.

Preserve the working CLI and its local collection behavior. Do not commit Chief's photos, collection ledger, credentials, or local runtime state. Do not auto-deploy, change production settings, or purchase services; prepare and verify locally, then report the deployment instructions and any remaining release gates.

## 2. Evidence and limits — read before designing

### Observed

- Chief's attached screenshot says **Deployed to Production**, but its embedded preview says **This page doesn't exist / 404 NOT_FOUND**. This is screenshot evidence, not a live deployment inspection. The production URL and Vercel project configuration were not supplied or inspected.
- At the inspected baseline there is no root `package.json`, no tracked `vercel.json`, and no separate landing page or app framework.
- The package is under `tools/photography-collector`. Its `web` script runs `tsx src/webServer.ts`; its build compiles TypeScript, not a frontend bundle.
- `src/webServer.ts` starts a Node HTTP listener and serves `renderWebPage()` at `/`. It exposes `POST /api/resolve`, `POST /api/download`, and `GET /api/media/:id`.
- Candidate data lives in a process-local `Map`. Download responses report a server-local path; the handler saves image bytes and updates a JSON ledger on that server.
- `src/storage/paths.ts` resolves the default collection directory to the repository root. This is useful locally, not durable hosted storage.
- The active public-reader resolver fetches `r.jina.ai` and heuristically classifies image candidates. The browser-visible and official API modules are not evidence that those flows are wired into the current web app.
- Previous baseline verification reported 20 tests passing, successful typecheck/build, and zero npm audit findings after a Vitest upgrade. Re-run checks on your actual changes; this is not proof of hosted safety or live Instagram reliability.

### Inference / unresolved

- The local-server/build layout is a plausible contributor to the 404. The exact cause is unverified without Vercel's settings, build output, and routing evidence. Do not claim it diagnosed from the screenshot alone.
- A local filesystem write is not a download to a hosted visitor's device. Vercel temporary files and warm-process memory must not be treated as a durable archive or a shared state contract across requests.
- The reader URL builder currently returns ``https://r.jina.ai/http://${input.canonicalUrl}``. Inspect the resulting URL and test the intended provider contract; do not silently assume this composition is correct or repair it without a regression test.
- Private posts, full-profile extraction, complete carousel enumeration, original upload quality, and video downloading are not established capabilities.

Re-read the current checkout before editing. Chief may have made changes since this handoff.

## 3. Product decision — /think-different

**Inherited representation:** a generic Instagram downloader with a promotional skin, or a local archive tool placed unchanged on a cloud host.

**Lived transformation:** someone with a post link can see what the tool actually found, choose the right images, and obtain those files without confusion about unrelated thumbnails or where the files went.

**Real object of design:** a bounded review-and-download operation, not a social-media dashboard.

**Product soul:** **Turn a public Instagram post link into an inspectable image selection and an explicit download, without pretending that every visible thumbnail belongs to the post.**

### Preserve / invent / cut

| Preserve | Invent or adapt | Cut or defer |
|---|---|---|
| URL normalization and typed media candidates | Separate explanation and task routes | Accounts, billing, social feeds, analytics dashboards |
| Candidate provenance and uncertainty | Hosted download delivery to the visitor | Bulk profile mirroring and private-account promises |
| Image validation and content hashing | A clear selection and recovery model | A cloud collection database in v1 |
| CLI, local ledger, local duplicate detection | Vercel-compatible request lifecycle | Automatic downloads of all resolver results |
| Explicit refusal of unsafe input | Honest browser download feedback | Decorative app motion and mandatory onboarding |

### Integrations that earn their place

- Preview, classification, selection, and result belong in one workspace: users should not translate between multiple tools to identify the correct image.
- Keep source links and classification adjacent to images: this reduces mistaken downloads.
- Share brand, vocabulary, and a small component/token system across both routes. Do not duplicate the marketing experience inside the workspace.

### Tradeoffs

- Separating the landing and workspace adds one navigation step; direct access to `/app` keeps repeat use quick.
- Hosted v1 gives up the local tool's durable archive and global duplicate knowledge. Keep those capabilities in the CLI rather than misrepresenting them in the browser.
- A public reader may expose incomplete or ambiguous results. Honest uncertainty is preferable to claims of universal downloading.
- A public media endpoint introduces abuse, bandwidth, privacy, and security obligations. If those cannot be bounded, keep the hosted tool gated and publish only the landing page until ready.

## 4. Direction checkpoint — ask once, then stop for the choice

“High-production,” “minimal,” and “modern” are quality goals, not a fully selected visual language. Do not treat the recommendations below as Chief's approval. No chosen inspiration site or asset corpus has been supplied.

Before implementing new design, ask Chief:

> Which direction should Insta Luck take: **A. Photographic editorial**, **B. Precise digital utility**, or **C. Dark photographic studio**? I recommend A for the landing and a quieter utility expression of the same identity for the app. Keep native scrolling and no scroll-progress trail, or choose a different scroll treatment?

- **A — Photographic editorial (recommended, not approved):** imagery and deliberate type hierarchy explain the result; the app becomes a bright, restrained image-selection surface. Best fit for a photography collector.
- **B — Precise digital utility:** compact typographic hierarchy and a clear product demonstration; the app is the main expression. Less atmospheric, faster to understand.
- **C — Dark photographic studio:** dark viewing surfaces and larger imagery; controls remain quiet and contrast-tested. More immersive, but imagery and state legibility require careful exposure/contrast testing.

This is new synthesis, not a clone of Instagram, Apple, Linear, or another site. Use Insta Luck's identity; do not insert a Twin-Sparrow or XI house mark by default. After the choice, record the approved direction, type roles, palette, scroll behavior, focal gesture (if any), and exclusions **in this document** as the single working brief. Do not create competing briefs for every skill.

### Approved working brief (recorded 2026-11-05)

**Chief chose, through the §4 question:** A — Photographic editorial; native scrolling with no scroll-progress trail; a public-domain/CC0 image set. Everything else in this block is Claude's proposal under those three choices and may be corrected. Fidelity lane: new synthesis. No Twin-Sparrow or XI mark.

- **Representation:** a **contact sheet**. Every found image is a numbered, uncropped frame; rejects stay visible; choosing is a mark on the frame. The landing shows a labeled sample sheet and `/app` is the live one, so both routes share one object rather than one skin.
- **Show the reason, not a grade.** Evidence, 2026-11-05: post membership in `candidateClassifier.ts` is a date match, the reader's `More posts from…` line was discarded, and same-day neighbours came back `carousel_item` / `high`. So the UI never shows a confidence value. Each frame states why it sits where it does ("Same date as frame 01", "Listed under More posts", "Different date"), and the boundary signal is wired into the parser.
- **Groups:** "Likely from this post" and "Found nearby", divided by a rule. That rule is the source boundary. Nothing is marked by default.

**Behavior**

1. **Thesis:** everything found is laid out uncropped, and nothing is chosen until you mark it.
2. **Signature gesture:** the mark. A red chinagraph-style outline draws around a frame when it is chosen. It is the same gesture on both routes, and it only ever means "chosen". On the landing it draws once on the sample's two default marks when the sheet enters view, and the sample is labeled and can be toggled.
3. **Entry:** none. No loader or veil; content is present at first paint.
4. **Section handoff:** silence: whitespace and hairlines.
5. **Scroll:** native on both routes. Weight off, trail off.
6. **Feedback:** links underline; buttons invert ink and paper; selection is the mark plus a checked box plus a count, never colour alone.
7. **Rest state:** the landing rests as a finished printed sheet with marks already drawn (no-JS and reduced motion show this). `/app` rests as one labeled input.

**Motion:** one curve, `cubic-bezier(.2,.7,.2,1)`. Hover .24s; the mark .42s. Under reduced motion the same end state appears at once. No hover-dependent content.

**Type roles (two families, self-hosted, OFL):** Newsreader for display (optical size 72, light weight, roman plus italic) and for reading text and captions; Libre Franklin for controls, labels, status and frame numbers (tabular figures).

**Palette (four):** paper `#F3F2EE`, ink `#161514`, secondary `#66625B`, mark `#D0341A`. The mark has one job: chosen. Errors use ink plus an icon and words, never the mark colour. Near-neutral paper, because photographs are judged against it.

**Geometry and surfaces:** square corners throughout. On the landing, frames sit on a full-bleed black rebate. In `/app` they sit on a pale plate, which is the "quieter" expression. Cells are uniform and images use `object-fit: contain`, so nothing is cropped and frames do not shift when they load.

**Imagery:** Jean-Eugène-Auguste Atget, Art Institute of Chicago, CC0 public-domain designation. The museum requests the caption form "Artist. Title, Date. The Art Institute of Chicago."; per-image provenance lives in `web/public/samples/PROVENANCE.md`. The Versailles frames are all dated 1904, so "Same date as frame 01" is literally true of the sample. Rights checked against the museum's Open Access page on 2026-11-05.

**Change, 2026-11-05 (Chief):** profile links must work, which supersedes this document's earlier "do not prompt for an account/profile URL" and its deferral of profile extraction. Live evidence the same day: a profile page redirects logged-out readers to `/accounts/login/`, while the public embed page (`/<user>/embed/`) serves the profile picture and a few recent posts with no login. So a profile is read from the embed, with no credentials, spoofing or evasion, and the UI says it isn't the whole account. Bulk mirroring and private accounts stay out. Post and Reel sheets show no profile pictures at all: a live post page carried twelve commenters' pictures, a live Reel page led with a stranger's, and nothing on the page reliably identifies the account's own. Only a profile's embed page keeps its picture. A Reel's video isn't an image on the page, so a Reel sheet usually holds only other posts and claims none of them as its own.

**Change, 2026-11-05 (Chief): one sheet from many links, in the Lab's language.** This supersedes the single-link workspace, Direction A (photographic editorial, the red chinagraph mark) and native scrolling on the landing. Recorded after `/think-different`:

- **Product soul:** a contact sheet you build by hand from public Instagram links, one chosen post at a time, that shows what each page holds and sends you only what you marked. It rejects download-all, ZIPs, auto-scrolling, watched accounts, saved collections and any "next sheet" through an account.
- **Why not the official API:** read on 2026-11-05, Meta's Developer Policies bar using the Instagram Platform simply to display, import or back up content without prior permission. Chief chose "whole account" as reach, delivered by Chief doing the browsing. See `docs/DEPLOY.md`, Terms.
- **Fidelity lane: adaptation of our own house.** Values come from `xi_pro_lab/house/house.css`. The landing adapts `templates/odysxi/folio` (header, two-tone line, plate rows, numbered rules, footer, Feather 0.8). The sheet adapts the Lab's Place sheet (hairline frame, keep mark, source square) and workbench (rail, field, ink primary, chamfered panel, receipt, sun on the horizon).
- **Named adaptations:** Instrument Sans (OFL) stands in for Switzer, whose licence doesn't suit a public repository. The persimmon pigment means only "chosen". Folio's pale tone is deepened to clear 3:1. The Lab's keep mark stays visible at rest, because marking is the central act here. The frame is 4:5, not 4:3, because Instagram's images are mostly portrait.
- **Cut from the sources:** Folio's other routes and phone menu; the Lab's library, Find, Repertoire, Compose, View switch and 95% density; Direction A's mark and paper.
- **Scroll and motion:** Feather on the landing only; native on `/app`. No trail. Rows open as a folio page turns. Reduced motion gives the same end state at once.
- **Limits:** a sheet holds 20 links, read one at a time, and references last an hour instead of 15 minutes.

**Exclusions:** no fake Instagram chrome, logos, avatars or handles in the sample; no social proof, usage counts or reliability numbers; no ZIP or download-all; no carousel, marquee, parallax, custom cursor or scroll hijacking; no confidence percentages; no "saved to your device"; no sprocket holes or film-stock logos, because the reference is the editing act, not film nostalgia.

## 5. Landing page — explain, demonstrate, invite

**Primary mode:** Persuade through truthful explanation, not manufactured social proof.
**Visitor:** a person who wants to save authorized images from a public Instagram post.
**Success:** they understand the supported input, see the selection mechanism, and know where to begin.

Use a compact sequence; each section must earn its space:

1. **Promise + action.** Name the operation in one sentence. Proposed copy: “A post link. The images you choose.” Explain plainly: paste a public Instagram post link, review the image candidates, and download selected images. Primary CTA: **Open collector**, linking to `/app`. A secondary anchor may explain how it works.
2. **Product proof.** Show the real selection model through an actual UI preview or an explicitly labeled sample. An illustrative demo must never imply a live successful extraction. Show selected versus unselected images and the source boundary, not an arbitrary collage.
3. **Mechanism + limits.** A short paste → review → download explanation. State public-post availability, possible incomplete results, and authorized-use expectations. Explain third-party resolution without claiming the entire process stays on-device.
4. **Final action + small footer.** Repeat the primary action once if useful. Include the repository and concise privacy/limitations information. No fake customer logos, testimonials, usage counts, reliability percentages, or “original quality” claims.

Quality comes from composition, proportion, imagery, precise copy, and response—not the number of sections. Avoid obligatory pricing tables, feature-card grids, endless marquees, spinning objects, and loaders that delay access.

**Motion brief after direction approval:** choose at most one focal demonstration of link → selection. Any scripted demonstration is labeled. Essential content is visible at rest and without animation. Prefer native scroll unless Chief selects otherwise. Under reduced motion, deliver the same understandable end state immediately. No custom cursor or scroll hijacking on the task surface.

## 6. Workspace — the image review is the interface

**Primary mode:** Operate.
**Primary object:** media candidates for one source post; not statistics, folders, or a decorative dashboard.

### Structure

- Small header: Insta Luck, a quiet return-to-site link, and only genuinely necessary help.
- Clearly labeled URL input. Placeholder uses `/p/...`; do not prompt for an account/profile URL when profile extraction is not supported. Primary action: **Find images**.
- Brief supporting text: public post links; results may be incomplete. Parseable Reel URLs do not establish video support.
- After resolution: canonical source link, candidate count, concise status, then imagery as the dominant content.
- Use a responsive image grid that preserves aspect ratios. Allow full-image inspection; do not make crops the only way to judge a candidate.
- Checkboxes or equivalent accessible selection controls. Show selected count and **Download selected** near the results. A compact sticky action bar is acceptable only if it does not cover content or phone controls.
- Default selection: **none**. Keep related thumbnails, profile pictures, and unknown candidates out of the main post-media group. If exposed, place them in an explicit secondary group and require deliberate selection. Classification is an estimate, not guaranteed carousel membership.
- Source/membership information remains visible. Advanced diagnostics can be progressive disclosure; do not expose signed CDN query strings or server paths.

### State and feedback contract

| State | Visible behavior |
|---|---|
| Empty | Input ready, one task, no fabricated history or statistics |
| Invalid/unsupported link | Inline specific error; preserve the entered value |
| Resolving | Busy state announced accessibly; prevent duplicate submissions; allow cancel or replacement without stale results winning |
| Results | Correct source identity, count, visible selection and classification |
| No results | State what was not found; offer retry/edit; do not infer that the post has no images |
| Partial/ambiguous results | Explain that not all items may have been found; do not call the set complete |
| Preview failure | Keep candidate context and actionable recovery; no broken layout |
| Downloading | Per-item or bounded-batch progress based on real events; never invented percentages |
| Download handoff | Say “Download started” or “File ready” when that is what was observed—not “Saved to your device” based only on an HTTP response |
| Partial download failure | Keep successful items and selection; retry only failed items |
| Expired selection | Explain expiration and offer re-resolution; no infinite spinner |
| Request blocked/limited | Useful message and retry guidance; no bypass instructions |

Do not display “already saved” based only on matching URLs or a warm server process. Cross-session browser duplicate tracking is deferred. Within a batch, content hashes can identify identical bytes only after fetching/verifying them.

## 7. System consequence — hosted and local are different delivery modes

Choose the smallest Vercel-compatible frontend/server arrangement after inspecting the current deployment setup. A lightweight frontend plus serverless handlers may suffice; a framework migration is not required merely for appearance. If a framework is chosen, explain the concrete routing/runtime benefit and preserve the core/CLI modules.

**Required outcomes, not a mandated architecture:**

1. `/` and `/app` load on direct navigation and refresh. Configure the actual Vercel project root, install/build/output settings, runtime and rewrites to match the chosen application. Do not merely add a catch-all rewrite that masks missing APIs.
2. Hosted download delivers validated image bytes as a browser download, not a success JSON containing a server path. Do not call the filesystem/ledger downloader unchanged from the hosted handler.
3. Keep local archiving and hosted delivery as explicit adapters over reusable parsing/validation/fetching logic. The local CLI still writes files and ledger entries; hosted v1 does not promise durable server storage.
4. Resolve, preview and download must work across cold starts, different instances and expired state. The existing in-memory `Map` is not the contract. Select a bounded design—such as short-lived integrity-protected candidate references or an explicitly approved expiring store—and document lifecycle, privacy and resource limits. Signing is not encryption; do not expose sensitive upstream URLs in a merely signed payload. Never accept an arbitrary client media URL as trusted.
5. Scope candidate references to the relevant request/session; test tampering, expiration and cross-user access. If shared state is needed, enforce isolation. Any new paid service needs approval.
6. Never advertise a download-all/ZIP experience before implementing and testing it. Bounded sequential individual downloads with explicit browser-policy handling are sufficient for v1. If choosing a batch package, enforce aggregate byte/item/time limits and test memory consumption.
7. Keep logs minimal and redact signed media URLs. Explain that the submitted post URL is sent to the server and the configured public reader. No credentials or cookie uploads.

### Public-hosting release gates

This is a targeted source-based checklist, **not a full audit**:

- Reuse and strengthen HTTPS/host checks and block private/internal/reserved targets, including IPv6/mapped forms. Validate every redirect; account for DNS resolution versus connection-time validation. Do not present the existing helper as a complete SSRF boundary.
- The current preview proxy uses automatic redirect following and buffers the response before validation. Unify preview and download around a bounded safe-fetch path; validate redirects and enforce byte limits while reading, not only after allocation.
- Bound JSON bodies, reader responses, media size, total batch size, execution time, concurrency and request frequency. Do not deploy an unrestricted bandwidth proxy.
- Define the admission/abuse boundary. If no enforceable public controls are ready, use deployment protection or an appropriate gate rather than calling the endpoint production-ready. Do not add a full account system solely for this handoff.
- Treat fetched titles, captions, filenames and alt text as untrusted. Render text safely; prevent HTML/script injection, path traversal and unsafe response headers.
- Preserve image byte checks; distinguish signature checks from complete image decoding. Do not describe the 20-byte JPEG test fixture as proof of a decodable image.
- Return bounded, typed errors; no server filesystem paths, secrets, stack traces or signed URLs in user-facing responses.
- Respect authorization and content rights. No private-API workarounds, anti-bot evasion, CAPTCHA bypass, or claims of affiliation with Instagram/Meta.

## 8. Craft and proof budgets

After direction approval, use shared tokens for surface, text, action, focus, spacing and selection. Different expression across routes must still feel like one product.

- Self-host appropriately licensed fonts/assets. No photos copied from Chief's local collection or the original test account. Use approved imagery, rights-cleared sources, or plainly labeled placeholders; record provenance.
- Responsive checks at approximately 390px, 768px and 1440px. No horizontal overflow; image inspection and selection work on touch.
- Semantic landmarks, real links/buttons, persistent labels, visible keyboard focus, accessible busy/status/error announcements, adequate text/control contrast, and at least 44px primary touch targets.
- App content remains readable without hover. Selection is not color-only. Any modal supports keyboard entry/exit, Escape and focus restoration.
- Optimize image sizing and reserve dimensions. Lazy-load below-fold imagery; avoid a heavy animation/WebGL dependency for effects that do not clarify the operation.
- Targets, not current findings: LCP ≤2.5s, CLS ≤0.1 and INP ≤200ms under a declared measurement context. Lab checks do not establish field INP; report actual measurements and limitations rather than a fictional score.

## 9. Implementation sequence and acceptance

1. **Inspect and confirm.** Read this brief, the current repo and deployment configuration if authorized/available. Report actual differences from the baseline. Ask the direction question in §4 and stop for the choice. Request the deployment URL/config only when needed; never invent it.
2. **Prove one hosted-shaped vertical slice.** With fixture-backed upstream responses, demonstrate `/app` input → classified candidates → selection → verified browser download. Prove separate-request lifecycle and failure recovery before decorating it.
3. **Build the approved two-surface design.** Implement the landing around the real selection model and the focused workspace around the same vocabulary. Preserve local CLI behavior.
4. **Verify and hand back.** Run tests/typecheck/production build under the resulting package scripts. Inspect both routes in a real browser at phone/tablet/desktop sizes, with keyboard and reduced motion. Prepare deployment instructions; production deployment requires explicit authorization.

### Test matrix

- Preserve existing tests; add tests for changed URL/reader construction and parsing with injected upstream fixtures, not live Instagram in automated tests.
- Test direct `/` and `/app` navigation/refresh, assets, API methods, invalid input, source replacement/stale requests, empty/partial results and upstream failures.
- Test resolve → preview → download with separate handler lifecycles, expired/tampered references and independent users. No accidental dependency on an in-process cache.
- Test allowed/blocked hosts and redirect destinations, private/mapped targets, oversized/chunked responses, timeouts and safe text rendering.
- Assert download MIME, attachment filename and bytes—not only status 200. Browser-test the actual download handoff. A live authorized post check is separate evidence and may fail because of upstream availability.
- Re-run local CLI behavior without modifying Chief's real collection; use temporary test directories.
- If changes cannot safely meet hosting limits or abuse controls, report the blocker and keep the hosted operation gated. Do not replace failures with mock success.

### Behavioral acceptance test

An unfamiliar user can explain what the tool does from the landing, open `/app`, enter a supported link, distinguish likely post images from unrelated candidates, select one, and initiate its download without setup or a dashboard detour. When resolution is incomplete or unavailable, the user can tell what failed and what to do next. The UI never claims a complete carousel, persistent archive, or saved local file without evidence.

### Claude's final delivery

Provide:

- Implemented routes and the approved direction; the main cut and tradeoff.
- Changed files and architectural effect; preserved CLI behavior.
- Actual test/build results; desktop/mobile/reduced-motion browser evidence.
- Exact Vercel root/build/output/runtime settings for the chosen implementation, required environment-variable names with empty example values, and remaining production gates.
- Known limitations and any unverified live behavior. Separate source checks, fixture tests, browser observations, security review and live deployment evidence.

Do not commit or push without Chief's instruction for this next implementation arc. This handoff does not extend the earlier publication authorization to future changes.

## 10. Delegation message

> Claude, work in `/Users/lesz/Projects/insta-luck`. Read `CLAUDE_HANDOFF.md` and inspect the current repository before editing. Build Insta Luck as two coherent surfaces: a high-production landing at `/` and a separate minimal collection workspace at `/app`. Keep the existing CLI. First ask me to choose the visual direction from the handoff; then prove a hosted-compatible resolve → preview → select → download loop before polishing it. The current Vercel screenshot shows a 404; verify the actual cause rather than assuming it. Do not claim that server-local saves are downloads to my device, or rely on warm-process state. Keep failures honest, preserve security boundaries, test the real UI, and return deployment instructions and evidence. No production deployment, paid services, commit or push without my authorization.

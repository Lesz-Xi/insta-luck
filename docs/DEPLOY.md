# Deploying Insta Luck

Nothing here has been deployed. These settings were checked with `vercel build` on a local copy, which proves the build output, not live behavior.

## Project settings

| Setting | Value |
| --- | --- |
| Root Directory | The repository root (leave blank). Not `tools/photography-collector` |
| Framework Preset | Vite (set in `vercel.json`) |
| Install Command | `npm ci` (set in `vercel.json`) |
| Build Command | `npm run build` (set in `vercel.json`) |
| Output Directory | `dist` (set in `vercel.json`) |
| Node.js Version | 22.x (set in `package.json`) |

Check Root Directory in the dashboard: it can't be set from `vercel.json`, and an older value would override the layout above.

`/` and `/app` are static pages. `api/status.ts`, `api/resolve.ts` and `api/media/[ref].ts` become Node functions. Security headers are declared in `vercel.json`.

## Environment variables

| Name | Value | Purpose |
| --- | --- | --- |
| `INSTA_LUCK_HOSTED_ENABLED` | `true` to open; anything else stays closed | The admission gate |
| `INSTA_LUCK_CANDIDATE_SECRET` | At least 32 characters: `openssl rand -base64 48` | Encrypts candidate references |

With either missing the site still works: the landing is public, and `/app` says the hosted tool isn't open. Rotating the secret invalidates references in flight, and those visitors are asked to find their images again. Set it for Production and Preview separately, and don't commit it.

## Release gates

The landing can go live on its own. **Don't set `INSTA_LUCK_HOSTED_ENABLED=true` on a public site until gate 1 is met.**

**Decision, 2026-11-05: v1 uses Deployment Protection.** Vercel Authentication with the All Deployments scope. It was turned on for the `insta-luck` project on 2026-11-05 (previously `all_except_custom_domains`), and anonymous requests to every project URL now redirect to Vercel's login.

To change it, either:

- **Dashboard:** project, Settings, Deployment Protection, turn on Vercel Authentication, choose All Deployments, Save.
- **API:** `PATCH /v9/projects/{project}` with `{"ssoProtection":{"deploymentType":"all"}}`.

Vercel's docs (checked 2026-11-05) list this on all plans with no paid add-on. It covers **every URL, including `/` and your production domain**; there's no way to protect only `/app`. So the landing is private too until this changes. Hobby allows one external person. Once it's on, opening the collector with the variables above is safe from the frequency problem below, because only people you've let in can reach it. Don't turn it off without meeting gate 1 another way.

1. **Bound request frequency.** The code bounds each request but not how often requests arrive, because it holds no state between them. Without a platform limit, anyone can replay a reference or call the reader without limit: an independent review measured 500 replays causing 500 upstream fetches, and 200 identical resolves causing 200 reader calls. A reference and cookie pair isn't tied to an IP, so it can also be shared across addresses.

   Choose one:
   - **Deployment Protection (chosen for v1).** Only people you admit can reach the site, landing included. No limits to tune and no new cost.
   - **A Firewall rate limit.** Add a rule for paths starting with `/api/`, keyed on IP, fixed window. One sheet makes up to 25 requests at once, so 120 per 60 seconds is the practical floor. That still allows 120 × 4 MB = 480 MB a minute per IP, and 120 resolves a minute from one IP could use up the anonymous reader quota everyone shares. Vercel's docs (checked 2026-11-05) list rate limiting on all plans, but Hobby allows **one rule per project**, so `/api/resolve` can't have a tighter limit than `/api/media` without Pro. Hobby includes 1,000,000 allowed requests; usage beyond that is billed, which is an approval decision. Counters are per region.
2. **Run a live check** with a post you're authorized to use (below). Automated tests use fixtures.
3. **Read the terms note below** before opening the site to anyone else.

## Terms

Read on 2026-11-05. This is a working reading, not legal advice.

- [Instagram's Terms of Use](https://help.instagram.com/581066165581870/) bar accessing or collecting information in an automated way without express permission, logged in or not. **The hosted tool is covered by this**, because it reads Instagram through an automated reader. Keeping it private, human-paced and link by link keeps the exposure small. It doesn't remove it.
- [Meta's Developer Policies](https://developers.facebook.com/devpolicy/), section 6, bar using the Instagram Platform simply to display content, or to import or back it up, without prior permission. That is why the official API isn't used here, even though it could read a whole professional account. [Meta's permissions list](https://developers.facebook.com/docs/permissions/) gives metadata and insights as the allowed uses of the permission Business Discovery relies on. Meta's stated enforcement includes removing the app and the developer account.
- A browser extension doing the reading hits the first rule too.

So the tool reaches an account's older posts through its operator: they browse Instagram as themselves and paste the posts they want. Don't add anything that walks an account on its own.

## Live check

After deploying, with a post you may use:

1. `/` and `/app` load, and survive a refresh.
2. `/app` finds images for a post and for a profile, and the frames below the rule really aren't from the post.
3. A preview loads. Reload after a minute, then download one frame and open the file.
4. In the browser's network panel, no `cdninstagram` or `fbcdn` URL appears in any API response.
5. From a second browser, paste a `/api/media/...` URL from the first: it should return `ref_invalid`.
6. The `Set-Cookie` header on `/api/status` includes `Secure`.

## Known limits

- **Profiles are a small window.** Instagram redirects logged-out readers from a profile page to a login, so a profile is read from its public embed page. That shows a few recent posts (six, on the accounts measured), and an account can turn it off. A post page's "More posts" reaches a few more, but every post on an account returned the same newest list, so it can't go further back. An older post is reachable only by pasting its own link.
- **Carousels can come back short.** A logged-out page may show only a carousel's first slides.
- **Upstream dependency.** Resolution rests on Jina Reader's view of Instagram, which can change or be blocked. The reader can also keep a render taken before a post's photos loaded, so a post page that comes back with no images is read once more with its cache skipped. That second read is why the resolve function's limit is 45 seconds. Serverless egress IPs are shared, so anonymous rate limits may be reached sooner than on a home connection. The tool reports this rather than failing silently.
- **4 MB per image.** Vercel limits a function response to 4.5 MB, and each image is validated whole before delivery. Larger images get a clear error.
- **Blocked downloads are invisible.** Browsers don't report a refused download to the page, so "Download started" means the bytes arrived and the download was requested, not that the file landed. Safari and iOS policies haven't been tested on real devices.
- **Signature checks, not decoding.** Image validation reads file signatures. It doesn't prove a file decodes.
- **Reference lifetime.** A reference lasts an hour, because a sheet is built by hand while browsing. It expires link by link, and reading a link again carries its marks over. The session cookie lasts two hours, is `HttpOnly`, and carries no identity.
- **Duplicates are matched by file.** Two links showing the same image file are recognized as one frame. The same photograph saved as two different files isn't.

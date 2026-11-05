import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CollectorError } from "../tools/photography-collector/src/errors.js";
import { PublicReaderResolver } from "../tools/photography-collector/src/resolvers/publicReaderResolver.js";
import type { NormalizedInstagramUrl } from "../tools/photography-collector/src/types.js";
import { createApi, type Api } from "../hosted/handlers.js";

const SAMPLES = resolve(import.meta.dirname, "../web/public/samples");
const CDN = "https://scontent-sea5-1.cdninstagram.com/v";

const image = (name: string, alt: string): string =>
  `![${alt}](${CDN}/${name}.jpg?oe=FIXTURE&_nc_sig=signed-${name})`;
const photo = (name: string, date = "June 24, 2024"): string => image(name, `Image 2: Photo by Sample Creator on ${date}.`);

const PROFILE = image("frame-06", "Image 1: samplecreator's profile picture");
const BOUNDARY = "More posts from samplecreator";

const STANDARD = [
  PROFILE,
  "Never miss a post from samplecreator",
  ...["frame-01", "frame-02", "frame-03", "frame-04", "frame-05"].map((name) => photo(name)),
  photo("frame-06", "May 20, 2024"),
  BOUNDARY,
  photo("frame-07"),
  photo("frame-08", "May 13, 2024")
].join("\n");

const PAGES: Readonly<Record<string, string>> = {
  FIXOK01: STANDARD,
  FIXSLOW1: [photo("frame-03"), photo("frame-04"), photo("frame-05")].join("\n"),
  FIXEMPTY: "Title: Log in to Instagram\n\nNothing here.",
  FIXNEARBY: [image("frame-07", "A logo"), image("frame-08", "Another image")].join("\n"),
  FIXONCE1: [photo("frame-01"), photo("frame-02-once")].join("\n"),
  FIXPART1: [photo("frame-01"), photo("frame-02"), photo("frame-03-second")].join("\n"),
  FIXHTML1: [image("frame-01", `Image 2: Photo by <img src=x onerror="window.__xss=1"> on June 24, 2024.`)].join("\n"),
  FIXLIVE1: [
    PROFILE,
    photo("frame-01"),
    PROFILE,
    image("frame-02", "Image 4: first_commenter's profile picture"),
    image("frame-03", "Image 5: second.commenter's profile picture"),
    BOUNDARY,
    photo("frame-07")
  ].join("\n"),
  FIXWALL1: [
    "Title: Instagram",
    "Final URL: https://www.instagram.com/accounts/login/?next=x",
    image("frame-01", "Image 3")
  ].join("\n"),
  fixprofile: [
    image("frame-06", "Image 1: fixprofile's profile picture"),
    `[${image("frame-01", "Image 2: A caption about a recent post.")}](https://www.instagram.com/p/AAAAAAAAAAA/)`,
    `[${image("frame-02", "Image 3: Another caption.")}](https://www.instagram.com/p/BBBBBBBBBBB/)`,
    `[${image("frame-03", "Image 4: A third.")}](https://www.instagram.com/p/CCCCCCCCCCC/)`
  ].join("\n"),
  fixbare: image("frame-06", "Image 1: fixbare's profile picture")
};

/** A failure is decided by file name, with the call count for that name. */
const FAILURE_RULES: readonly (readonly [RegExp, (call: number) => boolean])[] = [
  [/-once\.jpg/, (call) => call === 1],
  [/-second\.jpg/, (call) => call === 2]
];

export interface FixtureApi extends Api {
  /** Moves the server's clock, to reach expiry without waiting for it. */
  advance(milliseconds: number): void;
  reset(): void;
}

/**
 * The real handlers over scripted upstreams, for browser tests and for trying
 * the interface offline. Only the local server imports this; nothing under
 * `api/` can reach it, so it isn't part of a deployment.
 */
export function createFixtureApi(): FixtureApi {
  let offset = 0;
  const calls = new Map<string, number>();

  const api = createApi({
    open: true,
    secret: "fixture-secret-fixture-secret-fixture",
    now: () => Date.now() + offset,
    readPost: async (input: NormalizedInstagramUrl) => {
      if (input.shortcode === "FIXSLOW1") await new Promise((done) => setTimeout(done, 1500));
      if (input.shortcode === "FIXDOWN1") throw new CollectorError("reader_fetch_failed", "down", 500);
      if (input.shortcode === "FIXLIMIT") throw new CollectorError("reader_fetch_failed", "limited", 429);
      const page = PAGES[input.shortcode] ?? STANDARD;
      return new PublicReaderResolver(async () => page).resolve(input);
    },
    fetchImage: async (remoteUrl) => {
      const { pathname } = new URL(remoteUrl);
      const call = (calls.get(pathname) ?? 0) + 1;
      calls.set(pathname, call);
      if (FAILURE_RULES.some(([pattern, fails]) => pattern.test(pathname) && fails(call))) {
        throw new CollectorError("download_failed", "scripted failure", 500);
      }
      const number = /frame-(\d\d)/.exec(pathname)?.[1] ?? "01";
      return new Uint8Array(readFileSync(resolve(SAMPLES, `frame-${number}-720.webp`)));
    }
  });

  return {
    ...api,
    advance(milliseconds) {
      offset += milliseconds;
    },
    reset() {
      offset = 0;
      calls.clear();
    }
  };
}

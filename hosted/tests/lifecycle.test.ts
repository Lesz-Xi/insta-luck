import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { CollectorError } from "../../tools/photography-collector/src/errors.js";
import { PublicReaderResolver } from "../../tools/photography-collector/src/resolvers/publicReaderResolver.js";
import type { ProblemBody, ResolveResponse, StatusResponse } from "../contract.js";
import { createApi, type ApiDeps } from "../handlers.js";
import { LIMITS } from "../limits.js";
import { cookieFrom, JPEG_BYTES, mediaRequest, POST_URL, readerDeps, resolveRequest, SECRET } from "./support.js";

async function resolved(deps: ApiDeps = readerDeps()) {
  const response = await createApi(deps).resolve(resolveRequest({ url: POST_URL }));
  expect(response.status).toBe(200);
  const cookie = cookieFrom(response);
  const raw = await response.text();
  return { raw, cookie, body: JSON.parse(raw) as ResolveResponse };
}

async function errorCode(response: Response): Promise<string> {
  return ((await response.json()) as ProblemBody).error.code;
}

describe("resolve, preview and download across separate instances", () => {
  it("serves a preview from an instance that never saw the resolve", async () => {
    const { body, cookie } = await resolved();
    const frame = body.frames[0];
    if (frame === undefined) throw new Error("expected a frame");

    const fetched: string[] = [];
    const elsewhere = createApi(
      readerDeps({
        fetchImage: async (url) => {
          fetched.push(url);
          return JPEG_BYTES;
        }
      })
    );
    const response = await elsewhere.media(mediaRequest(frame.ref, cookie));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("content-disposition")).toMatch(/^inline;/);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(JPEG_BYTES);
    expect(fetched).toEqual(["https://scontent-sea5-1.cdninstagram.com/v/post-one.jpg?oe=BBB&_nc_sig=one-signature"]);
  });

  it("delivers verified bytes as an attachment with a server-built filename", async () => {
    const { body, cookie } = await resolved();
    const frame = body.frames[1];
    if (frame === undefined) throw new Error("expected a frame");

    const response = await createApi(readerDeps()).media(mediaRequest(frame.ref, cookie, "?download=1"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="insta-luck-TEST_CODE_2-02.jpg"');
    expect(response.headers.get("content-length")).toBe(String(JPEG_BYTES.byteLength));
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(JPEG_BYTES);
  });

  it("reads the reference from Vercel's rewritten route as well as the path", async () => {
    const { body, cookie } = await resolved();
    const ref = body.frames[0]?.ref ?? "";
    const rewritten = new Request(`https://insta-luck.test/api/media/%5Bref%5D?ref=${ref}&download=1`, {
      headers: { cookie }
    });
    const response = await createApi(readerDeps()).media(rewritten);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toMatch(/^attachment;/);
  });

  it("sets the type from the bytes, not the source URL", async () => {
    const { body, cookie } = await resolved();
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
    const response = await createApi(readerDeps({ fetchImage: async () => png })).media(
      mediaRequest(body.frames[0]?.ref ?? "", cookie, "?download=1")
    );
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("content-disposition")).toContain("-01.png");
  });
});

describe("the sheet", () => {
  it("puts likely post media first and keeps neighbours out of the post group", async () => {
    const { body } = await resolved();
    expect(body.frames.map(({ number, group, basis }) => [number, group, basis])).toEqual([
      [1, "post", "first_dated_photo"],
      [2, "post", "same_date_as_first"],
      [3, "nearby", "listed_under_more_posts"]
    ]);
    expect(body.frames[1]?.anchorNumber).toBe(1);
    expect(body.source).toEqual({
      canonicalUrl: "https://www.instagram.com/p/TEST_CODE_2/",
      shortcode: "TEST_CODE_2",
      routeType: "post"
    });
  });

  it("exposes no CDN host, signature or confidence value to the client", async () => {
    const { raw } = await resolved();
    expect(raw).not.toContain("cdninstagram");
    expect(raw).not.toContain("_nc_sig");
    expect(raw).not.toContain("signature");
    expect(raw).not.toContain("confidence");
  });

  it("leaves every profile picture out of a post's sheet, without counting them as missing", async () => {
    const fixture = readFileSync(
      resolve(import.meta.dirname, "../../tools/photography-collector/tests/fixtures/instagram-reader-live-post.md"),
      "utf8"
    );
    const deps = readerDeps({
      readPost: async (input) => new PublicReaderResolver(async () => fixture).resolve(input)
    });
    const { body, raw } = await resolved(deps);
    expect(body.frames.map(({ group, basis }) => [group, basis])).toEqual([
      ["post", "first_dated_photo"],
      ["nearby", "listed_under_more_posts"],
      ["nearby", "listed_under_more_posts"]
    ]);
    expect(body.omitted).toBe(0);
    expect(raw).not.toContain("commenter");
    expect(raw).not.toContain("profile picture");
  });

  it("serves a profile, named for its account", async () => {
    const fixture = readFileSync(
      resolve(import.meta.dirname, "../../tools/photography-collector/tests/fixtures/instagram-reader-profile-embed.md"),
      "utf8"
    );
    const deps = readerDeps({
      readPost: async (input) => new PublicReaderResolver(async () => fixture).resolve(input)
    });
    const response = await createApi(deps).resolve(resolveRequest({ url: "https://www.instagram.com/some.account/" }));
    const body = (await response.json()) as ResolveResponse;

    expect(body.source).toEqual({
      canonicalUrl: "https://www.instagram.com/some.account/",
      shortcode: "some.account",
      routeType: "profile"
    });
    expect(body.frames.map(({ group, basis }) => [group, basis])).toEqual([
      ["post", "shown_on_profile"],
      ["post", "shown_on_profile"]
    ]);
    expect(body.omitted).toBe(0);

    const file = await createApi(readerDeps()).media(
      mediaRequest(body.frames[0]?.ref ?? "", cookieFrom(response), "?download=1")
    );
    expect(file.headers.get("content-disposition")).toBe('attachment; filename="insta-luck-some.account-01.jpg"');
  });

  it("drops candidates on hosts the server would refuse to fetch, and says how many", async () => {
    const deps = readerDeps({
      readPost: async (input) => {
        const base = await readerDeps().readPost(input, new AbortController().signal);
        const template = base[1];
        if (template === undefined) throw new Error("expected a candidate");
        return [
          ...base,
          { ...template, id: "a", remoteUrl: "https://evil.example/a.jpg" },
          { ...template, id: "b", remoteUrl: "http://scontent.cdninstagram.com/b.jpg" },
          { ...template, id: "c", remoteUrl: "not a url" }
        ];
      }
    });
    const { body } = await resolved(deps);
    expect(body.frames).toHaveLength(3);
    expect(body.omitted).toBe(3);
  });

  it("counts an over-long URL as omitted, so no reference is issued that can't open", async () => {
    const deps = readerDeps({
      readPost: async (input) => {
        const template = (await readerDeps().readPost(input, new AbortController().signal))[1];
        if (template === undefined) throw new Error("expected a candidate");
        return [
          template,
          { ...template, id: "long", remoteUrl: `https://scontent.cdninstagram.com/v/${"a".repeat(LIMITS.remoteUrlChars)}.jpg` }
        ];
      }
    });
    const { body, cookie } = await resolved(deps);
    expect(body.frames).toHaveLength(1);
    expect(body.omitted).toBe(1);

    const longest = readerDeps({
      readPost: async (input) => {
        const template = (await readerDeps().readPost(input, new AbortController().signal))[1];
        if (template === undefined) throw new Error("expected a candidate");
        const base = "https://scontent.cdninstagram.com/v/";
        return [{ ...template, remoteUrl: `${base}${"a".repeat(LIMITS.remoteUrlChars - base.length)}` }];
      }
    });
    const atLimit = await resolved(longest);
    expect(atLimit.body.frames).toHaveLength(1);
    const opened = await createApi(readerDeps()).media(mediaRequest(atLimit.body.frames[0]?.ref ?? "", atLimit.cookie));
    expect(opened.status).toBe(200);
    expect(cookie.length).toBeGreaterThan(0);
  });

  it("collapses a padded date and drops one that is simply too long", async () => {
    const deps = readerDeps({
      readPost: async (input) => {
        const template = (await readerDeps().readPost(input, new AbortController().signal))[1];
        if (template === undefined) throw new Error("expected a candidate");
        return [
          { ...template, postedAt: `J${"e".repeat(100)} 24, 2024` },
          { ...template, remoteUrl: "https://scontent.cdninstagram.com/v/two.jpg", postedAt: `June${" ".repeat(200_000)}24, 2024` }
        ];
      }
    });
    const { body } = await resolved(deps);
    expect(body.frames[0]).not.toHaveProperty("postedAt");
    expect(body.frames[1]?.postedAt).toBe("June 24, 2024");
  });

  it("collapses repeats of one file and caps the frame count", async () => {
    const deps = readerDeps({
      readPost: async (input) => {
        const template = (await readerDeps().readPost(input, new AbortController().signal))[1];
        if (template === undefined) throw new Error("expected a candidate");
        return Array.from({ length: LIMITS.maxFrames + 10 }, (_, index) => ({
          ...template,
          id: String(index),
          remoteUrl: `https://scontent.cdninstagram.com/v/${index}.jpg?sig=${index}`
        })).concat([
          { ...template, id: "repeat", remoteUrl: "https://scontent.cdninstagram.com/v/0.jpg?sig=other" }
        ]);
      }
    });
    const { body } = await resolved(deps);
    expect(body.frames).toHaveLength(LIMITS.maxFrames);
    expect(body.omitted).toBe(10);
  });

  it("gives a file the same id on a later resolve, so a selection can be kept", async () => {
    const first = await resolved();
    const signed = (await readerDeps().readPost({
      inputUrl: POST_URL,
      canonicalUrl: "https://www.instagram.com/p/TEST_CODE_2/",
      shortcode: "TEST_CODE_2",
      routeType: "post"
    }, new AbortController().signal)).map((candidate) => ({ ...candidate, remoteUrl: `${candidate.remoteUrl}&fresh=1` }));
    const second = await resolved(readerDeps({ readPost: async () => signed }));
    expect(second.body.frames.map((frame) => frame.id)).toEqual(first.body.frames.map((frame) => frame.id));
  });

  it("reduces third-party alt text to bounded plain text", async () => {
    const long = `Photo by Someone on June 24, 2024. ${"x".repeat(500)}\u0007`;
    const deps = readerDeps({
      readPost: async (input) => {
        const template = (await readerDeps().readPost(input, new AbortController().signal))[1];
        if (template === undefined) throw new Error("expected a candidate");
        return [{ ...template, altText: `Image 9: ${long}` }];
      }
    });
    const { body } = await resolved(deps);
    const alt = body.frames[0]?.altText ?? "";
    expect(alt.startsWith("Photo by Someone")).toBe(true);
    expect(alt.length).toBeLessThanOrEqual(LIMITS.altTextChars);
    expect(alt).not.toContain("\u0007");
  });
});

describe("sessions and timing", () => {
  const statusRequest = (cookie?: string) =>
    new Request("https://insta-luck.test/api/status", cookie === undefined ? {} : { headers: { cookie } });

  it("reports how long a sheet lasts as a duration, not a server timestamp", async () => {
    const { body } = await resolved();
    expect(body.expiresInMs).toBe(LIMITS.refTtlSeconds * 1000);
    expect(body).not.toHaveProperty("expiresAt");
  });

  it("issues a session at page load, so tabs opened together share one", async () => {
    const response = createApi(readerDeps()).status(statusRequest());
    expect(response.headers.get("set-cookie")).toMatch(/^il_session=/);

    const cookie = cookieFrom(response);
    const resolved = await createApi(readerDeps()).resolve(resolveRequest({ url: POST_URL }, { cookie }));
    expect(cookieFrom(resolved)).toBe(cookie);
  });

  it("doesn't replace a session that already exists", () => {
    const existing = "il_session=aaaaaaaaaaaaaaaaaaaaaa";
    expect(createApi(readerDeps()).status(statusRequest(existing)).headers.get("set-cookie")).toBeNull();
  });

  it("issues nothing while closed", () => {
    expect(createApi(readerDeps({ open: false })).status(statusRequest()).headers.get("set-cookie")).toBeNull();
  });

  it("marks the cookie Secure except on loopback", async () => {
    const local = createApi(readerDeps()).status(new Request("http://127.0.0.1:4178/api/status"));
    expect(local.headers.get("set-cookie")).not.toContain("Secure");
    // A proxy may hand the function an http:// URL; the public host still gets Secure.
    const proxied = createApi(readerDeps()).status(new Request("http://insta-luck.test/api/status"));
    expect(proxied.headers.get("set-cookie")).toContain("Secure");
    expect(proxied.headers.get("set-cookie")).toContain("HttpOnly");
    expect(proxied.headers.get("set-cookie")).toContain("SameSite=Strict");
  });

  it("passes the request's signal upstream, so a departed visitor stops the work", async () => {
    const seen: AbortSignal[] = [];
    const deps = readerDeps({
      readPost: async (input, signal) => {
        seen.push(signal);
        return readerDeps().readPost(input, signal);
      },
      fetchImage: async (_url, signal) => {
        seen.push(signal);
        return JPEG_BYTES;
      }
    });
    const controller = new AbortController();
    const request = new Request("https://insta-luck.test/api/resolve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: POST_URL }),
      signal: controller.signal
    });
    const response = await createApi(deps).resolve(request);
    const body = (await response.json()) as ResolveResponse;
    await createApi(deps).media(mediaRequest(body.frames[0]?.ref ?? "", cookieFrom(response)));

    expect(seen).toHaveLength(2);
    controller.abort();
    expect(seen[0]?.aborted).toBe(true);
  });
});

describe("references", () => {
  it("rejects a tampered reference", async () => {
    const { body, cookie } = await resolved();
    const ref = body.frames[0]?.ref ?? "";
    const flipped = `${ref.slice(0, -2)}${ref.endsWith("AA") ? "BB" : "AA"}`;
    const response = await createApi(readerDeps()).media(mediaRequest(flipped, cookie));
    expect(response.status).toBe(403);
    expect(await errorCode(response)).toBe("ref_invalid");
  });

  it("rejects a reference used by a different browser session", async () => {
    const { body } = await resolved();
    const other = await resolved();
    const response = await createApi(readerDeps()).media(mediaRequest(body.frames[0]?.ref ?? "", other.cookie));
    expect(response.status).toBe(403);
    expect(await errorCode(response)).toBe("ref_invalid");
  });

  it("rejects a request with no session", async () => {
    const { body } = await resolved();
    const response = await createApi(readerDeps()).media(mediaRequest(body.frames[0]?.ref ?? "", undefined));
    expect(await errorCode(response)).toBe("ref_invalid");
  });

  it("rejects a reference sealed with another secret", async () => {
    const { body, cookie } = await resolved();
    const rotated = createApi(readerDeps({ secret: `${SECRET}-rotated` }));
    expect(await errorCode(await rotated.media(mediaRequest(body.frames[0]?.ref ?? "", cookie)))).toBe("ref_invalid");
  });

  it("expires, and says so distinctly", async () => {
    const issued = Date.now();
    const { body, cookie } = await resolved(readerDeps({ now: () => issued }));
    const later = createApi(readerDeps({ now: () => issued + LIMITS.refTtlSeconds * 1000 + 1 }));
    const response = await later.media(mediaRequest(body.frames[0]?.ref ?? "", cookie));
    expect(response.status).toBe(410);
    expect(await errorCode(response)).toBe("ref_expired");
  });

  it("treats a malformed path escape as an invalid reference, not a crash", async () => {
    const request = new Request("https://insta-luck.test/api/media/%ZZ", {
      headers: { cookie: "il_session=aaaaaaaaaaaaaaaaaaaaaa" }
    });
    const response = await createApi(readerDeps()).media(request);
    expect(response.status).toBe(403);
    expect(await errorCode(response)).toBe("ref_invalid");
  });

  it("does not fetch upstream for an invalid reference", async () => {
    const fetchImage = vi.fn(async () => JPEG_BYTES);
    await createApi(readerDeps({ fetchImage })).media(mediaRequest("A".repeat(LIMITS.refChars + 1), "il_session=aaaaaaaaaaaaaaaaaaaaaa"));
    await createApi(readerDeps({ fetchImage })).media(mediaRequest("short", "il_session=aaaaaaaaaaaaaaaaaaaaaa"));
    expect(fetchImage).not.toHaveBeenCalled();
  });
});

describe("the admission gate", () => {
  it.each<[string, Partial<ApiDeps>]>([
    ["the gate is off", { open: false }],
    ["the secret is missing", { secret: undefined }],
    ["the secret is too short", { secret: "short" }]
  ])("stays closed when %s", async (_name, overrides) => {
    const deps = readerDeps(overrides);
    const api = createApi(deps);
    expect(((await api.status(new Request("https://insta-luck.test/api/status")).json()) as StatusResponse).open).toBe(false);
    const refused = await api.resolve(resolveRequest({ url: POST_URL }));
    expect(refused.status).toBe(503);
    expect(await errorCode(refused)).toBe("closed");
    expect(await errorCode(await api.media(mediaRequest("x", "il_session=aaaaaaaaaaaaaaaaaaaaaa")))).toBe("closed");
  });

  it("reports open only when both the gate and a usable secret are present", async () => {
    const response = createApi(readerDeps()).status(new Request("https://insta-luck.test/api/status"));
    expect(((await response.json()) as StatusResponse).open).toBe(true);
  });
});

describe("request boundary", () => {
  const api = () => createApi(readerDeps());

  it("refuses another site's origin", async () => {
    const response = await api().resolve(resolveRequest({ url: POST_URL }, { origin: "https://evil.example" }));
    expect(response.status).toBe(403);
    expect(await errorCode(response)).toBe("wrong_origin");
  });

  it("refuses a cross-site fetch by metadata", async () => {
    const response = await api().resolve(resolveRequest({ url: POST_URL }, { "sec-fetch-site": "cross-site" }));
    expect(await errorCode(response)).toBe("wrong_origin");
  });

  it("refuses an oversized body that understates or omits its length", async () => {
    const response = await api().resolve(resolveRequest({ url: `https://www.instagram.com/p/${"a".repeat(4096)}/` }));
    expect(response.status).toBe(413);
  });

  it.each([
    ["malformed JSON", "{"],
    ["a bare string", JSON.stringify("https://www.instagram.com/p/ABCDE/")],
    ["a missing url", {}],
    ["a non-string url", { url: 42 }]
  ])("refuses %s", async (_name, body) => {
    const response = await api().resolve(resolveRequest(body));
    expect(response.status).toBe(400);
    expect(await errorCode(response)).toBe("invalid_request");
  });

  it("refuses a non-JSON content type", async () => {
    const response = await api().resolve(resolveRequest({ url: POST_URL }, { "content-type": "text/plain" }));
    expect(await errorCode(response)).toBe("invalid_request");
  });

  it.each([
    ["not a url", "invalid_link"],
    ["http://www.instagram.com/p/ABCDE/", "invalid_link"],
    ["https://evil.example/p/ABCDE/", "invalid_link"],
    ["https://www.instagram.com/p/!!/", "invalid_link"],
    ["https://www.instagram.com/explore/", "unsupported_link"],
    ["https://www.instagram.com/stories/someone/1/", "unsupported_link"]
  ])("rejects %s without calling the reader", async (url, code) => {
    const readPost = vi.fn(async () => []);
    const response = await createApi(readerDeps({ readPost })).resolve(resolveRequest({ url }));
    expect(response.status).toBe(400);
    expect(await errorCode(response)).toBe(code);
    expect(readPost).not.toHaveBeenCalled();
  });
});

describe("upstream failure", () => {
  const silence = () => vi.spyOn(console, "error").mockImplementation(() => undefined);

  it.each<[string, Error, string, number]>([
    ["login wall", new CollectorError("login_required", "x"), "login_required", 502],
    ["rate limiting", new CollectorError("reader_fetch_failed", "x", 429), "reader_limited", 503],
    ["a timeout", new CollectorError("upstream_timeout", "x"), "reader_timeout", 504],
    ["a server error", new CollectorError("reader_fetch_failed", "x", 500), "reader_unavailable", 502],
    ["an unknown error", new Error("boom"), "reader_unavailable", 502]
  ])("maps a reader's %s", async (_name, thrown, code, status) => {
    silence();
    const response = await createApi(
      readerDeps({
        readPost: async () => {
          throw thrown;
        }
      })
    ).resolve(resolveRequest({ url: POST_URL }));
    expect(response.status).toBe(status);
    expect(await errorCode(response)).toBe(code);
  });

  it("gives guidance on when to retry a limited request", async () => {
    silence();
    const response = await createApi(
      readerDeps({
        readPost: async () => {
          throw new CollectorError("reader_fetch_failed", "x", 429);
        }
      })
    ).resolve(resolveRequest({ url: POST_URL }));
    expect(response.headers.get("retry-after")).toBe("60");
    expect(((await response.json()) as ProblemBody).error).toMatchObject({ retryable: true, retryAfterSeconds: 60 });
  });

  it.each<[string, Error, string, number]>([
    ["an oversized image", new CollectorError("file_too_large", "x"), "image_too_large", 413],
    ["a blocked redirect", new CollectorError("unsafe_host", "x"), "source_blocked", 422],
    ["a private target", new CollectorError("unsafe_dns_target", "x"), "source_blocked", 422],
    ["a timeout", new CollectorError("upstream_timeout", "x"), "source_timeout", 504],
    ["an expired CDN link", new CollectorError("download_failed", "x", 403), "source_gone", 502],
    ["rate limiting", new CollectorError("download_failed", "x", 429), "source_limited", 503],
    ["a server error", new CollectorError("download_failed", "x", 500), "source_unavailable", 502]
  ])("maps %s when fetching an image", async (_name, thrown, code, status) => {
    silence();
    const { body, cookie } = await resolved();
    const response = await createApi(
      readerDeps({
        fetchImage: async () => {
          throw thrown;
        }
      })
    ).media(mediaRequest(body.frames[0]?.ref ?? "", cookie));
    expect(response.status).toBe(status);
    expect(await errorCode(response)).toBe(code);
  });

  it("refuses bytes that aren't an image", async () => {
    const { body, cookie } = await resolved();
    const html = new TextEncoder().encode("<html><script>alert(1)</script></html>");
    const response = await createApi(readerDeps({ fetchImage: async () => html })).media(
      mediaRequest(body.frames[0]?.ref ?? "", cookie, "?download=1")
    );
    expect(response.status).toBe(415);
    expect(await errorCode(response)).toBe("not_an_image");
  });

  it("logs a classification, never a URL or signature", async () => {
    const log = silence();
    const { body, cookie } = await resolved();
    await createApi(
      readerDeps({
        fetchImage: async () => {
          throw new CollectorError("download_failed", "https://cdn/x?_nc_sig=secret", 403);
        }
      })
    ).media(mediaRequest(body.frames[0]?.ref ?? "", cookie));
    const logged = log.mock.calls.flat().join(" ");
    expect(logged).toContain("source_gone");
    expect(logged).not.toContain("_nc_sig");
  });
});

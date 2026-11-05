import { classifyCandidates } from "../../tools/photography-collector/src/resolvers/candidateClassifier.js";
import { extractMarkdownImageCandidates } from "../../tools/photography-collector/src/resolvers/publicReaderResolver.js";
import type { NormalizedInstagramUrl } from "../../tools/photography-collector/src/types.js";
import type { ApiDeps } from "../handlers.js";

export const SECRET = "test-secret-test-secret-test-secret-0001";
export const POST_URL = "https://www.instagram.com/p/TEST_CODE_2/?igsh=tracking";
export const ORIGIN = "https://insta-luck.test";

/** The fixture's shape, with signed-looking query strings that must never reach a client. */
export const READER_MARKDOWN = `![Image 1: samplecreator's profile picture](https://scontent-sea1-1.cdninstagram.com/v/profile.jpg?oe=AAA&_nc_sig=profile-signature)
Never miss a post from samplecreator
![Image 2: Photo by Example Creator on June 24, 2024. <img src=x onerror=alert(1)>](https://scontent-sea5-1.cdninstagram.com/v/post-one.jpg?oe=BBB&_nc_sig=one-signature)
![Image 3: Photo by Example Creator on June 24, 2024.](https://scontent-sea5-1.cdninstagram.com/v/post-two.jpg?oe=CCC&_nc_sig=two-signature)
More posts from samplecreator
![Image 6: Photo by Example Creator on June 24, 2024.](https://scontent-sea5-1.cdninstagram.com/v/neighbour.jpg?oe=DDD&_nc_sig=neighbour-signature)
`;

export const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

export function readerDeps(overrides: Partial<ApiDeps> = {}): ApiDeps {
  return {
    open: true,
    secret: SECRET,
    readPost: async (input: NormalizedInstagramUrl, _signal?: AbortSignal) =>
      classifyCandidates(input, extractMarkdownImageCandidates(READER_MARKDOWN)),
    fetchImage: async () => JPEG_BYTES,
    ...overrides
  };
}

export function resolveRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}/api/resolve`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, host: "insta-luck.test", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body)
  });
}

export function mediaRequest(ref: string, cookie: string | undefined, search = ""): Request {
  return new Request(`${ORIGIN}/api/media/${ref}${search}`, {
    headers: cookie === undefined ? {} : { cookie }
  });
}

export function cookieFrom(response: Response): string {
  const header = response.headers.get("set-cookie");
  if (header === null) throw new Error("expected a session cookie");
  return header.split(";")[0] ?? "";
}

import { safeFetch } from "../tools/photography-collector/src/download/safeFetch.js";
import { PublicReaderResolver, readerHeaders, type FetchTextOptions } from "../tools/photography-collector/src/resolvers/publicReaderResolver.js";
import { createApi, type Api } from "./handlers.js";
import { LIMITS } from "./limits.js";

const USER_AGENT = "Mozilla/5.0 insta-luck/0.2";

async function fetchReaderText(url: string, signal: AbortSignal, options?: FetchTextOptions): Promise<string> {
  const { bytes } = await safeFetch(url, {
    signal,
    allowedHostSuffixes: ["r.jina.ai"],
    maxBytes: LIMITS.readerBytes,
    timeoutMs: LIMITS.readerTimeoutMs,
    maxRedirects: LIMITS.maxRedirects,
    headers: { "user-agent": USER_AGENT, ...readerHeaders(options) }
  });
  return new TextDecoder().decode(bytes);
}

let api: Api | undefined;

/** Built once per instance from the environment. It holds configuration, not visitor state. */
export function productionApi(): Api {
  api ??= createApi({
    open: process.env.INSTA_LUCK_HOSTED_ENABLED === "true",
    secret: process.env.INSTA_LUCK_CANDIDATE_SECRET,
    readPost: (input, signal) => new PublicReaderResolver((url, options) => fetchReaderText(url, signal, options)).resolve(input),
    fetchImage: async (remoteUrl, signal) => {
      const { bytes } = await safeFetch(remoteUrl, {
        signal,
        maxBytes: LIMITS.imageBytes,
        timeoutMs: LIMITS.imageTimeoutMs,
        maxRedirects: LIMITS.maxRedirects,
        headers: { "user-agent": USER_AGENT }
      });
      return bytes;
    }
  });
  return api;
}

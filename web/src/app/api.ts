import type { ClientFrame, ProblemBody, ResolveResponse, StatusResponse } from "../../../hosted/contract.js";
import type { Problem } from "./state.js";

export class ProblemError extends Error {
  public readonly problem: Problem;

  public constructor(problem: Problem) {
    super(problem.message);
    this.problem = problem;
  }
}

const OFFLINE: Problem = {
  code: "offline",
  message: "We couldn’t reach the server. Check your connection and try again.",
  retryable: true
};

/** A platform layer can answer before our handlers do, so a body isn't guaranteed. */
async function problemFrom(response: Response): Promise<Problem> {
  try {
    const body = (await response.json()) as ProblemBody;
    if (typeof body.error?.message === "string") return body.error;
  } catch {
    // Fall through to a status-based message.
  }
  if (response.status === 429) {
    return { code: "reader_limited", message: "Too many requests. Wait a minute and try again.", retryable: true };
  }
  return { code: "internal", message: "Something went wrong on our side. Try again.", retryable: true };
}

async function send(input: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(input, { credentials: "same-origin", ...init });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ProblemError(OFFLINE);
  }
}

export async function fetchOpen(): Promise<boolean | undefined> {
  try {
    const response = await fetch("/api/status");
    if (!response.ok) return undefined;
    return ((await response.json()) as StatusResponse).open;
  } catch {
    return undefined;
  }
}

export async function resolvePost(url: string, signal: AbortSignal): Promise<ResolveResponse> {
  const response = await send("/api/resolve", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url }),
    signal
  });
  if (!response.ok) throw new ProblemError(await problemFrom(response));
  return (await response.json()) as ResolveResponse;
}

export function previewUrl(frame: ClientFrame, attempt = 0): string {
  const path = `/api/media/${encodeURIComponent(frame.ref)}`;
  return attempt === 0 ? path : `${path}?attempt=${attempt}`;
}

export interface DeliveredFile {
  readonly blob: Blob;
  readonly filename: string;
}

export async function fetchFile(frame: ClientFrame): Promise<DeliveredFile> {
  const response = await send(`/api/media/${encodeURIComponent(frame.ref)}?download=1`, {});
  if (!response.ok) throw new ProblemError(await problemFrom(response));

  const disposition = response.headers.get("content-disposition") ?? "";
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? "insta-luck-image";
  return { blob: await response.blob(), filename };
}

/**
 * Hands bytes to the browser's download flow. What can be observed is that the
 * bytes arrived and the download was requested, not where the file ended up.
 */
export function handOff(file: DeliveredFile): void {
  const url = URL.createObjectURL(file.blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.filename;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 60_000);
}

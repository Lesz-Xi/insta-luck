export class CollectorError extends Error {
  public readonly code: string;
  /** Upstream HTTP status, when the failure came from one. */
  public readonly upstreamStatus: number | undefined;

  public constructor(code: string, message: string, upstreamStatus?: number) {
    super(message);
    this.name = "CollectorError";
    this.code = code;
    this.upstreamStatus = upstreamStatus;
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

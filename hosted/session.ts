import { randomBytes } from "node:crypto";
import { LIMITS } from "./limits.js";

const COOKIE_NAME = "il_session";
const SESSION_PATTERN = /^[A-Za-z0-9_-]{22}$/;

export function mintSession(): string {
  return randomBytes(16).toString("base64url");
}

export function readSession(request: Request): string | undefined {
  const header = request.headers.get("cookie");
  if (header === null) return undefined;

  for (const part of header.split(";")) {
    const [name, value] = part.trim().split("=", 2);
    if (name === COOKIE_NAME && value !== undefined && SESSION_PATTERN.test(value)) return value;
  }
  return undefined;
}

export function sessionCookie(sessionId: string, secure: boolean): string {
  return [
    `${COOKIE_NAME}=${sessionId}`,
    "Path=/api",
    `Max-Age=${LIMITS.sessionMaxAgeSeconds}`,
    "HttpOnly",
    "SameSite=Strict",
    ...(secure ? ["Secure"] : [])
  ].join("; ");
}

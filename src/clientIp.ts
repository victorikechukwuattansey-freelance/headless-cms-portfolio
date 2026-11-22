import { isIP } from "node:net";

/**
 * Fly Proxy overwrites Fly-Client-IP with the address it accepted the
 * connection from. Do not use X-Forwarded-For for security decisions.
 *
 * Outside Fly, this application has no configured trusted-proxy boundary,
 * so return a shared fallback key instead of trusting client-supplied headers.
 */
export function getClientIp(
  headers: Pick<Headers, "get">,
  flyAppName: string | undefined = process.env.FLY_APP_NAME,
): string {
  if (!flyAppName) return "unknown";

  const candidate = headers.get("fly-client-ip")?.trim();
  return candidate && isIP(candidate) !== 0 ? candidate : "unknown";
}

import { URL } from "node:url";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const BLOCKED_HOSTS = new Set([
  "localhost",
  "metadata.google.internal",
]);

// CIDR-style ranges we refuse to POST to
function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local + AWS/GCP metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    return false;
  }
  // IPv6
  const lower = ip.toLowerCase();
  if (lower === "::1") return true;
  if (lower.startsWith("fe80:")) return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
  return false;
}

export async function validateWebhookUrl(raw: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Invalid URL");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Webhook URL must use http or https");
  }

  // Require https for non-localhost — localhost is allowed for dev
    const isLocalDev =
    url.hostname === "localhost" || url.hostname === "127.0.0.1";

  if (!isLocalDev && BLOCKED_HOSTS.has(url.hostname)) {
    throw new Error("Hostname not allowed");
  }

  if (!isLocalDev && url.protocol !== "https:") {
    throw new Error("Non-local webhook URLs must use https");
  }

  // If it's already an IP literal, check directly
  if (isIP(url.hostname)) {
    if (isPrivateIp(url.hostname) && !isLocalDev) {
      throw new Error("Private IP addresses not allowed");
    }
    return;
  }

  // Otherwise resolve and check every A/AAAA record
  if (!isLocalDev) {
    try {
      const records = await lookup(url.hostname, { all: true });
      for (const r of records) {
        if (isPrivateIp(r.address)) {
          throw new Error("Webhook hostname resolves to a private IP");
        }
      }
    } catch (e: any) {
      throw new Error(`Could not resolve hostname: ${e.message}`);
    }
  }
}
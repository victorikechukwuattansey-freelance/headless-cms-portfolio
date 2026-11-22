import { URL } from "node:url";
import { lookup as dnsLookup } from "node:dns/promises";
import { isIP, BlockList } from "node:net";

type Address = { address: string; family: number };
type LookupFn = (hostname: string) => Promise<Address[]>;

export type ValidatedWebhookTarget = {
  url: URL;
  addresses: Address[];
  localDevelopmentTarget: boolean;
};

const blockedV4 = new BlockList();
for (const [subnet, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10],
  ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.31.196.0", 24],
  ["192.52.193.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16],
  ["192.175.48.0", 24], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) {
  blockedV4.addSubnet(subnet, prefix, "ipv4");
}

const blockedV6 = new BlockList();
for (const [subnet, prefix] of [
  ["::", 128], ["::1", 128], ["::ffff:0:0", 96],
  ["64:ff9b::", 96], ["64:ff9b:1::", 48], ["100::", 64],
  ["2001::", 23], ["2001:db8::", 32], ["2002::", 16],
  ["3fff::", 20], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8],
] as const) {
  blockedV6.addSubnet(subnet, prefix, "ipv6");
}

const globalV6 = new BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");

function hostnameOf(url: URL): string {
  return url.hostname.replace(/^\\[|\\]$/g, "").toLowerCase();
}

function isBlockedAddress(address: string, family: number): boolean {
  if (family === 4) return blockedV4.check(address, "ipv4");
  if (family === 6) {
    return !globalV6.check(address, "ipv6") || blockedV6.check(address, "ipv6");
  }
  return true;
}

async function defaultLookup(hostname: string): Promise<Address[]> {
  const family = isIP(hostname);
  if (family) return [{ address: hostname, family }];
  return dnsLookup(hostname, { all: true, verbatim: true });
}

export async function validateWebhookUrl(
  raw: string,
  options: { nodeEnv?: string; lookupFn?: LookupFn } = {},
): Promise<ValidatedWebhookTarget> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Invalid URL");
  }

  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV;
  const hostname = hostnameOf(url);
  const isLocalHost =
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  const localDevelopmentTarget = nodeEnv !== "production" && isLocalHost;

  if (
    url.protocol !== "https:" &&
    !(url.protocol === "http:" && localDevelopmentTarget)
  ) {
    throw new Error(
      "Webhook URLs must use HTTPS; HTTP is allowed only for localhost outside production",
    );
  }
  if (url.username || url.password) {
    throw new Error("Webhook URLs must not contain credentials");
  }
  if (url.hash) throw new Error("Webhook URLs must not contain fragments");
  if (!hostname || hostname === "metadata.google.internal") {
    throw new Error("Hostname not allowed");
  }
  if (isLocalHost && !localDevelopmentTarget) {
    throw new Error("Local webhook destinations are not allowed in production");
  }

  let addresses: Address[];
  try {
    addresses = await (options.lookupFn ?? defaultLookup)(hostname);
  } catch {
    throw new Error("Could not resolve webhook hostname");
  }
  if (addresses.length === 0) {
    throw new Error("Webhook hostname did not resolve");
  }

  for (const item of addresses) {
    const family = item.family || isIP(item.address);
    const isAllowedLocalAddress =
      localDevelopmentTarget &&
      ((family === 4 && item.address === "127.0.0.1") ||
        (family === 6 && item.address === "::1"));
    if (!family || (isBlockedAddress(item.address, family) && !isAllowedLocalAddress)) {
      throw new Error("Webhook hostname resolves to a non-public IP address");
    }
  }

  return { url, addresses, localDevelopmentTarget };
}

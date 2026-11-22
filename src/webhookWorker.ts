import type { PrismaClient } from "./generated/prisma/client.js";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import type { lookup as dnsLookup } from "node:dns";

import { validateWebhookUrl } from "./webhookUrl.js";

const BATCH_SIZE = 20;
const MAX_ATTEMPTS = 5;
const REQUEST_TIMEOUT_MS = 10_000;

type Address = { address: string; family: number };

async function postToValidatedTarget(
  target: Awaited<ReturnType<typeof validateWebhookUrl>>,
  payload: unknown,
): Promise<number> {
  const { url, addresses } = target;
  const address = addresses[0];
  if (!address) throw new Error("Webhook hostname did not resolve");

  // The connection uses the already-validated address. The URL hostname remains
  // unchanged so HTTP Host and HTTPS certificate verification use the hostname.
  const pinnedLookup = ((
    _hostname: string,
    options: { all?: boolean } | number,
    callback: (...args: unknown[]) => void,
  ) => {
    if (typeof options === "object" && options.all) {
      callback(null, [{ address: address.address, family: address.family }]);
    } else {
      callback(null, address.address, address.family);
    }
  }) as unknown as typeof dnsLookup;

  return new Promise((resolve, reject) => {
    const requestOptions = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      lookup: pinnedLookup,
    };
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(
      url,
      requestOptions,
      (response) => {
        const status = response.statusCode ?? 0;
        // The response body is not used. Destroy it rather than draining an
        // untrusted, potentially unbounded response body.
        response.destroy();
        resolve(status);
      },
    );

    const timeout = setTimeout(() => {
      request.destroy(new Error("Webhook request timed out"));
    }, REQUEST_TIMEOUT_MS);
    request.once("close", () => clearTimeout(timeout));
    request.once("error", reject);
    request.end(JSON.stringify(payload));
  });
}

export async function deliverWebhook(
  rawUrl: string,
  payload: unknown,
  options: { nodeEnv?: string; lookupFn?: (hostname: string) => Promise<Address[]> } = {},
): Promise<number> {
  const target = await validateWebhookUrl(rawUrl, options);
  // Redirects are deliberately not followed. A redirect is returned as a
  // non-2xx status and handled by the existing retry/failure policy.
  return postToValidatedTarget(target, payload);
}

export async function processDeliveries(prisma: PrismaClient) {
  const due = await prisma.webhookDelivery.findMany({
    where: {
      status: "PENDING",
      nextAttemptAt: { lte: new Date() },
    },
    include: { webhook: true },
    take: BATCH_SIZE,
  });

  console.log(`[worker] ${due.length} deliveries due`);

  for (const d of due) {
    const attempts = d.attempts + 1;

    try {
      const status = await deliverWebhook(d.webhook.url, d.payload);
      if (status < 200 || status >= 300) throw new Error(`HTTP ${status}`);

      await prisma.webhookDelivery.update({
        where: { id: d.id },
        data: {
          status: "SUCCESS",
          attempts,
          deliveredAt: new Date(),
          lastError: null,
        },
      });
    } catch (e) {
      const failed = attempts >= MAX_ATTEMPTS;
      // Preserve the existing exponential retry schedule.
      const delayMs = Math.pow(2, attempts - 1) * 60_000;

      await prisma.webhookDelivery.update({
        where: { id: d.id },
        data: {
          status: failed ? "FAILED" : "PENDING",
          attempts,
          lastError: e instanceof Error ? e.message : String(e),
          nextAttemptAt: new Date(Date.now() + delayMs),
        },
      });
    }
  }
}

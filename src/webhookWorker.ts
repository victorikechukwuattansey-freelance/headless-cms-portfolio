import type { PrismaClient } from "./generated/prisma/client.js";

const BATCH_SIZE = 20;
const MAX_ATTEMPTS = 5;

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
      const res = await fetch(d.webhook.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(d.payload),
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

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
      // Exponential backoff: 1min, 2min, 4min, 8min, ...
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
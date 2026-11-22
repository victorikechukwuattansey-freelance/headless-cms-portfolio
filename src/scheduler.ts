import type { PrismaClient } from "./generated/prisma/client.js";
import { processDeliveries } from "./webhookWorker.js";

const LOCK_TTL_MS = 55_000; // less than the 60-second tick interval
const DEFAULT_INTERVAL_MS = 60_000;

type SchedulerOptions = {
  intervalMs?: number;
  setIntervalFn?: typeof setInterval;
  clearIntervalFn?: typeof clearInterval;
};

async function tryAcquireLock(prisma: PrismaClient): Promise<boolean> {
  await prisma.schedulerLock.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });

  const now = new Date();
  const result = await prisma.schedulerLock.updateMany({
    where: {
      id: "singleton",
      OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
    },
    data: {
      lockedUntil: new Date(now.getTime() + LOCK_TTL_MS),
    },
  });
  return result.count === 1;
}

export async function runSchedulerTick(prisma: PrismaClient): Promise<void> {
  const acquired = await tryAcquireLock(prisma);
  if (!acquired) return;

  try {
    const due = await prisma.blogPost.findMany({
      where: {
        status: "DRAFT",
        publishAt: { lte: new Date() },
      },
    });

    for (const post of due) {
      await prisma.blogPost.update({
        where: { id: post.id },
        data: {
          status: "PUBLISHED",
          publishedAt: new Date(),
          publishAt: null,
        },
      });
      console.log(`[scheduler] published ${post.slug}`);
    }
  } catch (error) {
    console.error("[scheduler] publish error:", error);
  }

  try {
    await processDeliveries(prisma);
  } catch (error) {
    console.error("[scheduler] delivery error:", error);
  }
}

export function startScheduler(
  prisma: PrismaClient,
  options: SchedulerOptions = {},
): () => Promise<void> {
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const scheduleInterval = options.setIntervalFn ?? setInterval;
  const cancelInterval = options.clearIntervalFn ?? clearInterval;
  let stopped = false;
  let inFlight: Promise<void> | null = null;

  const tick = () => {
    if (stopped || inFlight) return;

    inFlight = runSchedulerTick(prisma)
      .catch((error) => {
        console.error("[scheduler] tick failed:", error);
      })
      .finally(() => {
        inFlight = null;
      });
  };

  const timer = scheduleInterval(tick, intervalMs);
  timer.unref?.();
  tick();

  console.log(`[scheduler] running every ${intervalMs / 1000}s`);

  return async () => {
    if (stopped) return;
    stopped = true;
    cancelInterval(timer);
    await inFlight;
    console.log("[scheduler] stopped");
  };
}

import { PrismaClient } from "./generated/prisma/client.js";
import { processDeliveries } from "./webhookWorker.js";


const LOCK_TTL_MS = 55_000; // less than tick interval

async function tryAcquireLock(prisma: PrismaClient): Promise<boolean> {
  const now = new Date();
  const result = await prisma.schedulerLock.updateMany({
    where: {
      id: "singleton",
      OR: [
        { lockedUntil: null },
        { lockedUntil: { lt: now } },
      ],
    },
    data: {
      lockedUntil: new Date(now.getTime() + LOCK_TTL_MS),
    },
  });
  return result.count === 1;
}

export function startScheduler(prisma: PrismaClient) {
  const INTERVAL_MS = 60_000;

  const tick = async () => {
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
    } catch (e) {
      console.error("[scheduler] publish error:", e);
    }

    try {
      await processDeliveries(prisma);
    } catch (e) {
      console.error("[scheduler] delivery error:", e);
    }
  };

  setInterval(tick, INTERVAL_MS);
  console.log(`[scheduler] running every ${INTERVAL_MS / 1000}s`);
}
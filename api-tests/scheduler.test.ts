import assert from "node:assert/strict";
import { test } from "node:test";
import { runSchedulerTick, startScheduler } from "../src/scheduler.ts";

function createPrismaDouble({
  lockAcquired = true,
  duePosts = [],
  deliveryError = null,
} = {}) {
  const calls = {
    lock: 0,
    ensureLock: 0,
    releaseLock: 0,
    releaseWhere: null as unknown,
    findPosts: 0,
    updatePosts: [] as unknown[],
    findDeliveries: 0,
  };

  const prisma = {
    schedulerLock: {
      upsert: async () => {
        calls.ensureLock += 1;
        return { id: "singleton" };
      },
      updateMany: async (args: { where: unknown; data: unknown }) => {
        calls.lock += 1;
        if ("lockedUntil" in (args.data as object) &&
            (args.data as { lockedUntil?: unknown }).lockedUntil === null) {
          calls.releaseLock += 1;
          calls.releaseWhere = args.where;
          return { count: 1 };
        }
        return { count: lockAcquired ? 1 : 0 };
      },
    },
    blogPost: {
      findMany: async () => {
        calls.findPosts += 1;
        return duePosts;
      },
      update: async (args: unknown) => {
        calls.updatePosts.push(args);
        return args;
      },
    },
    webhookDelivery: {
      findMany: async () => {
        calls.findDeliveries += 1;
        if (deliveryError) throw deliveryError;
        return [];
      },
    },
  };

  return { prisma, calls };
}

test("scheduler tick skips work when the database lock is held", async () => {
  const { prisma, calls } = createPrismaDouble({ lockAcquired: false });

  await runSchedulerTick(prisma as never);

  assert.equal(calls.ensureLock, 1);
  assert.equal(calls.lock, 1);
  assert.equal(calls.releaseLock, 0);
  assert.equal(calls.findPosts, 0);
  assert.equal(calls.findDeliveries, 0);
});

test("scheduler tick publishes due posts, processes deliveries, and releases its lease", async () => {
  const post = { id: "post-1", slug: "scheduled-post" };
  const { prisma, calls } = createPrismaDouble({ duePosts: [post] });

  await runSchedulerTick(prisma as never);

  assert.equal(calls.ensureLock, 1);
  assert.equal(calls.findPosts, 1);
  assert.deepEqual((calls.updatePosts[0] as { where: unknown }).where, { id: "post-1" });
  assert.equal((calls.updatePosts[0] as { data: { status: string } }).data.status, "PUBLISHED");
  assert.ok((calls.updatePosts[0] as { data: { publishedAt: Date } }).data.publishedAt instanceof Date);
  assert.equal((calls.updatePosts[0] as { data: { publishAt: null } }).data.publishAt, null);
  assert.equal(calls.findDeliveries, 1);
  assert.equal(calls.releaseLock, 1);
  assert.ok(calls.releaseWhere && "lockedUntil" in (calls.releaseWhere as object));
});

test("scheduler releases its lease even when delivery processing fails", async () => {
  const { prisma, calls } = createPrismaDouble({ deliveryError: new Error("database unavailable") });

  await runSchedulerTick(prisma as never);

  assert.equal(calls.findDeliveries, 1);
  assert.equal(calls.releaseLock, 1);
});

test("scheduler does not overlap ticks and waits for in-flight work on stop", async () => {
  let intervalCallback: (() => void) | undefined;
  let releaseQuery!: () => void;
  let queryStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    queryStarted = resolve;
  });
  const blockedQuery = new Promise<void>((resolve) => {
    releaseQuery = resolve;
  });
  let queryCount = 0;
  let cleared = false;

  const { prisma } = createPrismaDouble();
  prisma.blogPost.findMany = async () => {
    queryCount += 1;
    queryStarted();
    await blockedQuery;
    return [];
  };

  const stop = startScheduler(prisma as never, {
    intervalMs: 10,
    setIntervalFn: ((callback) => {
      intervalCallback = callback;
      return 1 as unknown as NodeJS.Timeout;
    }) as typeof setInterval,
    clearIntervalFn: (() => {
      cleared = true;
    }) as typeof clearInterval,
  });

  await started;
  intervalCallback?.();
  assert.equal(queryCount, 1);

  let stopped = false;
  const stopping = stop().then(() => {
    stopped = true;
  });
  assert.equal(cleared, true);
  assert.equal(stopped, false);

  releaseQuery();
  await stopping;
  assert.equal(stopped, true);
});

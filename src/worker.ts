import "dotenv/config";
import { prisma } from "./context.js";
import { startScheduler } from "./scheduler.js";

const stopScheduler = startScheduler(prisma);

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[worker] received ${signal}; stopping scheduler`);

  try {
    await stopScheduler();
  } finally {
    await prisma.$disconnect();
    console.log("[worker] shutdown complete");
  }
}

process.once("SIGINT", () => {
  void shutdown("SIGINT");
});

process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});

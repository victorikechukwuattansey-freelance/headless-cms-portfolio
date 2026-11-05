-- CreateTable
CREATE TABLE "SchedulerLock" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "lockedUntil" TIMESTAMP(3),

    CONSTRAINT "SchedulerLock_pkey" PRIMARY KEY ("id")
);

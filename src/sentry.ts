import * as Sentry from "@sentry/node";

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? "development",
    release: process.env.FLY_MACHINE_VERSION ?? "local",
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    integrations: [Sentry.prismaIntegration()], // Prisma 5/6/7 support enabled by default[reference:1]
  });
} else {
  console.log("[sentry] SENTRY_DSN not set — error tracking disabled");
}
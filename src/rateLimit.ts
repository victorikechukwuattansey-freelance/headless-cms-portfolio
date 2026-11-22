import { Pool } from "pg";
import { RateLimiterPostgres } from "rate-limiter-flexible";
import {
  consumeLoginAttempt,
  resetLoginAttemptLimit,
  hashLoginRateLimitKey,
} from "./loginRateLimit.js";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  max: 5,
  connectionTimeoutMillis: 5_000,
});

let limiter: RateLimiterPostgres | undefined;

function getLimiter(): RateLimiterPostgres {
  if (!limiter) {
    // tableCreated=true invokes the constructor callback synchronously.
    // Instantiate without a callback so the caller receives the real instance.
    limiter = new RateLimiterPostgres({
      storeClient: pool,
      points: 5,
      duration: 60 * 15,
      blockDuration: 60 * 15,
      keyPrefix: "cms_login",
      tableName: "cms_login_rate_limits",
      // Provisioned by Prisma migration; runtime credentials need DML only.
      tableCreated: true,
    });
  }

  return limiter;
}

export async function checkLoginRateLimit(key: string) {
  await consumeLoginAttempt(getLimiter(), hashLoginRateLimitKey(key));
}

export async function resetLoginRateLimit(key: string) {
  await resetLoginAttemptLimit(getLimiter(), hashLoginRateLimitKey(key));
}

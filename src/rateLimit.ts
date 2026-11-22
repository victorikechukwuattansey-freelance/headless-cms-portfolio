import { Pool } from "pg";
import { RateLimiterPostgres } from "rate-limiter-flexible";
import {
  consumeLoginAttempt,
  resetLoginAttemptLimit,
} from "./loginRateLimit.js";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  max: 5,
  connectionTimeoutMillis: 5_000,
});

let limiterPromise: Promise<RateLimiterPostgres> | undefined;

function getLimiter(): Promise<RateLimiterPostgres> {
  if (!limiterPromise) {
    limiterPromise = new Promise((resolve, reject) => {
      let limiter: RateLimiterPostgres;
      limiter = new RateLimiterPostgres(
        {
          storeClient: pool,
          points: 5,
          duration: 60 * 15,
          blockDuration: 60 * 15,
          keyPrefix: "cms_login",
          tableName: "cms_login_rate_limits",
        },
        (error) => {
          if (error) {
            reject(error);
          } else {
            resolve(limiter);
          }
        },
      );
    });
  }

  return limiterPromise;
}

export async function checkLoginRateLimit(key: string) {
  await consumeLoginAttempt(await getLimiter(), key);
}

export async function resetLoginRateLimit(key: string) {
  await resetLoginAttemptLimit(await getLimiter(), key);
}

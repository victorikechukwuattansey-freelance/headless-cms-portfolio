import { RateLimiterMemory } from "rate-limiter-flexible";

// 5 attempts per 15 minutes per IP
const limiter = new RateLimiterMemory({
  points: 5,
  duration: 60 * 15,
  blockDuration: 60 * 15,
});

export async function checkLoginRateLimit(key: string) {
  try {
    await limiter.consume(key);
  } catch {
    const ms = await limiter.get(key).then((r) => r?.msBeforeNext ?? 0);
    const minutes = Math.ceil(ms / 60000);
    throw new Error(
      `Too many login attempts. Try again in ${minutes} minute(s).`
    );
  }
}

export async function resetLoginRateLimit(key: string) {
  await limiter.delete(key);
}
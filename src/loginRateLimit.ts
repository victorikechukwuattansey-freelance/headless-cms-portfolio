export type LoginRateLimiter = {
  consume(key: string): Promise<unknown>;
  delete(key: string): Promise<unknown>;
};

export async function consumeLoginAttempt(
  limiter: LoginRateLimiter,
  key: string,
): Promise<void> {
  try {
    await limiter.consume(key);
  } catch (error) {
    // Storage failures must not silently fall back to a process-local limiter.
    // Fail closed; a rejected consume that is not an Error is a rate-limit hit.
    if (error instanceof Error) {
      throw new Error("Login is temporarily unavailable. Please try again.");
    }

    const ms =
      typeof error === "object" &&
      error !== null &&
      "msBeforeNext" in error &&
      typeof error.msBeforeNext === "number"
        ? error.msBeforeNext
        : 0;
    const minutes = Math.max(1, Math.ceil(ms / 60000));
    throw new Error(
      `Too many login attempts. Try again in ${minutes} minute(s).`,
    );
  }
}

export async function resetLoginAttemptLimit(
  limiter: LoginRateLimiter,
  key: string,
): Promise<void> {
  await limiter.delete(key);
}

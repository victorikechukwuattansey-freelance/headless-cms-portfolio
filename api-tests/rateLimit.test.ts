import assert from "node:assert/strict";
import { test } from "node:test";
import { getClientIp } from "../src/clientIp.ts";
import {
  consumeLoginAttempt,
  resetLoginAttemptLimit,
  type LoginRateLimiter,
} from "../src/loginRateLimit.ts";

test("Fly requests use the validated Fly-Client-IP and ignore X-Forwarded-For", () => {
  const headers = new Headers({
    "fly-client-ip": "203.0.113.42",
    "x-forwarded-for": "198.51.100.99",
  });

  assert.equal(getClientIp(headers, "headless-cms-viaai"), "203.0.113.42");
});

test("invalid or missing Fly-Client-IP never falls back to X-Forwarded-For", () => {
  const spoofedHeaders = new Headers({
    "fly-client-ip": "attacker-controlled-value",
    "x-forwarded-for": "198.51.100.99",
  });
  const missingHeaders = new Headers({
    "x-forwarded-for": "198.51.100.99",
  });

  assert.equal(getClientIp(spoofedHeaders, "headless-cms-viaai"), "unknown");
  assert.equal(getClientIp(missingHeaders, "headless-cms-viaai"), "unknown");
});

test("non-Fly deployments ignore forwarded client IP headers", () => {
  const headers = new Headers({
    "fly-client-ip": "203.0.113.42",
    "x-forwarded-for": "198.51.100.99",
  });

  assert.equal(getClientIp(headers, undefined), "unknown");
});

test("Fly client IP accepts IPv6 addresses", () => {
  const headers = new Headers({ "fly-client-ip": "2001:db8::42" });
  assert.equal(getClientIp(headers, "headless-cms-viaai"), "2001:db8::42");
});

test("shared login limiter reports an exhausted limit with its retry time", async () => {
  const limiter: LoginRateLimiter = {
    consume: async () => {
      throw { msBeforeNext: 61_000 };
    },
    delete: async () => undefined,
  };

  await assert.rejects(
    consumeLoginAttempt(limiter, "client:editor@example.com"),
    /Try again in 2 minute\(s\)/,
  );
});

test("shared login limiter fails closed when its backing store errors", async () => {
  const limiter: LoginRateLimiter = {
    consume: async () => {
      throw new Error("database unavailable");
    },
    delete: async () => undefined,
  };

  await assert.rejects(
    consumeLoginAttempt(limiter, "client:editor@example.com"),
    /Login is temporarily unavailable/,
  );
});

test("successful login resets the shared limiter key", async () => {
  let deletedKey = "";
  const limiter: LoginRateLimiter = {
    consume: async () => undefined,
    delete: async (key) => {
      deletedKey = key;
    },
  };

  await resetLoginAttemptLimit(limiter, "client:editor@example.com");
  assert.equal(deletedKey, "client:editor@example.com");
});

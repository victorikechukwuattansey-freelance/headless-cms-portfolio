import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import {
  checkLoginRateLimit,
  resetLoginRateLimit,
} from "../src/rateLimit.ts";

const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "true";

test(
  "PostgreSQL login limiter works with a pre-provisioned table and DML-only role",
  { skip: !enabled },
  async () => {
    const key = `integration:${randomUUID()}`;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await checkLoginRateLimit(key);
    }

    await assert.rejects(
      checkLoginRateLimit(key),
      /Too many login attempts/,
    );

    await resetLoginRateLimit(key);
    await checkLoginRateLimit(key);
  },
);

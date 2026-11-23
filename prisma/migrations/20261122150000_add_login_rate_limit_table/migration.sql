-- Shared PostgreSQL storage for rate-limiter-flexible login limits.
-- Keep this schema aligned with RateLimiterPostgres._getCreateTableStmt().
CREATE TABLE IF NOT EXISTS "cms_login_rate_limits" (
  "key" VARCHAR(255) PRIMARY KEY,
  "points" INTEGER NOT NULL DEFAULT 0,
  "expire" BIGINT
);

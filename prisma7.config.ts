import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // CLI / migrations — must be the DIRECT (unpooled) URL
    url: env("DIRECT_URL"),
  },
});
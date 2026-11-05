import path from "node:path";

// Resolve to <project>/dev.db, same location Prisma CLI uses
export const DB_PATH = path.resolve(process.cwd(), "dev.db").replace(/\\/g, "/");
export const DB_URL = `file:${DB_PATH}`;
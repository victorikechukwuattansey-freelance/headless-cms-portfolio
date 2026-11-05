import { PrismaClient } from "./generated/prisma/client.js";
import { PrismaNeon } from "@prisma/adapter-neon";
import { verifyAccessToken } from "./auth.js";


const adapter = new PrismaNeon({
  connectionString: process.env.DATABASE_URL!,
});

export const prisma = new PrismaClient({ adapter });

export async function createContext({ request }: { request: Request }) {
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;

  let user = null;
  let tokenExpired = false;

  if (token) {
    const result = verifyAccessToken(token);
    if (result && "expired" in result) {
      tokenExpired = true;
    } else if (result) {
      user = await prisma.user.findUnique({ where: { id: result.userId } });
    }
  }

  const xff = request.headers.get("x-forwarded-for");
  const ip = xff?.split(",")[0].trim() ?? "unknown";

  return { prisma, user, ip, tokenExpired };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
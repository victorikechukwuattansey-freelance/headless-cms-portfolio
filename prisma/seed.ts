import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import "dotenv/config";



const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

const prisma = new PrismaClient({ adapter });

async function main() {
  const passwordHash = await bcrypt.hash("admin123", 10);

  await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: {},
    create: {
      email: "admin@example.com",
      passwordHash,
      role: "ADMIN",
    },
  });

  console.log("Seeded admin@example.com / admin123");
}

main()
await prisma.schedulerLock.upsert({
  where: { id: "singleton" },
  update: {},
  create: { id: "singleton" },
})
  .catch(console.error)
  .finally(() => prisma.$disconnect());
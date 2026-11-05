import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const post = await prisma.blogPost.create({
    data: {
      title: "Retention Test v0",
      slug: `retention-test-${Date.now()}`,
      content: "Initial.",
      status: "DRAFT",
      authorId: (
        await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" } })
      ).id,
    },
  });

  for (let i = 1; i <= 25; i++) {
    // Snapshot
    await prisma.postVersion.create({
      data: {
        postId: post.id,
        title: `Retention Test v${i - 1}`,
        slug: post.slug,
        content: `Revision ${i - 1}.`,
        status: "DRAFT",
        createdBy: "system",
      },
    });

    // Prune
    const stale = await prisma.postVersion.findMany({
      where: { postId: post.id },
      orderBy: { createdAt: "desc" },
      select: { id: true },
      skip: 20,
    });
    if (stale.length > 0) {
      await prisma.postVersion.deleteMany({
        where: { id: { in: stale.map((v) => v.id) } },
      });
    }

    await prisma.blogPost.update({
      where: { id: post.id },
      data: { title: `Retention Test v${i}`, content: `Revision ${i}.` },
    });
  }

  const count = await prisma.postVersion.count({ where: { postId: post.id } });
  console.log(`Post id: ${post.id}`);
  console.log(`Versions retained: ${count} (expected 20)`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
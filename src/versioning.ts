import type { Context } from "./context.js";

const MAX_VERSIONS_PER_POST = 20;

export async function snapshotPost(
  ctx: Context,
  postId: string,
  userId: string
) {
  const post = await ctx.prisma.blogPost.findUnique({ where: { id: postId } });
  if (!post) return;

  await ctx.prisma.postVersion.create({
    data: {
      postId: post.id,
      title: post.title,
      slug: post.slug,
      content: post.content,
      status: post.status,
      createdBy: userId,
    },
  });

  // Prune: keep only the newest N snapshots per post
  const stale = await ctx.prisma.postVersion.findMany({
    where: { postId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
    skip: MAX_VERSIONS_PER_POST,
  });

  if (stale.length > 0) {
    await ctx.prisma.postVersion.deleteMany({
      where: { id: { in: stale.map((v) => v.id) } },
    });
  }
}
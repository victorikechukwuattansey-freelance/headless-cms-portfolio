import { Prisma } from "./generated/prisma/client.js";
import { translationSchema, localeSchema } from "./validation.js";
import { DateTimeResolver } from "graphql-scalars";
import bcrypt from "bcryptjs";
import {
  signAccessToken,
  generateRefreshToken,
  hashRefreshToken,
} from "./auth.js";
import type { Context } from "./context.js";
import { dispatchWebhook } from "./webhooks.js";
import { createUploadSignature } from "./cloudinary.js";
import { UserError, fromPrismaError } from "./errors.js";
import { validateWebhookUrl } from "./webhookUrl.js";
import { checkLoginRateLimit, resetLoginRateLimit } from "./rateLimit.js";
import {
  createPostSchema,
  updatePostSchema,
  loginSchema,
  parseOrThrow,
  slugify,
} from "./validation.js";
import { snapshotPost } from "./versioning.js";
import { diffLines } from "diff";

const REFRESH_TTL_DAYS = 30;

async function issueTokens(
  ctx: Context,
  user: { id: string; role: string; email: string },
  existingRefresh?: string,
) {
  // Revoke old if rotating
  if (existingRefresh) {
    const hash = hashRefreshToken(existingRefresh);
    await ctx.prisma.refreshToken.updateMany({
      where: { tokenHash: hash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  const accessToken = signAccessToken(user.id, user.role);
  const { raw, hash } = generateRefreshToken();

  await ctx.prisma.refreshToken.create({
    data: {
      tokenHash: hash,
      userId: user.id,
      expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000),
    },
  });

  return { accessToken, refreshToken: raw, user };
}

function requireUser(ctx: Context) {
  if (ctx.tokenExpired) {
    throw new UserError("Access token expired", "TOKEN_EXPIRED");
  }
  if (!ctx.user) throw new UserError("Unauthorized", "UNAUTHENTICATED");
  return ctx.user;
}

function requireOwnerOrAdmin(ctx: Context, authorId: string) {
  const user = requireUser(ctx);
  if (user.role !== "ADMIN" && user.id !== authorId) {
    throw new UserError("Forbidden", "FORBIDDEN");
  }
  return user;
}

export const resolvers = {
  BlogPost: {
    locale: (parent: {
      _requestedLocale?: string | null;
      defaultLocale: string;
    }) => parent._requestedLocale ?? parent.defaultLocale,

    isFallback: (parent: {
      _requestedLocale?: string | null;
      defaultLocale: string;
      translations?: { locale: string }[];
    }) => {
      if (!parent._requestedLocale) return false;
      if (parent._requestedLocale === parent.defaultLocale) return false;
      return !parent.translations?.some(
        (t) => t.locale === parent._requestedLocale,
      );
    },

    title: (parent: {
      _requestedLocale?: string | null;
      title: string;
      translations?: { locale: string; title: string }[];
    }) => {
      if (!parent._requestedLocale) return parent.title;
      const t = parent.translations?.find(
        (t) => t.locale === parent._requestedLocale,
      );
      return t?.title ?? parent.title;
    },

    slug: (parent: {
      _requestedLocale?: string | null;
      slug: string;
      translations?: { locale: string; slug: string }[];
    }) => {
      if (!parent._requestedLocale) return parent.slug;
      const t = parent.translations?.find(
        (t) => t.locale === parent._requestedLocale,
      );
      return t?.slug ?? parent.slug;
    },

    content: (parent: {
      _requestedLocale?: string | null;
      content: string;
      translations?: { locale: string; content: string }[];
    }) => {
      if (!parent._requestedLocale) return parent.content;
      const t = parent.translations?.find(
        (t) => t.locale === parent._requestedLocale,
      );
      return t?.content ?? parent.content;
    },
    versions: async (parent: { id: string }, _: unknown, ctx: Context) => {
      if (!ctx.user) return [];
      return ctx.prisma.postVersion.findMany({
        where: { postId: parent.id },
        orderBy: { createdAt: "desc" },
      });
    },
  },

  DateTime: DateTimeResolver,

  PostVersion: {
    diffFromPrevious: async (
      parent: { postId: string; content: string; createdAt: Date },
      _: unknown,
      ctx: Context,
    ) => {
      const previous = await ctx.prisma.postVersion.findFirst({
        where: {
          postId: parent.postId,
          createdAt: { lt: parent.createdAt },
        },
        orderBy: { createdAt: "desc" },
      });

      if (!previous) {
        return [{ value: parent.content, added: true, removed: false }];
      }

      return diffLines(previous.content, parent.content).map((part) => ({
        value: part.value,
        added: !!part.added,
        removed: !!part.removed,
      }));
    },
  },

  Query: {
    posts: async (
      _: unknown,
      args: { publishedOnly?: boolean; locale?: string },
      ctx: Context,
    ) => {
      const publishedOnly = args.publishedOnly ?? true;
      if (!publishedOnly && !ctx.user) {
        throw new UserError(
          "Unauthorized: login required to view drafts",
          "UNAUTHENTICATED",
        );
      }

      const locale = args.locale ?? null;
      if (locale) parseOrThrow(localeSchema, locale);

      const posts = await ctx.prisma.blogPost.findMany({
        where: publishedOnly ? { status: "PUBLISHED" } : {},
        orderBy: { createdAt: "desc" },
        include: { author: true, heroMedia: true, translations: true },
      });

      return posts.map((p) => ({ ...p, _requestedLocale: locale }));
    },

    post: async (
      _: unknown,
      args: { id?: string; slug?: string; locale?: string },
      ctx: Context,
    ) => {
      const locale = args.locale ?? null;
      if (locale) parseOrThrow(localeSchema, locale);

      const post =
        (locale && args.slug
          ? await ctx.prisma.postTranslation
              .findFirst({
                where: { locale, slug: args.slug },
                include: {
                  post: {
                    include: {
                      author: true,
                      heroMedia: true,
                      translations: true,
                    },
                  },
                },
              })
              .then((t) => t?.post ?? null)
          : null) ??
        (await ctx.prisma.blogPost.findFirst({
          where: args.id ? { id: args.id } : { slug: args.slug },
          include: { author: true, heroMedia: true, translations: true },
        }));

      if (!post) return null;

      if (post.status !== "PUBLISHED") {
        if (!ctx.user) throw new UserError("Unauthorized", "UNAUTHENTICATED");
        if (ctx.user.role !== "ADMIN" && ctx.user.id !== post.authorId) {
          throw new UserError("Forbidden", "FORBIDDEN");
        }
      }

      return { ...post, _requestedLocale: locale };
    },

    postVersions: async (
      _: unknown,
      args: { postId: string },
      ctx: Context,
    ) => {
      requireUser(ctx);
      return ctx.prisma.postVersion.findMany({
        where: { postId: args.postId },
        orderBy: { createdAt: "desc" },
      });
    },

    searchPosts: async (
      _: unknown,
      args: { query: string; publishedOnly?: boolean; locale?: string },
      ctx: Context,
    ) => {
      const q = args.query.trim();
      if (q.length < 2)
        throw new UserError("Query too short", "BAD_USER_INPUT");

      const publishedOnly = args.publishedOnly ?? true;
      if (!publishedOnly && !ctx.user) {
        throw new UserError("Unauthorized", "UNAUTHENTICATED");
      }

      const locale = args.locale ?? null;
      if (locale) parseOrThrow(localeSchema, locale);

      const rows = await ctx.prisma.$queryRaw<{ id: string }[]>`
    SELECT id
    FROM "BlogPost"
    WHERE search_vector @@ plainto_tsquery('english', ${q})
    ${publishedOnly ? Prisma.sql`AND status = 'PUBLISHED'` : Prisma.empty}
    ORDER BY ts_rank(search_vector, plainto_tsquery('english', ${q})) DESC
    LIMIT 50
  `;

      if (rows.length === 0) return [];

      const ids = rows.map((r) => r.id);

      const posts = await ctx.prisma.blogPost.findMany({
        where: { id: { in: ids } },
        include: { author: true, heroMedia: true, translations: true },
      });

      const order = new Map(ids.map((id, i) => [id, i]));
      const sorted = posts.sort(
        (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
      );

      return sorted.map((p) => ({ ...p, _requestedLocale: locale }));
    },

    webhookDeliveries: async (
      _: unknown,
      args: { webhookId?: string },
      ctx: Context,
    ) => {
      requireUser(ctx);
      return ctx.prisma.webhookDelivery.findMany({
        where: args.webhookId ? { webhookId: args.webhookId } : {},
        orderBy: { createdAt: "desc" },
        take: 100,
      });
    },

    media: async (
      _: unknown,
      args: { limit?: number; offset?: number },
      ctx: Context,
    ) => {
      requireUser(ctx);
      return ctx.prisma.media.findMany({
        orderBy: { createdAt: "desc" },
        take: args.limit ?? 50,
        skip: args.offset ?? 0,
      });
    },

    me: (_: unknown, __: unknown, ctx: Context) => ctx.user,
  },

  Mutation: {
    login: async (
      _: unknown,
      args: { email: string; password: string },
      ctx: Context,
    ) => {
      const input = parseOrThrow(loginSchema, args);
      const rateKey = `${ctx.ip}:${input.email}`;
      await checkLoginRateLimit(rateKey);

      const user = await ctx.prisma.user.findUnique({
        where: { email: input.email },
      });
      if (!user) throw new UserError("Invalid credentials", "UNAUTHENTICATED");

      const ok = await bcrypt.compare(input.password, user.passwordHash);
      if (!ok) throw new UserError("Invalid credentials", "UNAUTHENTICATED");

      await resetLoginRateLimit(rateKey);

      return issueTokens(ctx, user);
    },

    refreshSession: async (
      _: unknown,
      args: { refreshToken: string },
      ctx: Context,
    ) => {
      const hash = hashRefreshToken(args.refreshToken);
      const stored = await ctx.prisma.refreshToken.findUnique({
        where: { tokenHash: hash },
        include: { user: true },
      });

      if (!stored) {
        throw new UserError("Invalid refresh token", "UNAUTHENTICATED");
      }

      if (stored.revokedAt) {
        // Token reuse detected — revoke all of the user's tokens
        await ctx.prisma.refreshToken.updateMany({
          where: { userId: stored.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        throw new UserError("Refresh token reused", "UNAUTHENTICATED");
      }

      if (stored.expiresAt < new Date()) {
        throw new UserError("Refresh token expired", "UNAUTHENTICATED");
      }

      return issueTokens(ctx, stored.user, args.refreshToken);
    },

    logout: async (
      _: unknown,
      args: { refreshToken: string },
      ctx: Context,
    ) => {
      const hash = hashRefreshToken(args.refreshToken);
      await ctx.prisma.refreshToken.updateMany({
        where: { tokenHash: hash, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return true;
    },

    createPost: async (_: unknown, args: { input: any }, ctx: Context) => {
      const user = requireUser(ctx);
      const input = parseOrThrow(createPostSchema, args.input);
      const slug = input.slug ?? slugify(input.title);

      try {
        return await ctx.prisma.blogPost.create({
          data: {
            title: input.title,
            slug,
            content: input.content,
            heroMediaId: input.heroMediaId ?? null,
            authorId: user.id,
            status: "DRAFT",
          },
          include: { author: true, heroMedia: true },
        });
      } catch (e) {
        fromPrismaError(e);
      }
    },

    updatePost: async (
      _: unknown,
      args: { id: string; input: any },
      ctx: Context,
    ) => {
      const existing = await ctx.prisma.blogPost.findUnique({
        where: { id: args.id },
      });
      if (!existing) throw new UserError("Post not found", "NOT_FOUND");
      const user = requireOwnerOrAdmin(ctx, existing.authorId);

      const input = parseOrThrow(updatePostSchema, args.input);

      await snapshotPost(ctx, args.id, user.id);

      try {
        return await ctx.prisma.blogPost.update({
          where: { id: args.id },
          data: input,
          include: { author: true, heroMedia: true },
        });
      } catch (e) {
        fromPrismaError(e);
      }
    },

    publishPost: async (_: unknown, args: { id: string }, ctx: Context) => {
      const existing = await ctx.prisma.blogPost.findUnique({
        where: { id: args.id },
      });
      if (!existing) throw new UserError("Post not found", "NOT_FOUND");
      const user = requireOwnerOrAdmin(ctx, existing.authorId);

      await snapshotPost(ctx, args.id, user.id);

      const post = await ctx.prisma.blogPost.update({
        where: { id: args.id },
        data: {
          status: "PUBLISHED",
          publishedAt: existing.publishedAt ?? new Date(),
          publishAt: null,
        },
        include: { author: true, heroMedia: true },
      });

      await dispatchWebhook(ctx, "post.published", {
        id: post.id,
        slug: post.slug,
        title: post.title,
      });

      return post;
    },

    unpublishPost: async (_: unknown, args: { id: string }, ctx: Context) => {
      const existing = await ctx.prisma.blogPost.findUnique({
        where: { id: args.id },
      });
      if (!existing) throw new UserError("Post not found", "NOT_FOUND");
      const user = requireOwnerOrAdmin(ctx, existing.authorId);

      await snapshotPost(ctx, args.id, user.id);

      const post = await ctx.prisma.blogPost.update({
        where: { id: args.id },
        data: { status: "DRAFT" },
        include: { author: true, heroMedia: true },
      });

      await dispatchWebhook(ctx, "post.unpublished", {
        id: post.id,
        slug: post.slug,
        title: post.title,
      });

      return post;
    },

    deletePost: async (_: unknown, args: { id: string }, ctx: Context) => {
      const user = requireUser(ctx);
      const existing = await ctx.prisma.blogPost.findUnique({
        where: { id: args.id },
      });
      if (!existing) throw new UserError("Post not found", "NOT_FOUND");

      if (user.role !== "ADMIN" && user.id !== existing.authorId) {
        throw new UserError("Forbidden", "FORBIDDEN");
      }

      await ctx.prisma.blogPost.delete({ where: { id: args.id } });
      return true;
    },

    createMedia: (
      _: unknown,
      args: { url: string; alt?: string; mimeType?: string; size?: number },
      ctx: Context,
    ) => {
      requireUser(ctx);
      return ctx.prisma.media.create({
        data: {
          url: args.url,
          alt: args.alt,
          mimeType: args.mimeType,
          size: args.size,
        },
      });
    },

    updateMedia: async (
      _: unknown,
      args: { id: string; alt?: string },
      ctx: Context,
    ) => {
      requireUser(ctx);

      const existing = await ctx.prisma.media.findUnique({
        where: { id: args.id },
      });
      if (!existing) throw new UserError("Media not found", "NOT_FOUND");

      return ctx.prisma.media.update({
        where: { id: args.id },
        data: { alt: args.alt ?? null },
      });
    },

    deleteMedia: async (_: unknown, args: { id: string }, ctx: Context) => {
      requireUser(ctx);

      const media = await ctx.prisma.media.findUnique({
        where: { id: args.id },
        include: { posts: { select: { id: true, title: true } } },
      });
      if (!media) throw new UserError("Media not found", "NOT_FOUND");

      if (media.posts.length > 0) {
        throw new UserError(
          `Cannot delete: used by ${media.posts.length} post(s)`,
          "CONFLICT",
        );
      }

      await ctx.prisma.media.delete({ where: { id: args.id } });
      return true;
    },

    createWebhook: async (
      _: unknown,
      args: { url: string; event: string },
      ctx: Context,
    ) => {
      requireUser(ctx);

      if (!["post.published", "post.unpublished"].includes(args.event)) {
        throw new UserError("Unsupported event", "BAD_USER_INPUT");
      }

      try {
        await validateWebhookUrl(args.url);
      } catch (e: any) {
        throw new UserError(e.message, "BAD_USER_INPUT");
      }

      return ctx.prisma.webhook.create({
        data: { url: args.url, event: args.event },
      });
    },
    createUploadSignature: (_: unknown, __: unknown, ctx: Context) => {
      requireUser(ctx);
      return createUploadSignature();
    },

    restoreVersion: async (
      _: unknown,
      args: { postId: string; versionId: string },
      ctx: Context,
    ) => {
      const post = await ctx.prisma.blogPost.findUnique({
        where: { id: args.postId },
      });
      if (!post) throw new UserError("Post not found", "NOT_FOUND");
      const user = requireOwnerOrAdmin(ctx, post.authorId);

      const version = await ctx.prisma.postVersion.findUnique({
        where: { id: args.versionId },
      });
      if (!version || version.postId !== args.postId) {
        throw new UserError("Version not found", "NOT_FOUND");
      }

      await snapshotPost(ctx, args.postId, user.id);

      try {
        return await ctx.prisma.blogPost.update({
          where: { id: args.postId },
          data: {
            title: version.title,
            slug: version.slug,
            content: version.content,
            status: version.status,
          },
          include: { author: true, heroMedia: true },
        });
      } catch (e) {
        fromPrismaError(e);
      }
    },

    schedulePost: async (
      _: unknown,
      args: { id: string; publishAt: string },
      ctx: Context,
    ) => {
      const existing = await ctx.prisma.blogPost.findUnique({
        where: { id: args.id },
      });
      if (!existing) throw new UserError("Post not found", "NOT_FOUND");
      requireOwnerOrAdmin(ctx, existing.authorId);

      const when = new Date(args.publishAt);
      if (Number.isNaN(when.getTime())) {
        throw new UserError("Invalid date", "BAD_USER_INPUT");
      }
      if (when <= new Date()) {
        throw new UserError(
          "publishAt must be in the future",
          "BAD_USER_INPUT",
        );
      }

      return ctx.prisma.blogPost.update({
        where: { id: args.id },
        data: { publishAt: when },
        include: { author: true, heroMedia: true },
      });
    },

    unschedulePost: async (_: unknown, args: { id: string }, ctx: Context) => {
      const existing = await ctx.prisma.blogPost.findUnique({
        where: { id: args.id },
      });
      if (!existing) throw new UserError("Post not found", "NOT_FOUND");
      requireOwnerOrAdmin(ctx, existing.authorId);

      return ctx.prisma.blogPost.update({
        where: { id: args.id },
        data: { publishAt: null },
        include: { author: true, heroMedia: true },
      });
    },
    upsertTranslation: async (
      _: unknown,
      args: {
        postId: string;
        locale: string;
        title: string;
        slug: string;
        content: string;
      },
      ctx: Context,
    ) => {
      const post = await ctx.prisma.blogPost.findUnique({
        where: { id: args.postId },
      });
      if (!post) throw new UserError("Post not found", "NOT_FOUND");
      requireOwnerOrAdmin(ctx, post.authorId);

      parseOrThrow(localeSchema, args.locale);
      const input = parseOrThrow(translationSchema, args);

      try {
        return await ctx.prisma.postTranslation.upsert({
          where: {
            postId_locale: { postId: args.postId, locale: args.locale },
          },
          create: {
            postId: args.postId,
            locale: args.locale,
            title: input.title,
            slug: input.slug,
            content: input.content,
          },
          update: {
            title: input.title,
            slug: input.slug,
            content: input.content,
          },
        });
      } catch (e) {
        fromPrismaError(e);
      }
    },

    deleteTranslation: async (
      _: unknown,
      args: { postId: string; locale: string },
      ctx: Context,
    ) => {
      const post = await ctx.prisma.blogPost.findUnique({
        where: { id: args.postId },
      });
      if (!post) throw new UserError("Post not found", "NOT_FOUND");
      requireOwnerOrAdmin(ctx, post.authorId);

      try {
        await ctx.prisma.postTranslation.delete({
          where: {
            postId_locale: { postId: args.postId, locale: args.locale },
          },
        });
        return true;
      } catch (e) {
        fromPrismaError(e);
      }
    },
  },
};

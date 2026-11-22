import assert from "node:assert/strict";
import { test } from "node:test";
import jwt from "jsonwebtoken";
import { graphql } from "graphql";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { typeDefs } from "../src/schema.ts";
import { resolvers } from "../src/resolvers.ts";
import {
  generateRefreshToken,
  hashRefreshToken,
  signAccessToken,
  verifyAccessToken,
} from "../src/auth.ts";

const schema = makeExecutableSchema({ typeDefs, resolvers });

function createContext({
  user = null,
  post = null,
} = {}) {
  const calls = {
    findMany: [],
    findUnique: [],
    create: [],
    update: [],
    versionCreate: [],
  };

  const prisma = {
    blogPost: {
      findMany: async (args) => {
        calls.findMany.push(args);
        return [];
      },
      findUnique: async (args) => {
        calls.findUnique.push(args);
        return post;
      },
      create: async (args) => {
        calls.create.push(args);
        return { id: "new-post", title: args.data.title };
      },
      update: async (args) => {
        calls.update.push(args);
        return { id: args.where.id, title: args.data.title };
      },
    },
    postVersion: {
      create: async (args) => {
        calls.versionCreate.push(args);
        return { id: "version-1" };
      },
      findMany: async () => [],
      deleteMany: async () => ({ count: 0 }),
    },
  };

  return {
    context: {
      prisma,
      user,
      ip: "127.0.0.1",
      tokenExpired: false,
    },
    calls,
  };
}

test("GraphQL schema builds without duplicate type or field definitions", () => {
  assert.ok(schema);
});

test("access tokens sign and verify the expected user identity", () => {
  const token = signAccessToken("user-1", "EDITOR");

  assert.deepEqual(verifyAccessToken(token), {
    userId: "user-1",
    role: "EDITOR",
  });
});

test("invalid and expired access tokens are rejected distinctly", () => {
  assert.equal(verifyAccessToken("not-a-jwt"), null);

  const expired = jwt.sign(
    { userId: "user-1", role: "EDITOR", type: "access" },
    "dev-secret",
    { expiresIn: -1 },
  );

  assert.deepEqual(verifyAccessToken(expired), { expired: true });
});

test("refresh token generation returns a raw token and its SHA-256 hash", () => {
  const { raw, hash } = generateRefreshToken();

  assert.ok(raw.length > 0);
  assert.equal(hash, hashRefreshToken(raw));
  assert.notEqual(raw, hash);
});

test("public posts query defaults to published posts", async () => {
  const { context, calls } = createContext();

  const result = await graphql({
    schema,
    source: "{ posts { id } }",
    contextValue: context,
  });

  assert.equal(result.errors, undefined);
  assert.deepEqual(calls.findMany, [{ where: { status: "PUBLISHED" }, orderBy: { createdAt: "desc" }, include: { author: true, heroMedia: true, translations: true } }]);
});

test("unauthenticated users cannot request draft posts", async () => {
  const { context, calls } = createContext();

  const result = await graphql({
    schema,
    source: "{ posts(publishedOnly: false) { id } }",
    contextValue: context,
  });

  assert.match(result.errors?.[0]?.message ?? "", /Unauthorized/i);
  assert.equal(calls.findMany.length, 0);
});

test("unauthenticated users cannot create posts", async () => {
  const { context, calls } = createContext();

  const result = await graphql({
    schema,
    source: 'mutation { createPost(input: { title: "Draft", content: "Body" }) { id } }',
    contextValue: context,
  });

  assert.match(result.errors?.[0]?.message ?? "", /Unauthorized/i);
  assert.equal(calls.create.length, 0);
});

test("an editor cannot update another author's post", async () => {
  const { context, calls } = createContext({
    user: { id: "editor-2", role: "EDITOR" },
    post: {
      id: "post-1",
      authorId: "editor-1",
      title: "Original",
      slug: "original",
      content: "Original body",
      status: "DRAFT",
    },
  });

  const result = await graphql({
    schema,
    source: 'mutation { updatePost(id: "post-1", input: { title: "Changed" }) { id } }',
    contextValue: context,
  });

  assert.match(result.errors?.[0]?.message ?? "", /Forbidden/i);
  assert.equal(calls.update.length, 0);
  assert.equal(calls.versionCreate.length, 0);
});

test("an admin can update another author's post", async () => {
  const { context, calls } = createContext({
    user: { id: "admin-1", role: "ADMIN" },
    post: {
      id: "post-1",
      authorId: "editor-1",
      title: "Original",
      slug: "original",
      content: "Original body",
      status: "DRAFT",
    },
  });

  const result = await graphql({
    schema,
    source: 'mutation { updatePost(id: "post-1", input: { title: "Changed" }) { id title } }',
    contextValue: context,
  });

  assert.equal(result.errors, undefined);
  assert.deepEqual(result.data, { updatePost: { id: "post-1", title: "Changed" } });
  assert.equal(calls.versionCreate.length, 1);
  assert.equal(calls.update.length, 1);
});

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
  assert.equal(result.data?.updatePost?.id, "post-1");
  assert.equal(result.data?.updatePost?.title, "Changed");
  assert.equal(calls.versionCreate.length, 1);
  assert.equal(calls.update.length, 1);
});


import { createServer } from "node:http";
import { validateWebhookUrl } from "../src/webhookUrl.ts";
import { deliverWebhook } from "../src/webhookWorker.ts";

const publicDns = async () => [{ address: "93.184.216.34", family: 4 }];

test("webhook validation permits public HTTPS destinations", async () => {
  const target = await validateWebhookUrl("https://hooks.example.com/events", {
    nodeEnv: "production",
    lookupFn: publicDns,
  });
  assert.equal(target.url.hostname, "hooks.example.com");
  assert.deepEqual(target.addresses, [{ address: "93.184.216.34", family: 4 }]);
});

test("webhook validation rejects HTTP outside local development", async () => {
  await assert.rejects(
    validateWebhookUrl("http://hooks.example.com", {
      nodeEnv: "development",
      lookupFn: publicDns,
    }),
    /HTTPS/,
  );
});

test("webhook validation rejects localhost in production", async () => {
  await assert.rejects(
    validateWebhookUrl("https://localhost/hook", {
      nodeEnv: "production",
      lookupFn: async () => [{ address: "::1", family: 6 }],
    }),
    /Local webhook destinations/,
  );
});

test("webhook validation rejects URL credentials and fragments", async () => {
  await assert.rejects(
    validateWebhookUrl("https://user:pass@hooks.example.com", {
      nodeEnv: "production",
      lookupFn: publicDns,
    }),
    /credentials/,
  );
  await assert.rejects(
    validateWebhookUrl("https://hooks.example.com/path#fragment", {
      nodeEnv: "production",
      lookupFn: publicDns,
    }),
    /fragments/,
  );
});

test("webhook validation rejects private, loopback, link-local and reserved IPv4", async () => {
  for (const address of [
    "10.0.0.5",
    "127.0.0.1",
    "169.254.169.254",
    "172.20.0.1",
    "192.168.1.2",
    "100.100.100.200",
    "168.63.129.16",
    "224.0.0.1",
    "240.0.0.1",
  ]) {
    await assert.rejects(
      validateWebhookUrl(`https://hooks.example.com`, {
        nodeEnv: "production",
        lookupFn: async () => [{ address, family: 4 }],
      }),
      /non-public IP/,
      address,
    );
  }
});

test("webhook validation rejects prohibited IPv6 and IPv4-mapped IPv6", async () => {
  for (const address of [
    "::1",
    "fe80::1",
    "fd00::1",
    "::ffff:127.0.0.1",
    "2001:db8::1",
    "ff02::1",
  ]) {
    await assert.rejects(
      validateWebhookUrl("https://hooks.example.com", {
        nodeEnv: "production",
        lookupFn: async () => [{ address, family: 6 }],
      }),
      /non-public IP/,
      address,
    );
  }
});

test("webhook validation rejects mixed public and private DNS answers", async () => {
  await assert.rejects(
    validateWebhookUrl("https://hooks.example.com", {
      nodeEnv: "production",
      lookupFn: async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "10.0.0.8", family: 4 },
      ],
    }),
    /non-public IP/,
  );
});

test("webhook validation rejects DNS responses with no addresses", async () => {
  await assert.rejects(
    validateWebhookUrl("https://hooks.example.com", {
      nodeEnv: "production",
      lookupFn: async () => [],
    }),
    /did not resolve/,
  );
});

test("development permits HTTP localhost but production does not", async () => {
  const lookupFn = async () => [{ address: "127.0.0.1", family: 4 }];
  const target = await validateWebhookUrl("http://localhost:4001/hook", {
    nodeEnv: "development",
    lookupFn,
  });
  assert.equal(target.localDevelopmentTarget, true);
  await assert.rejects(
    validateWebhookUrl("http://localhost:4001/hook", {
      nodeEnv: "production",
      lookupFn,
    }),
    /HTTPS/,
  );
});

test("webhook delivery pins the validated address and does not follow redirects", async () => {
  let hits = 0;
  const server = createServer((_request, response) => {
    hits += 1;
    response.writeHead(302, { Location: "http://127.0.0.1:1/internal" });
    response.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    const status = await deliverWebhook(
      `http://localhost:${address.port}/hook`,
      { event: "post.published" },
      {
        nodeEnv: "development",
        lookupFn: async () => [{ address: "127.0.0.1", family: 4 }],
      },
    );
    assert.equal(status, 302);
    assert.equal(hits, 1);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

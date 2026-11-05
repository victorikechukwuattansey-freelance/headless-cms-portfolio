import "./sentry.js"; 
import "dotenv/config";
import { createServer } from "node:http";
import { createYoga } from "graphql-yoga";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { typeDefs } from "./schema.js";
import { resolvers } from "./resolvers.js";
import { prisma, createContext } from "./context.js";
import { startScheduler } from "./scheduler.js";
import { GraphQLError } from "graphql";
import { useSentry } from "@envelop/sentry";
import * as Sentry from "@sentry/node";

const schema = makeExecutableSchema({ typeDefs, resolvers });

const yoga = createYoga({
  schema,
  context: createContext,
  graphiql: true,
  plugins: [
    useSentry({
      includeRawResult: false,
      includeExecuteVariables: true,
      skipError: (error) => {
        // Skip UserError (your intentional errors) so they don't flood Sentry[reference:2]
        const original = (error as { originalError?: unknown })?.originalError ?? error;
        return (
          original !== null &&
          typeof original === "object" &&
          "isUserError" in original &&
          (original as { isUserError?: boolean }).isUserError === true
        );
      },
    }),
  ],
  maskedErrors: {
    maskError(error, message, isDev) {
      const original =
        (error as { originalError?: unknown })?.originalError ?? error;

      if (
        original &&
        typeof original === "object" &&
        "isUserError" in original &&
        (original as { isUserError?: boolean }).isUserError === true
      ) {
        const userErr = original as unknown as {
          message: string;
          code?: string;
        };
        return new GraphQLError(userErr.message, {
          extensions: { code: userErr.code ?? "BAD_USER_INPUT" },
        });
      }

      return isDev ? (error as Error) : new GraphQLError(message);
    },
  },
});

const CORS_ORIGIN = process.env.CORS_ORIGIN ?? "*";

const server = createServer((req, res) => {
  const url = req.url || "";

  // CORS headers on every response
  const requestOrigin = req.headers.origin;
  const allowOrigin =
    CORS_ORIGIN === "*"
      ? "*"
      : CORS_ORIGIN.split(",")
          .map((o) => o.trim())
          .includes(requestOrigin ?? "")
        ? requestOrigin!
        : CORS_ORIGIN.split(",")[0].trim();

  res.setHeader("Access-Control-Allow-Origin", allowOrigin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );
  res.setHeader("Access-Control-Max-Age", "86400");
  if (CORS_ORIGIN !== "*") {
    res.setHeader("Vary", "Origin");
  }

  // Preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check
  if (req.method === "GET" && url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        region: process.env.FLY_REGION ?? "local",
      })
    );
    return;
  }

  // Everything else → Yoga
  yoga(req, res);
});

const PORT = Number(process.env.PORT ?? 4000);

server.listen(PORT, () => {
  console.log(`API running at http://localhost:${PORT}/graphql`);
});


// Global handlers to catch crashes outside of GraphQL execution
process.on("unhandledRejection", (reason) => {
  console.error("[fatal] unhandled rejection:", reason);
  Sentry.captureException(reason);
  Sentry.flush(2000).finally(() => process.exit(1)); // Ensure event is sent before exit[reference:3]
});

process.on("uncaughtException", (error) => {
  console.error("[fatal] uncaught exception:", error);
  Sentry.captureException(error);
  Sentry.flush(2000).finally(() => process.exit(1));
});

startScheduler(prisma);
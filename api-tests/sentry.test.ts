import assert from "node:assert/strict";
import { test } from "node:test";
import { sentryGraphqlPluginOptions } from "../src/sentryGraphql.ts";

test("GraphQL Sentry events exclude raw results and execution variables", () => {
  assert.equal(sentryGraphqlPluginOptions.includeRawResult, false);
  assert.equal(sentryGraphqlPluginOptions.includeExecuteVariables, false);
});

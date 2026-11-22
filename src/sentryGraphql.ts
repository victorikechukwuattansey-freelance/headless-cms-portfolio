// Keep GraphQL payload variables out of Sentry events: mutations include credentials.
export const sentryGraphqlPluginOptions = {
  includeRawResult: false,
  includeExecuteVariables: false,
} as const;

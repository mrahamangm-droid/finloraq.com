/**
 * What Sentry may collect — shared by src/instrumentation.ts (server/edge) and
 * src/instrumentation-client.ts (browser). This app handles other companies'
 * financial data, so beyond the error, stack trace and route nothing is
 * collected: no user fields, cookies, headers, query strings, request or
 * response bodies, database query data, or stack-frame local variables (the
 * SDK's defaults collect all of these).
 */
type DataCollection = NonNullable<NonNullable<Parameters<typeof import("@sentry/nextjs").init>[0]>["dataCollection"]>;

export const SENTRY_DATA_COLLECTION: DataCollection = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false,
  databaseQueryData: false,
  queues: false,
  stackFrameVariables: false,
  genAI: { inputs: false, outputs: false },
  graphQL: { document: false, variables: false },
};

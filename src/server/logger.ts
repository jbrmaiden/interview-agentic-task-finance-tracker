import pino from "pino";
import { env } from "#/server/env";
import { getRequestContext } from "#/server/request-context";

//
// Single pino instance writing structured JSON to stdout. Level comes from
// LOG_LEVEL (validated in env.ts). Redaction is a safety net for the "never
// log financial contents" rule — the primary defense is not passing
// descriptions/amounts/receipt data to the logger in the first place.

const rootLogger = pino({
  level: env.observability.logLevel,
  base: undefined,
  redact: {
    paths: [
      "email",
      "*.email",
      "password",
      "*.password",
      "description",
      "*.description",
      "amount",
      "*.amount",
      "amount_minor",
      "*.amount_minor",
    ],
    censor: "[redacted]",
  },
});

/**
 * Logger for the current execution context. Inside a request it carries the
 * request id (and user id once authenticated) so log lines can be correlated
 * with error-tracker events; outside a request it is the bare root logger.
 */
export function getLogger(): pino.Logger {
  const ctx = getRequestContext();
  if (!ctx) return rootLogger;
  return rootLogger.child({
    requestId: ctx.requestId,
    ...(ctx.userId ? { userId: ctx.userId } : {}),
  });
}

export { rootLogger as logger };

/**
 * Class name of an error, safe to log. Never log `err.message` for database
 * errors: Drizzle embeds the failed SQL and its params (amounts, names) there.
 */
export function errorName(err: unknown): string {
  return err instanceof Error ? err.name : "unknown";
}

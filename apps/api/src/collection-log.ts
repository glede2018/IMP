import { AsyncLocalStorage } from "node:async_hooks";
import { Logger } from "@nestjs/common";

type Context = {
  runId?: string;
  stateId?: string;
  accountId?: string;
  platform?: string;
  task?: string;
  phase?: string;
};
const context = new AsyncLocalStorage<Context>();
const logger = new Logger("SocialCollection");

export function withCollectionContext<T>(value: Context, action: () => T): T {
  return context.run({ ...value }, action);
}
export function updateCollectionContext(value: Context) {
  const current = context.getStore();
  if (current) Object.assign(current, value);
}
export function collectionLog(
  level: "log" | "warn" | "error",
  event: string,
  details: Record<string, unknown> = {},
) {
  logger[level](JSON.stringify({ event, ...context.getStore(), ...details }));
}

const safeNames = new Set([
  "Error",
  "TypeError",
  "SyntaxError",
  "TimeoutError",
  "AbortError",
  "AggregateError",
  "PrismaClientKnownRequestError",
  "PrismaClientUnknownRequestError",
  "PrismaClientInitializationError",
  "PrismaClientValidationError",
]);
const safeCodes = new Set([
  "ENOTFOUND",
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "EPIPE",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "ECONNABORTED",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
  "UND_ERR_SOCKET",
  "UND_ERR_ABORTED",
  "UND_ERR_DESTROYED",
  "CERT_HAS_EXPIRED",
  "CERT_NOT_YET_VALID",
  "CERT_SIGNATURE_FAILURE",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "ERR_SSL_WRONG_VERSION_NUMBER",
  "ERR_SSL_UNEXPECTED_EOF_WHILE_READING",
  "ERR_TLS_HANDSHAKE_TIMEOUT",
]);

// 只保留错误类型和固定错误码，绝不输出 message、stack、地址、请求体或上游响应。
export function collectionErrorDetails(error: unknown) {
  const codes = new Set<string>();
  const visited = new Set<unknown>();
  const walk = (value: unknown, depth: number) => {
    if (!value || typeof value !== "object" || depth > 4 || visited.has(value))
      return;
    visited.add(value);
    const e = value as { code?: unknown; cause?: unknown; errors?: unknown };
    if (
      typeof e.code === "string" &&
      (safeCodes.has(e.code) || /^P\d{4}$/.test(e.code))
    )
      codes.add(e.code);
    walk(e.cause, depth + 1);
    if (Array.isArray(e.errors))
      for (const nested of e.errors.slice(0, 8)) walk(nested, depth + 1);
  };
  walk(error, 0);
  const name = error instanceof Error ? error.name : "Error";
  return {
    errorType: safeNames.has(name) ? name : "Error",
    errorCodes: [...codes],
  };
}

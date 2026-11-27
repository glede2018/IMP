import { test } from "node:test";
import assert from "node:assert/strict";
import { Logger } from "@nestjs/common";
import {
  collectionErrorDetails,
  withCollectionContext,
} from "../dist/collection-log.js";
import { OneApiDataProvider } from "../dist/oneapi.js";

test("错误诊断仅输出固定错误码，不泄漏消息、堆栈、凭据和任意错误名称", () => {
  const error = new Error("secret-key https://private.example", {
    cause: new AggregateError(
      [
        Object.assign(new Error("secret-key"), { code: "ENOTFOUND" }),
        Object.assign(new Error("secret-key"), { code: "CERT_HAS_EXPIRED" }),
        Object.assign(new Error("secret-key"), { code: "P2024" }),
        Object.assign(new Error("secret-key"), { code: "secret-key" }),
      ],
      "secret-key",
    ),
  });
  error.name = "secret-key";
  const details = collectionErrorDetails(error);
  assert.deepEqual(details.errorCodes, [
    "ENOTFOUND",
    "CERT_HAS_EXPIRED",
    "P2024",
  ]);
  assert.equal(details.errorType, "Error");
  assert.ok(!JSON.stringify(details).includes("secret-key"));
});

test("请求日志关联账号任务，记录重试、HTTP429和解析错误，隐藏请求及响应内容", async () => {
  const previousKey = process.env.ONEAPI_API_KEY;
  const previousRps = process.env.ONEAPI_RPS;
  process.env.ONEAPI_API_KEY = "secret-key";
  process.env.ONEAPI_RPS = "1000000";
  const fetcher = globalThis.fetch;
  const originals = {
    log: Logger.prototype.log,
    warn: Logger.prototype.warn,
    error: Logger.prototype.error,
  };
  const logs: any[] = [];
  const allLogs: any[] = [];
  for (const level of ["log", "warn", "error"] as const)
    Logger.prototype[level] = function (message: any) {
      const entry = { level, ...JSON.parse(message) };
      logs.push(entry);
      allLogs.push(entry);
    };
  try {
    let attempts = 0;
    globalThis.fetch = async () => {
      if (++attempts < 3)
        throw new TypeError("secret-key", {
          cause: Object.assign(new Error("secret-key"), { code: "ECONNRESET" }),
        });
      return new Response(
        JSON.stringify({ code: 200, data: { ignored: "secret-response" } }),
      );
    };
    await withCollectionContext(
      {
        runId: "run-test",
        accountId: "account-test",
        platform: "douyin",
        task: "videos",
      },
      () =>
        new OneApiDataProvider().request("fetch_user_data", {
          private: "secret-parameter",
        }),
    );
    const failures = logs.filter((l) => l.event === "oneapi.request.failed");
    assert.deepEqual(
      failures.map((l) => l.attempt),
      [1, 2],
    );
    assert.ok(
      failures.every((l) => l.willRetry && l.errorCodes.includes("ECONNRESET")),
    );
    assert.equal(logs.at(-1).event, "oneapi.request.succeeded");
    assert.equal(logs.at(-1).attempt, 3);
    assert.ok(
      logs.every(
        (l) =>
          l.accountId === "account-test" &&
          l.runId === "run-test" &&
          l.task === "videos",
      ),
    );
    assert.equal(new Set(logs.map((l) => l.requestId)).size, 1);
    assert.ok(logs.every((l) => l.queueWaitMs >= 0 && l.rps > 0));
    logs.length = 0;
    globalThis.fetch = async () =>
      new Response("secret-response", { status: 429 });
    await assert.rejects(
      new OneApiDataProvider().request("fetch_user_data", {}),
    );
    assert.equal(logs.at(-1).httpStatus, 429);
    assert.equal(logs.at(-1).state, "rate_limited");
    assert.equal(logs.at(-1).willRetry, false);
    assert.equal(logs.at(-1).level, "error");
    logs.length = 0;
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ code: 301, data: null }));
    await assert.rejects(
      new OneApiDataProvider().request("fetch_user_data", {}),
    );
    assert.equal(
      logs.filter((l) => l.event === "oneapi.request.started").length,
      1,
    );
    assert.equal(logs.at(-1).upstreamCode, 301);
    assert.equal(logs.at(-1).willRetry, false);
    assert.equal(logs.at(-1).state, "quota_exhausted");
    assert.equal(logs.at(-1).level, "error");
    logs.length = 0;
    globalThis.fetch = async () =>
      new Response("secret-response", { status: 200 });
    await assert.rejects(
      new OneApiDataProvider().request("fetch_user_data", {}),
    );
    assert.equal(logs.at(-1).requestPhase, "parse_response");
    assert.equal(logs.at(-1).errorType, "SyntaxError");
    const output = JSON.stringify(allLogs);
    for (const secret of ["secret-key", "secret-response", "secret-parameter"])
      assert.ok(!output.includes(secret));
  } finally {
    globalThis.fetch = fetcher;
    Object.assign(Logger.prototype, originals);
    if (previousKey === undefined) delete process.env.ONEAPI_API_KEY;
    else process.env.ONEAPI_API_KEY = previousKey;
    if (previousRps === undefined) delete process.env.ONEAPI_RPS;
    else process.env.ONEAPI_RPS = previousRps;
  }
});

test("并发账号的请求上下文不互相覆盖", async () => {
  const key = process.env.ONEAPI_API_KEY;
  const rps = process.env.ONEAPI_RPS;
  const fetcher = globalThis.fetch;
  const log = Logger.prototype.log;
  const logs: any[] = [];
  Logger.prototype.log = function (message: any) {
    logs.push(JSON.parse(message));
  };
  process.env.ONEAPI_API_KEY = "secret-key";
  process.env.ONEAPI_RPS = "1000000";
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ code: 200, data: {} }));
  try {
    await Promise.all(
      ["a", "b"].map((accountId) =>
        withCollectionContext({ accountId }, () =>
          new OneApiDataProvider().request(`fetch_user_${accountId}`, {}),
        ),
      ),
    );
    assert.equal(logs.length, 4);
    assert.ok(logs.every((l) => l.endpoint.endsWith(`_${l.accountId}`)));
  } finally {
    globalThis.fetch = fetcher;
    Logger.prototype.log = log;
    if (key === undefined) delete process.env.ONEAPI_API_KEY;
    else process.env.ONEAPI_API_KEY = key;
    if (rps === undefined) delete process.env.ONEAPI_RPS;
    else process.env.ONEAPI_RPS = rps;
  }
});

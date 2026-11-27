import { test } from "node:test";
import assert from "node:assert/strict";
import { createOneApiLimiter, oneApiRps } from "../src/oneapi-rate-limit.js";
import { nextOneApiRetry } from "../dist/oneapi.js";

test("临时失败按1、2、3、5分钟补偿，不跨过下一次北京时间零点", () => {
  const now = new Date("2026-11-27T02:00:00Z");
  for (const [failures, minutes] of [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 5],
    [20, 5],
  ]) {
    assert.equal(
      nextOneApiRetry(failures, now).getTime() - now.getTime(),
      minutes * 60000,
    );
  }
  assert.equal(
    nextOneApiRetry(3, new Date("2026-11-27T15:59:00Z")).toISOString(),
    "2026-11-27T16:00:00.000Z",
  );
});

test("并发入口按账户 RPS 排队，重试同样占用名额", async () => {
  const previous = process.env.ONEAPI_RPS;
  process.env.ONEAPI_RPS = "10";
  let now = 0;
  const wait = createOneApiLimiter({
    now: () => now,
    wait: async (ms) => {
      now += ms;
    },
  });
  try {
    const slots = await Promise.all(Array.from({ length: 12 }, () => wait()));
    assert.deepEqual(
      slots.map((s) => s.grantedAt),
      Array.from({ length: 12 }, (_, i) => i * 100),
    );
    assert.equal((await wait()).grantedAt, 1200);
    assert.equal(slots[11].queueWaitMs, 1100);
  } finally {
    if (previous === undefined) delete process.env.ONEAPI_RPS;
    else process.env.ONEAPI_RPS = previous;
  }
});

test("定时器提前唤醒也不超出 RPS，非法配置回退至10", async () => {
  const previous = process.env.ONEAPI_RPS;
  process.env.ONEAPI_RPS = "2";
  let now = 0;
  let early = true;
  const wait = createOneApiLimiter({
    now: () => now,
    wait: async (ms) => {
      now += early ? ms / 2 : ms;
      early = false;
    },
  });
  try {
    await wait();
    assert.equal((await wait()).grantedAt, 500);
    for (const invalid of ["", "0", "-1", "oops", "Infinity"]) {
      process.env.ONEAPI_RPS = invalid;
      assert.equal(oneApiRps(), 10);
    }
    delete process.env.ONEAPI_RPS;
    assert.equal(oneApiRps(), 10);
  } finally {
    if (previous === undefined) delete process.env.ONEAPI_RPS;
    else process.env.ONEAPI_RPS = previous;
  }
});

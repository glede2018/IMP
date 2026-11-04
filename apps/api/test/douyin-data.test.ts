import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DataProviderError,
  DouyinDataProvider,
  countValue,
  extractTags,
  matchTrackingTags,
  normalizeTrackingTag,
  parseVideo,
  sampleDelta,
} from "../src/douyin-data-provider.js";
import { dateRange } from "../src/douyin-analytics.js";
test("tracking tags are normalized and matched exactly, ambiguous templates are never guessed", () => {
  assert.equal(normalizeTrackingTag(" ＃新品_V1 "), "新品_v1");
  const tags = extractTags({
    title: "今天 #新品_V1，#新品_V10",
    text_extra: [{ hashtag_name: "独立标签" }],
  });
  assert.deepEqual(tags, ["独立标签", "新品_v1", "新品_v10"]);
  assert.equal(
    matchTrackingTags(["新品_v10"], [{ id: "1", tag: "新品_v1" }]).matchStatus,
    "unmatched",
  );
  assert.deepEqual(
    matchTrackingTags(tags, [
      { id: "1", tag: "新品_v1" },
      { id: "2", tag: "新品_v10" },
    ]),
    { bindingId: null, matchStatus: "conflict" },
  );
  assert.equal(
    matchTrackingTags(tags, [{ id: "1", tag: "新品_v1" }]).bindingId,
    "1",
  );
  assert.throws(() => normalizeTrackingTag("两个 标签"));
});
test("multiple content tags do not claim a template; multiple identity tags for one template version count once", () => {
  const bindings = [
    { id: "topic", tag: "新品", templateId: null, version: "" },
    { id: "a", tag: "模板_a", templateId: "template-a", version: "v1" },
    { id: "b", tag: "模板_a_别名", templateId: "template-a", version: "v1" },
    { id: "c", tag: "模板_b", templateId: "template-b", version: "v1" },
    {
      id: "disabled",
      tag: "旧tag",
      templateId: "template-b",
      version: "v1",
      active: false,
    },
  ];
  assert.deepEqual(matchTrackingTags(["新品", "探店"], bindings), {
    bindingId: null,
    matchStatus: "unmatched",
  });
  assert.deepEqual(
    matchTrackingTags(["新品", "模板_a", "模板_a_别名", "旧tag"], bindings),
    { bindingId: "a", matchStatus: "matched" },
  );
  assert.deepEqual(matchTrackingTags(["新品", "模板_a", "模板_b"], bindings), {
    bindingId: null,
    matchStatus: "conflict",
  });
});
test("missing counts and absent/private video metadata do not become fake zeros", () => {
  assert.equal(countValue("3000000000"), 3000000000n);
  for (const x of [
    null,
    undefined,
    -1,
    "",
    NaN,
    1.2,
    Number.MAX_SAFE_INTEGER + 1,
  ])
    assert.throws(() => countValue(x));
  assert.throws(() =>
    parseVideo({ item_id: "private", title: "private", create_time: 0 }),
  );
  const v = parseVideo({
    item_id: "@opaque+=",
    title: "test #tag",
    create_time: 1800000000,
  });
  assert.equal(v.metrics, null);
  assert.deepEqual(v.tags, ["tag"]);
});
test("snapshot increments require a baseline and an observation in the selected period; corrections remain negative", () => {
  const samples = [
    { capturedAt: new Date("2026-11-01T15:00:00Z"), n: 20n },
    { capturedAt: new Date("2026-11-02T02:00:00Z"), n: 15n },
  ];
  const start = new Date("2026-11-01T16:00:00Z"),
    end = new Date("2026-11-02T16:00:00Z");
  assert.equal(
    sampleDelta(samples, start, end, (s) => s.n),
    -5,
  );
  assert.equal(
    sampleDelta(samples.slice(1), start, end, (s) => s.n),
    null,
  );
  assert.equal(
    sampleDelta(samples.slice(0, 1), start, end, (s) => s.n),
    null,
  );
  assert.equal(
    dateRange({ start: "2026-11-01", end: "2026-11-02" }).first.toISOString(),
    "2026-10-31T16:00:00.000Z",
  );
  assert.throws(() => dateRange({ start: "2026-02-30", end: "2026-03-01" }));
  assert.throws(() => dateRange({ start: "2026-01-01", end: "2026-03-01" }));
});
test("provider uses token headers, encodes opaque IDs and rejects redirects, withdrawn capability and rate limits without leaking secrets", async () => {
  const oldFetch = globalThis.fetch;
  const calls: { url: string; init: RequestInit }[] = [];
  let payload: unknown = {
    data: { fans_data: { all_fans_num: 1234 }, error_code: 0 },
  };
  globalThis.fetch = (async (input: unknown, init: RequestInit) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify(payload));
  }) as typeof fetch;
  try {
    const p = new DouyinDataProvider();
    assert.equal(await p.fans("secret-token", "opaque +/= id"), 1234n);
    assert.ok(calls[0].url.includes("open_id=opaque+%2B%2F%3D+id"));
    assert.equal(
      (calls[0].init.headers as Record<string, string>)["access-token"],
      "secret-token",
    );
    assert.equal(calls[0].init.redirect, "error");
    assert.ok(!calls[0].url.includes("secret-token"));
    payload = { data: { error_code: 28001056, description: "secret-token" } };
    await assert.rejects(
      p.fans("secret-token", "id"),
      (e: unknown) =>
        e instanceof DataProviderError &&
        e.state === "unsupported" &&
        !e.message.includes("secret-token"),
    );
    assert.equal(calls.length, 2);
    payload = { data: { error_code: 28001018 } };
    await assert.rejects(
      p.fans("secret-token", "id"),
      (e: unknown) =>
        e instanceof DataProviderError && e.state === "permission_required",
    );
    payload = { data: { fans_data: null, error_code: 0 } };
    await assert.rejects(
      p.fans("secret-token", "id"),
      (e: unknown) =>
        e instanceof DataProviderError && e.state === "awaiting_data",
    );
    await assert.rejects(p.transport("/evil", "secret-token", {}));
  } finally {
    globalThis.fetch = oldFetch;
  }
});
test("cursor loops are rejected and missing detail metrics are not fabricated", async () => {
  const p = new DouyinDataProvider();
  let count = 0;
  p.transport = async () =>
    ++count % 2
      ? {
          list: [{ item_id: "id", title: "t", create_time: 1800000000 }],
          has_more: true,
          cursor: 0,
        }
      : { list: [] };
  await assert.rejects(
    p.videos("token", "id", "0"),
    (e: unknown) =>
      e instanceof DataProviderError && e.state === "invalid_response",
  );
  p.transport = async (path) =>
    path.endsWith("video_list/")
      ? {
          list: [{ item_id: "id", title: "t", create_time: 1800000000 }],
          has_more: false,
          cursor: 0,
        }
      : { list: [] };
  assert.equal((await p.videos("token", "id", "0")).videos[0].metrics, null);
});

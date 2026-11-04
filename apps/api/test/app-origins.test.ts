import { test } from "node:test";
import assert from "node:assert/strict";
import { appOrigins, validRequestOrigin } from "../src/app-origins.js";

test("额外来源使用明确白名单，不改变正式域名", () => {
  assert.deepEqual(
    appOrigins({
      APP_ORIGIN: "https://www.yupinxuanai.com",
      APP_ALLOWED_ORIGINS:
        "http://localhost:8080, https://www.yupinxuanai.com/",
    }),
    ["https://www.yupinxuanai.com", "http://localhost:8080"],
  );
  for (const origin of [
    "*",
    "null",
    "https://example.com/path",
    "https://user:pass@example.com",
    "https://example.com?x=1",
  ])
    assert.throws(() => appOrigins({ APP_ORIGIN: origin }));
});

test("本地导入请求允许通过；恶意来源、伪造Host及缺失请求头仍被拒绝", () => {
  const previous = { ...process.env };
  process.env.APP_ORIGIN = "https://www.yupinxuanai.com";
  process.env.APP_ALLOWED_ORIGINS = "http://localhost:8080";
  const request = (origin?: string, marker = "1") =>
    ({
      get: (name: string) =>
        ({ Origin: origin, "X-IMP-Request": marker, Host: "localhost:8080" })[
          name
        ],
    }) as any;
  try {
    assert.equal(validRequestOrigin(request("http://localhost:8080")), true);
    assert.equal(
      validRequestOrigin(request("https://www.yupinxuanai.com")),
      true,
    );
    assert.equal(
      validRequestOrigin(request("http://localhost:8080.evil.com")),
      false,
    );
    assert.equal(validRequestOrigin(request("https://evil.com")), false);
    assert.equal(validRequestOrigin(request()), false);
    assert.equal(
      validRequestOrigin(request("http://localhost:8080", "")),
      false,
    );
  } finally {
    process.env = previous;
  }
});

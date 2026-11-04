import { test } from "node:test";
import assert from "node:assert/strict";
import { trustedProxyRanges } from "../src/proxy-config.js";

test("可信代理仅接受明确地址或网段，拒绝无条件信任公网", () => {
  assert.deepEqual(trustedProxyRanges({}), ["loopback"]);
  assert.deepEqual(
    trustedProxyRanges({
      TRUSTED_PROXY_CIDRS: "loopback,uniquelocal,10.2.0.0/16,2001:db8::1/128",
    }),
    ["loopback", "uniquelocal", "10.2.0.0/16", "2001:db8::1/128"],
  );
  assert.equal(trustedProxyRanges({ TRUSTED_PROXY_CIDRS: "false" }), false);
  for (const value of [
    "true",
    "1",
    "0.0.0.0/0",
    "::/0",
    "10.0.0.0/33",
    "loopback,",
    "example.com",
  ]) {
    assert.throws(
      () => trustedProxyRanges({ TRUSTED_PROXY_CIDRS: value }),
      /TRUSTED_PROXY_CIDRS/,
    );
  }
});

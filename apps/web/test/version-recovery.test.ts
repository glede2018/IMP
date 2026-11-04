import { test } from "node:test";
import assert from "node:assert/strict";
import { recoverVersion } from "../src/services/version-recovery.ts";

test("旧分包加载失败可刷新恢复，连续失败不循环刷新", () => {
  let saved: string | null = null;
  let reloads = 0;
  const storage = {
    getItem: () => saved,
    setItem: (_key: string, value: string) => { saved = value; },
  };
  const reload = () => { reloads++; };
  assert.equal(recoverVersion(storage, reload, 100000), true);
  assert.equal(recoverVersion(storage, reload, 100001), false);
  assert.equal(reloads, 1);
  assert.equal(recoverVersion(storage, reload, 160001), true);
  assert.equal(reloads, 2);
});

test("会话存储不可用时不自动刷新", () => {
  const storage = {
    getItem: () => { throw new Error("存储被禁用"); },
    setItem: () => {},
  };
  assert.equal(recoverVersion(storage, () => assert.fail("不应刷新")), false);
});

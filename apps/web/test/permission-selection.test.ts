import { test } from "node:test";
import assert from "node:assert/strict";
import { selectPermission } from "../src/services/permission-selection.ts";

test("管理与审核自动带上查看，撤销查看同步撤销该模块操作", () => {
  assert.deepEqual(selectPermission([], "templates:create", true), [
    "templates",
    "template-catalog",
    "templates:create",
  ]);
  assert.deepEqual(selectPermission([], "accounts:write", true), [
    "accounts",
    "accounts:write",
  ]);
  assert.deepEqual(selectPermission(["works"], "works:review", true), [
    "works",
    "works:review",
  ]);
  assert.deepEqual(
    selectPermission(
      ["works", "works:write", "works:review", "assets"],
      "works",
      false,
    ),
    ["assets"],
  );
  assert.deepEqual(
    selectPermission(["accounts", "accounts:write"], "accounts:write", false),
    ["accounts"],
  );
  assert.deepEqual(
    selectPermission(["accounts", "accounts:write"], "accounts:write", true),
    ["accounts", "accounts:write"],
  );
});

test("模板列表和模板市场独立配置，取消列表查看会取消添加模板", () => {
  assert.deepEqual(selectPermission([], "template-catalog", true), [
    "template-catalog",
  ]);
  assert.deepEqual(
    selectPermission(
      ["templates", "template-catalog", "templates:create", "templates:write"],
      "template-catalog",
      false,
    ),
    ["templates", "templates:write"],
  );
});

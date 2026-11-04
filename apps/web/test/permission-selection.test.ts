import { test } from "node:test";
import assert from "node:assert/strict";
import { selectPermission } from "../src/services/permission-selection.ts";

test("管理与审核自动带上查看，撤销查看同步撤销该模块操作", () => {
  assert.deepEqual(selectPermission([], "templates:create", true), [
    "templates",
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

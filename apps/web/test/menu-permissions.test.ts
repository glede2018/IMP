import { test } from "node:test";
import assert from "node:assert/strict";
import { canAccess, menuKey } from "../src/services/permissions.ts";
import type { UserInfo } from "../src/types";

test("模板列表与市场使用各自菜单权限，管理员仍可访问两个页面", () => {
  assert.equal(menuKey("/template-catalog"), "template-catalog");
  assert.equal(menuKey("/templates"), "templates");
  for (const [permissions, catalog, market] of [
    [["template-catalog"], true, false],
    [["templates"], false, true],
    [["templates:create"], false, false],
    [["*"], true, true],
  ] as const) {
    const user = { permissions: [...permissions] } as UserInfo;
    assert.equal(canAccess(user, "/template-catalog"), catalog);
    assert.equal(canAccess(user, "/templates"), market);
  }
});

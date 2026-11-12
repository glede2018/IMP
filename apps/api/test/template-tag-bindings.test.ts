import { test } from "node:test";
import assert from "node:assert/strict";
import {
  matchVideoTags,
  videoTagBinding,
} from "../src/template-tag-bindings.js";
const binding = (
  id: string,
  tag: string,
  templateId: string,
  version = "v1",
) => ({
  id,
  tag,
  templateId,
  version,
  active: true,
  deletedAt: null,
  source: "managed" as const,
});
test("多个所选标签命中同一模板只关联一次，重复话题不重复统计", () => {
  const match = matchVideoTags(["新品", "探店", "新品"], [
    binding("a", "新品", "t1"),
    binding("b", "探店", "t1"),
  ] as any);
  assert.deepEqual(match, {
    matchStatus: "matched",
    bindingId: null,
    templateTagBindingId: "a",
  });
});
test("共享标签命中多个模板或版本时不猜测归属", () => {
  for (const other of [
    binding("b", "新品", "t2"),
    binding("b", "新品", "t1", "v2"),
  ])
    assert.deepEqual(
      matchVideoTags(["新品"], [binding("a", "新品", "t1"), other] as any),
      { matchStatus: "conflict", bindingId: null, templateTagBindingId: null },
    );
});
test("历史关联兼容，停用和未选择的话题不参与新关联", () => {
  assert.deepEqual(
    matchVideoTags(["旧模板"], [
      { ...binding("old", "旧模板", "t1"), source: "legacy" },
    ] as any),
    { matchStatus: "matched", bindingId: "old", templateTagBindingId: null },
  );
  assert.deepEqual(
    matchVideoTags(["新品"], [
      { ...binding("a", "新品", "t1"), active: false },
    ] as any),
    { matchStatus: "unmatched", bindingId: null, templateTagBindingId: null },
  );
  assert.equal(
    videoTagBinding({
      binding: null,
      templateTagBinding: {
        id: "b",
        templateId: "t1",
        version: "v1",
        titleSnapshot: "模板",
        tag: { tag: "新品", active: true, deletedAt: null },
      },
    })?.tag,
    "新品",
  );
});

test("旧视频携带明确的系统标签时，通用话题不覆盖历史归属", () => {
  assert.deepEqual(
    matchVideoTags(["imp_old_v1", "新品"], [
      {
        ...binding("old", "imp_old_v1", "t1"),
        source: "legacy",
        systemGenerated: true,
      },
      binding("shared-a", "新品", "t1"),
      binding("shared-b", "新品", "t2"),
    ] as any),
    { matchStatus: "matched", bindingId: "old", templateTagBindingId: null },
  );
});

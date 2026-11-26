import { test } from "node:test";
import assert from "node:assert/strict";
import {
  productViewPayload,
  PRODUCT_VIEW_POSITIVE,
  PRODUCT_VIEW_NEGATIVE,
  PERSON_VIEW_POSITIVE,
  PERSON_VIEW_NEGATIVE,
} from "../src/product-views.js";
const model = () => ({
  inputs: [
    { id: "images", type: "image", multiple: true, required: true },
    { id: "prompt", type: "text", required: true },
  ],
  outputs: [{ type: "image" }],
  fields: [
    { key: "images", maxItems: 4 },
    { key: "prompt" },
    { key: "num_images", default: 1 },
  ],
});
test("产品视图完整传入多张参考图，固定正负提示词和单张输出", () => {
  const result = productViewPayload(model(), ["a", "b", "c"], {
    num_images: 4,
  });
  assert.deepEqual(result.inputs.images, [
    { id: "a" },
    { id: "b" },
    { id: "c" },
  ]);
  assert.ok(result.inputs.prompt.includes(PRODUCT_VIEW_POSITIVE));
  assert.ok(result.inputs.prompt.includes(PRODUCT_VIEW_NEGATIVE));
  assert.equal(result.parameters.num_images, 1);
  assert.throws(
    () => productViewPayload(model(), ["a", "b", "c", "d", "e"], {}),
    /最多支持 4 张/,
  );
  assert.throws(
    () =>
      productViewPayload(
        { ...model(), inputs: [{ id: "image", type: "image" }] },
        ["a", "b"],
        {},
      ),
    /多图生成模型/,
  );
  assert.throws(
    () => productViewPayload(model(), ["a", "b"], { prompt: "替换提示词" }),
    /参数无效/,
  );
});
test("有独立负面参数时使用独立参数，模型必填参数必须提供", () => {
  const m: any = model();
  m.fields.push(
    { key: "negative_prompt" },
    { key: "strength", label: "相似度", required: true },
  );
  assert.throws(() => productViewPayload(m, ["a", "b"], {}), /相似度/);
  const result = productViewPayload(m, ["a", "b"], {
    strength: 0.8,
    negative_prompt: "不应覆盖",
  });
  assert.equal(result.inputs.prompt, PRODUCT_VIEW_POSITIVE);
  assert.equal(result.parameters.negative_prompt, PRODUCT_VIEW_NEGATIVE);
});

test("人物固定四视图提示词支持单张参考图端口，无音色输入", () => {
  const m = {
    ...model(),
    inputs: [
      { id: "image", type: "image", required: true },
      { id: "prompt", type: "text", required: true },
    ],
  };
  const result = productViewPayload(m, ["person-ref"], {}, "person");
  assert.deepEqual(result.inputs.image, { id: "person-ref" });
  assert.ok(result.inputs.prompt.includes(PERSON_VIEW_POSITIVE));
  assert.ok(result.inputs.prompt.includes(PERSON_VIEW_NEGATIVE));
  assert.equal(result.inputs.prompt.includes(PRODUCT_VIEW_POSITIVE), false);
  assert.throws(
    () => productViewPayload(m, ["a", "b"], {}, "person"),
    /当前参考图数量/,
  );
});

test("人物支持完整传入10张参考图，超过10张或模型上限则拒绝", () => {
  const m = model();
  m.fields[0].maxItems = 10;
  const ids = Array.from({ length: 10 }, (_, i) => `person-${i}`);
  const payload = productViewPayload(m, ids, {}, "person");
  assert.deepEqual(
    payload.inputs.images,
    ids.map((id) => ({ id })),
  );
  assert.ok(payload.inputs.prompt.includes(PERSON_VIEW_POSITIVE));
  assert.throws(
    () => productViewPayload(m, [...ids, "extra"], {}, "person"),
    /最多支持 10 张/,
  );
});

test("人物和产品按实际图片数量区分单图与多图，禁止静默丢图", () => {
  const single = {
    ...model(),
    inputs: [
      { id: "image", type: "image", required: true },
      { id: "prompt", type: "text", required: true },
    ],
    fields: [{ key: "image" }, { key: "prompt" }],
  };
  for (const type of ["person", "product"]) {
    assert.deepEqual(productViewPayload(single, ["a"], {}, type).inputs.image, {
      id: "a",
    });
    assert.throws(
      () => productViewPayload(model(), ["a"], {}, type),
      /单图生成模型/,
    );
    assert.throws(
      () => productViewPayload(single, ["a", "b"], {}, type),
      /多图生成模型/,
    );
    for (const count of [2, 3, 4]) {
      const ids = Array.from({ length: count }, (_, i) => `ref-${i}`);
      assert.deepEqual(
        productViewPayload(model(), ids, {}, type).inputs.images,
        ids.map((id) => ({ id })),
      );
    }
  }
});

test("商品和人物使用模型默认参数，兼容 defaultValue 并保留 0 和 false", () => {
  const m = {
    ...model(),
    fields: [
      ...model().fields,
      { key: "size", required: true, default: "small", defaultValue: "large" },
      { key: "seed", required: true, defaultValue: 0 },
      { key: "watermark", required: true, defaultValue: false },
      { key: "quality", required: true, default: "high" },
    ],
  };
  for (const type of ["product", "person"]) {
    const payload = productViewPayload(m, ["a", "b"], {}, type);
    assert.deepEqual(payload.parameters, {
      num_images: 1,
      size: "large",
      seed: 0,
      watermark: false,
      quality: "high",
    });
  }
});

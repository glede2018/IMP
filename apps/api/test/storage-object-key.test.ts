import { test } from "node:test";
import assert from "node:assert/strict";
import { storageObjectKey } from "../src/storage-object-key.js";

test("所有业务分类统一日期目录，日期按北京时间并保留租户和真实格式后缀", () => {
  const at = new Date("2026-11-04T16:01:00Z");
  for (const [type, directory, mime, ext] of [
    ["product", "products", "image/png", "png"],
    ["person", "persons", "image/jpeg", "jpg"],
    ["portrait", "persons", "image/webp", "webp"],
    ["template", "templates", "image/png", "png"],
    ["video", "videos", "video/mp4", "mp4"],
    ["voice", "voices", "audio/mpeg", "mp3"],
    ["copy", "texts", "text/plain", "txt"],
    ["image", "images", "image/png", "png"],
  ]) {
    assert.match(
      storageObjectKey("tenant-a", type, mime, at),
      new RegExp(`^${directory}/2026/1105/tenant-a/[0-9a-f-]{36}\\.${ext}$`),
    );
  }
  assert.match(
    storageObjectKey(
      "tenant-a",
      "product",
      "image/png",
      new Date("2026-12-31T16:01:00Z"),
    ),
    /^products\/2027\/0101\//,
  );
  assert.notEqual(
    storageObjectKey("tenant-a", "product", "image/png", at),
    storageObjectKey("tenant-a", "product", "image/png", at),
  );
  for (const type of ["../products", "__proto__", "constructor", "typo"])
    assert.throws(() => storageObjectKey("tenant-a", type, "image/png"));
  assert.throws(() => storageObjectKey("../tenant", "product", "image/png"));
  assert.throws(() =>
    storageObjectKey("tenant-a", "product", "application/javascript"),
  );
});

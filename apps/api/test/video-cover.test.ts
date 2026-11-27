import { test } from "node:test";
import assert from "node:assert/strict";
import { videoCoverUrl } from "../src/video-cover.js";

test("小红书伪装为 WebP 的 HEIF 封面转 JPEG，保留签名、帧号和其他参数", () => {
  const original =
    "https://sns-i14-ae.rednotecdn.com/frame/a.webp?imageView2/2/w/5000/h/5000/format/heif/q/56&redImage/frame/0&sign=test%2Bvalue&t=1";
  const compatible = videoCoverUrl(original)!;
  assert.equal(compatible, original.replace("/format/heif/", "/format/jpg/"));
  assert.equal(videoCoverUrl(compatible), compatible);
  assert.equal(
    videoCoverUrl(
      "https://sns.xhscdn.com/a.webp?imageView2%2F2%2Fformat%2Fheic",
    ),
    "https://sns.xhscdn.com/a.webp?imageView2%2F2%2Fformat%2Fjpg",
  );
  for (const hostname of ["img.example", "rednotecdn.com.evil.test"]) {
    const url = `https://${hostname}/a.webp?imageView2/2/format/heif`;
    assert.equal(videoCoverUrl(url), url);
  }
});

import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import OSS from "ali-oss";
import { S3Client } from "@aws-sdk/client-s3";
import { Storage } from "../dist/storage.js";
import { storageConfig } from "../storage-config.mjs";

const env = {
  STORAGE_PROVIDER: "oss",
  OSS_REGION: "oss-cn-hangzhou",
  OSS_BUCKET: "imp-test-bucket",
  OSS_ACCESS_KEY_ID: "test-id",
  OSS_ACCESS_KEY_SECRET: "test-secret",
  S3_ENDPOINT: "http://localhost:9000",
  S3_BUCKET: "legacy-bucket",
  S3_ACCESS_KEY: "legacy-id",
  S3_SECRET_KEY: "legacy-secret",
};
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+nm1sAAAAASUVORK5CYII=",
  "base64",
);
const file = {
  buffer: png,
  size: png.length,
  mimetype: "image/png",
} as Express.Multer.File;

test("storage config validates provider, endpoint and selected credentials", () => {
  const config = storageConfig(env);
  assert.equal(config.provider, "oss");
  assert.equal(
    storageConfig({ ...env, STORAGE_PROVIDER: "s3", OSS_ACCESS_KEY_SECRET: "" })
      .provider,
    "s3",
  );
  assert.throws(
    () => storageConfig({ ...env, STORAGE_PROVIDER: "typo" }),
    /STORAGE_PROVIDER/,
  );
  assert.throws(
    () => storageConfig({ ...env, OSS_ACCESS_KEY_SECRET: "" }),
    /OSS_ACCESS_KEY_SECRET/,
  );
  assert.throws(
    () => storageConfig({ ...env, OSS_REGION: "cn-hangzhou" }),
    /OSS_REGION/,
  );
  for (const endpoint of [
    "http://oss-cn-hangzhou.aliyuncs.com",
    "https://bucket.oss-cn-hangzhou.aliyuncs.com",
    "https://example.com",
    "https://oss-cn-hangzhou.aliyuncs.com/path",
  ]) {
    assert.throws(
      () => storageConfig({ ...env, OSS_ENDPOINT: endpoint }),
      /OSS_ENDPOINT/,
    );
  }
  assert.equal(
    storageConfig({
      ...env,
      OSS_ENDPOINT: "https://oss-cn-hangzhou-internal.aliyuncs.com",
    }).provider,
    "oss",
  );
  if (config.provider === "oss") {
    assert.equal(config.options.secure, true);
    assert.equal(config.options.authorizationV4, true);
  }
});

test("OSS: bucket ACL inheritance, range streaming, historical routing and safe errors", async (t) => {
  const originalEnv = { ...process.env };
  Object.assign(process.env, env);
  const puts: unknown[][] = [],
    deletes: string[] = [],
    requests: any[] = [],
    legacy: any[] = [];
  let getError: unknown;
  const body = Readable.from(Buffer.from("bytes"));
  t.mock.method(OSS.prototype, "put", async (...args: unknown[]) => {
    puts.push(args);
    return {};
  });
  t.mock.method(OSS.prototype, "delete", async (key: string) => {
    deletes.push(key);
    return {};
  });
  t.mock.method(
    OSS.prototype,
    "getStream",
    async (key: string, options: unknown) => {
      requests.push({ key, options });
      if (getError) throw getError;
      return {
        stream: body,
        res: {
          headers: { "content-length": "5", "content-range": "bytes 0-4/10" },
        },
      };
    },
  );
  t.mock.method(S3Client.prototype, "send", async (command: any) => {
    legacy.push(command.input);
    return { Body: body, ContentLength: 5 };
  });
  const storage = new Storage();
  try {
    const uploaded = await storage.upload(file, "tenant-a", "image");
    assert.match(
      uploaded.objectKey,
      /^oss:\/\/imp-test-bucket\/images\/\d{4}\/\d{4}\/tenant-a\//,
    );
    assert.equal(uploaded.mimeType, "image/png");
    assert.equal(uploaded.size, png.length);
    const [key, bytes, options] = puts[0] as [string, Buffer, any];
    assert.equal(key, uploaded.objectKey.replace("oss://imp-test-bucket/", ""));
    assert.deepEqual(bytes, png);
    assert.equal(options.headers["x-oss-object-acl"], "default");
    const result = await storage.read(uploaded.objectKey, "bytes=0-4");
    assert.equal(result.Body, body);
    assert.equal(result.ContentLength, 5);
    assert.equal(result.ContentRange, "bytes 0-4/10");
    assert.deepEqual(requests[0], {
      key,
      options: { headers: { Range: "bytes=0-4" } },
    });
    await storage.remove(uploaded.objectKey);
    assert.deepEqual(deletes, [key]);
    await storage.read("tenant-a/old-file", "bytes=-5");
    await storage.remove("tenant-a/old-file");
    assert.deepEqual(legacy, [
      { Bucket: "legacy-bucket", Key: "tenant-a/old-file", Range: "bytes=-5" },
      { Bucket: "legacy-bucket", Key: "tenant-a/old-file" },
    ]);
    process.env.STORAGE_PROVIDER = "s3";
    const reverted = new Storage();
    try {
      await reverted.read(uploaded.objectKey);
      assert.match(
        (await reverted.upload(file, "tenant-b", "image")).objectKey,
        /^images\/\d{4}\/\d{4}\/tenant-b\//,
      );
    } finally {
      reverted.onModuleDestroy();
    }
    await assert.rejects(storage.read("oss://other-bucket/key"), /Bucket/);
    for (const code of ["NoSuchKey", "InvalidRange"]) {
      getError = Object.assign(new Error("signed-request-secret"), { code });
      await assert.rejects(storage.read(uploaded.objectKey), {
        name: code,
        message: code,
      });
    }
    getError = Object.assign(new Error("signed-request-secret"), {
      code: "AccessDenied",
    });
    await assert.rejects(storage.read(uploaded.objectKey), (error: any) => {
      assert.equal(error.getStatus(), 503);
      assert.doesNotMatch(error.stack, /signed-request-secret/);
      return true;
    });
    await assert.rejects(
      storage.upload(file, "tenant-a", "voice"),
      /分类不匹配/,
    );
    assert.equal(puts.length, 1);
  } finally {
    storage.onModuleDestroy();
    process.env = originalEnv;
  }
});

test("公共读预览使用稳定直链，下载即时签名，历史素材仍使用原接口", async () => {
  const originalEnv = { ...process.env };
  Object.assign(process.env, env, {
    OSS_ACCESS_DOMAIN: "https://static.yupinxuanai.com",
  });
  const storage = new Storage();
  try {
    const asset = {
      id: "asset-1",
      objectKey: "oss://imp-test-bucket/tenant-a/key",
      name: "作品测试",
      mimeType: "video/mp4",
    };
    const links = await storage.links(asset);
    assert.equal(links.downloadUrl, "/api/v1/assets/asset-1/file?download=1");
    const preview = new URL(links.preview);
    const download = new URL((await storage.downloadLink(asset))!);
    assert.equal(preview.origin, "https://static.yupinxuanai.com");
    assert.equal(preview.pathname, "/tenant-a/key");
    assert.equal(preview.search, "");
    assert.deepEqual(await storage.links(asset), links);
    assert.equal(download.searchParams.get("x-oss-expires"), "3600");
    assert.ok(download.searchParams.has("x-oss-signature"));
    const special = await storage.links({
      ...asset,
      objectKey: "oss://imp-test-bucket/tenant-a/图 片#1?%.png",
    });
    assert.equal(
      new URL(special.preview).pathname,
      "/tenant-a/%E5%9B%BE%20%E7%89%87%231%3F%25.png",
    );
    assert.match(
      download.searchParams.get("response-content-disposition")!,
      /attachment; filename\*=UTF-8''/,
    );
    assert.ok(
      decodeURIComponent(
        download.searchParams.get("response-content-disposition")!,
      ).endsWith("作品测试.mp4"),
    );
    assert.equal(links.preview.includes(env.OSS_ACCESS_KEY_SECRET), false);
    assert.deepEqual(
      await storage.links({ ...asset, objectKey: "tenant-a/old-file" }),
      {
        preview: "/api/v1/assets/asset-1/file",
        downloadUrl: "/api/v1/assets/asset-1/file?download=1",
      },
    );
    await assert.rejects(
      storage.links({ ...asset, objectKey: "oss://other-bucket/key" }),
      /Bucket/,
    );
    delete process.env.OSS_ACCESS_DOMAIN;
    assert.equal(
      (await storage.links(asset)).preview,
      "/api/v1/assets/asset-1/file",
    );
    for (const domain of [
      "http://static.yupinxuanai.com",
      "https://static.yupinxuanai.com/path",
      "https://user:pass@static.yupinxuanai.com",
      "https://static.yupinxuanai.com?x=1",
    ]) {
      assert.throws(
        () => storageConfig({ ...env, OSS_ACCESS_DOMAIN: domain }),
        /OSS_ACCESS_DOMAIN/,
      );
    }
  } finally {
    storage.onModuleDestroy();
    process.env = originalEnv;
  }
});

test("产品、人物与模板封面入口共用 OSS 路径规则，不依赖原文件名", async (t) => {
  const previous = { ...process.env };
  Object.assign(process.env, env);
  const keys: string[] = [];
  t.mock.method(OSS.prototype, "put", async (key: string) => {
    keys.push(key);
    return {};
  });
  const storage = new Storage();
  try {
    for (const [purpose, directory] of [
      ["product", "products"],
      ["person", "persons"],
      ["template", "templates"],
    ] as const) {
      const stored = await storage.upload(
        { ...file, originalname: "不可信名称.exe" },
        "tenant-a",
        "image",
        purpose,
      );
      assert.match(
        stored.objectKey,
        new RegExp(
          `^oss://imp-test-bucket/${directory}/\\d{4}/\\d{4}/tenant-a/[0-9a-f-]+\\.png$`,
        ),
      );
    }
    assert.equal(keys.length, 3);
  } finally {
    storage.onModuleDestroy();
    process.env = previous;
  }
});

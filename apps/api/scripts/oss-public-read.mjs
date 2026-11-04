import "../load-env.mjs";
import OSS from "ali-oss";
import { PrismaClient } from "@prisma/client";
import { storageConfig } from "../storage-config.mjs";

// 仅调整本项目数据库引用的 OSS 对象，默认只统计，传入 --apply 才执行。
const config = storageConfig(process.env, "oss");
const client = new OSS(config.options);
const db = new PrismaClient();
const prefix = `oss://${config.bucket}/`;
const where = { objectKey: { startsWith: prefix } };
try {
  const count = await db.asset.count({ where });
  console.log(`当前 Bucket 中本项目引用的文件共 ${count} 个。`);
  if (!process.argv.includes("--apply")) {
    console.log("仅检查文件数量；添加 --apply 后继承 Bucket 公共读权限。");
  } else {
    const { acl } = await client.getBucketACL(config.bucket);
    if (acl !== "public-read")
      throw new Error(
        "请先在 OSS 控制台将 Bucket 设置为公共读。此脚本不会修改 Bucket 权限。",
      );
    let cursor,
      updated = 0,
      missing = 0,
      failed = 0;
    while (true) {
      const rows = await db.asset.findMany({
        where,
        select: { id: true, objectKey: true },
        orderBy: { id: "asc" },
        take: 100,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (!rows.length) break;
      for (const row of rows) {
        try {
          // 清除旧代码设置的独立私有权限，让文件继承 Bucket 的公共读设置。
          await client.putACL(row.objectKey.slice(prefix.length), "default");
          updated++;
        } catch (error) {
          if (error?.code === "NoSuchKey") missing++;
          else {
            failed++;
            console.error(
              `文件 ${row.id} 权限调整失败，请检查 RAM 权限或稍后重试。`,
            );
          }
        }
      }
      cursor = rows.at(-1).id;
    }
    console.log(
      `已调整 ${updated} 个文件，不存在 ${missing} 个，失败 ${failed} 个。`,
    );
    if (failed) process.exitCode = 1;
  }
} finally {
  await db.$disconnect();
}

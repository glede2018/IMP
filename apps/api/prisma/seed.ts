import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/security.js";
const db = new PrismaClient();
async function seed() {
  const phone = process.env.BOOTSTRAP_PHONE;
  const password = process.env.BOOTSTRAP_PASSWORD;
  if (
    !phone ||
    !/^1[3-9]\d{9}$/.test(phone) ||
    !password ||
    password.length < 12
  )
    throw new Error(
      "Set BOOTSTRAP_PHONE and BOOTSTRAP_PASSWORD (at least 12 characters)",
    );
  if (await db.user.findUnique({ where: { phone } })) {
    console.log("Bootstrap user already exists; credentials left unchanged.");
    return;
  }
  await db.$transaction(async (tx) => {
    const organization = await tx.organization.create({
      data: { name: "御品轩" },
    });
    await tx.store.create({
      data: { name: "总部", organizationId: organization.id },
    });
    await tx.user.create({
      data: {
        phone,
        username: phone,
        passwordHash: hashPassword(password),
        name: process.env.BOOTSTRAP_NAME || "运营管理员",
        role: "admin",
        organizationId: organization.id,
        assignments: {
          create: {
            role: {
              create: {
                organizationId: organization.id,
                name: "超级管理员",
                code: "super_admin",
                system: true,
                permissions: ["*"],
              },
            },
          },
        },
      },
    });
    await tx.helpResource.create({
      data: {
        organizationId: organization.id,
        title: "第一版使用说明",
        type: "doc",
        description:
          "管理员创建成员和门店；上传素材、维护模板；将已有视频登记为作品。视频生成、分发与策略中心本期未接入。",
      },
    });
  });
  console.log("Bootstrap organization and administrator created.");
}
seed()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());

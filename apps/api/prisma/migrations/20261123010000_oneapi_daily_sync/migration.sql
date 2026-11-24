-- 采集主页与 OAuth open_id 分开存储，避免混用平台身份。
ALTER TABLE "Account" ADD COLUMN "dataProfile" TEXT, ADD COLUMN "dataSecUid" TEXT, ADD COLUMN "dataUid" TEXT;
-- 保留数据来源，禁止跨口径计算历史增量。
ALTER TABLE "VideoMetricSample" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'official', ADD COLUMN "collects" BIGINT;
ALTER TABLE "AccountMetricSample" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'official';

ALTER TABLE "PlatformVideo" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'official';
CREATE UNIQUE INDEX "Account_organizationId_platform_dataUid_key" ON "Account"("organizationId", "platform", "dataUid");

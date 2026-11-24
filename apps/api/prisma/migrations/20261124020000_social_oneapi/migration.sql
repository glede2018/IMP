-- OneAPI 采集身份与未来的官方订单授权独立保存。
ALTER TABLE "Account" ADD COLUMN "dataProvider" TEXT;
ALTER TABLE "Account" ADD COLUMN "dataRevision" INTEGER NOT NULL DEFAULT 0;
-- 已经配置抖音 OneAPI 身份的账号直接沿用，不伪造官方授权。
UPDATE "Account" a SET "dataProvider"='oneapi'
WHERE a.platform='douyin' AND a."dataProfile" IS NOT NULL AND a."dataUid" IS NOT NULL
AND EXISTS (SELECT 1 FROM "AccountAuthorization" x WHERE x."accountId"=a.id AND x.mode='live');
-- 不同平台可能不提供播放量、分享或粉丝总数，不能把未知值保存为零。
ALTER TABLE "VideoMetricSample" ALTER COLUMN views DROP NOT NULL;
ALTER TABLE "VideoMetricSample" ALTER COLUMN likes DROP NOT NULL;
ALTER TABLE "VideoMetricSample" ALTER COLUMN comments DROP NOT NULL;
ALTER TABLE "VideoMetricSample" ALTER COLUMN shares DROP NOT NULL;
ALTER TABLE "AccountMetricSample" ALTER COLUMN fans DROP NOT NULL;
-- 历史余额不足等终止状态恢复为下一次北京时间零点重试，不在升级时立即补采。
UPDATE "DouyinSyncState" s
SET status='queued', "nextAttemptAt"=date_trunc('day', now() AT TIME ZONE 'Asia/Shanghai') + INTERVAL '1 day' - INTERVAL '8 hours'
WHERE s."accountId" IN (SELECT id FROM "Account" WHERE "dataProvider"='oneapi')
AND s.status IN ('quota_exhausted','unsupported','permission_required','authorization_required','invalid_response')
AND s."nextAttemptAt" IS NULL AND (s."leaseUntil" IS NULL OR s."leaseUntil" < now());

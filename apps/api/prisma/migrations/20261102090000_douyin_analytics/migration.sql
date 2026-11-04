-- CreateTable
CREATE TABLE "TemplateTrackingTag" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "titleSnapshot" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TemplateTrackingTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformVideo" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "remoteId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "bindingId" TEXT,
    "matchStatus" TEXT NOT NULL DEFAULT 'unmatched',
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformVideo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoMetricSample" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "bucket" TIMESTAMP(3) NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "views" BIGINT NOT NULL,
    "likes" BIGINT NOT NULL,
    "comments" BIGINT NOT NULL,
    "shares" BIGINT NOT NULL,

    CONSTRAINT "VideoMetricSample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountMetricSample" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "bucket" TIMESTAMP(3) NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "fans" BIGINT NOT NULL,

    CONSTRAINT "AccountMetricSample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DouyinSyncState" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'idle',
    "message" TEXT NOT NULL DEFAULT '',
    "cursor" TEXT NOT NULL DEFAULT '0',
    "runId" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastAttemptAt" TIMESTAMP(3),
    "failures" INTEGER NOT NULL DEFAULT 0,
    "processed" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DouyinSyncState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TemplateTrackingTag_organizationId_templateId_idx" ON "TemplateTrackingTag"("organizationId", "templateId");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateTrackingTag_organizationId_tag_key" ON "TemplateTrackingTag"("organizationId", "tag");

-- CreateIndex
CREATE INDEX "PlatformVideo_organizationId_publishedAt_idx" ON "PlatformVideo"("organizationId", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformVideo_accountId_remoteId_key" ON "PlatformVideo"("accountId", "remoteId");

-- CreateIndex
CREATE INDEX "VideoMetricSample_videoId_capturedAt_idx" ON "VideoMetricSample"("videoId", "capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "VideoMetricSample_videoId_bucket_key" ON "VideoMetricSample"("videoId", "bucket");

-- CreateIndex
CREATE INDEX "AccountMetricSample_accountId_capturedAt_idx" ON "AccountMetricSample"("accountId", "capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AccountMetricSample_accountId_bucket_key" ON "AccountMetricSample"("accountId", "bucket");

-- CreateIndex
CREATE INDEX "DouyinSyncState_status_nextAttemptAt_idx" ON "DouyinSyncState"("status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "DouyinSyncState_accountId_kind_key" ON "DouyinSyncState"("accountId", "kind");

-- AddForeignKey
ALTER TABLE "TemplateTrackingTag" ADD CONSTRAINT "TemplateTrackingTag_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformVideo" ADD CONSTRAINT "PlatformVideo_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformVideo" ADD CONSTRAINT "PlatformVideo_bindingId_fkey" FOREIGN KEY ("bindingId") REFERENCES "TemplateTrackingTag"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoMetricSample" ADD CONSTRAINT "VideoMetricSample_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "PlatformVideo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountMetricSample" ADD CONSTRAINT "AccountMetricSample_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DouyinSyncState" ADD CONSTRAINT "DouyinSyncState_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;


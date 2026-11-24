-- 保存平台返回的视频封面，已有视频在下次采集时补齐。
ALTER TABLE "PlatformVideo" ADD COLUMN "coverUrl" TEXT;

-- 保存分页缓存和已完成的视频，避免任务失败或进程重启后重复调用接口。
ALTER TABLE "DouyinSyncState" ADD COLUMN "videoProgress" JSONB NOT NULL DEFAULT '{}';

-- 模板下架仅影响新创作，保留历史作品和执行中的任务。
ALTER TABLE "Template" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;

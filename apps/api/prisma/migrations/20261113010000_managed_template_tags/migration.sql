-- 区分历史自动生成的关联标签；只隐藏确定由旧逻辑创建的记录，不删除历史信息。
ALTER TABLE "TemplateTrackingTag" ADD COLUMN "systemGenerated" BOOLEAN NOT NULL DEFAULT false;
UPDATE "TemplateTrackingTag" SET "systemGenerated" = true
WHERE "templateId" IS NOT NULL
  AND "tag" = lower('imp_' || "templateId" || '_' || "version")
  AND "code" = 'TPL_' || upper("templateId") || '_' || upper("version")
  AND "description" = '视频发布时携带，用于识别模板版本';
ALTER TABLE "VideoCreationDraft" ALTER COLUMN "trackingTagId" DROP NOT NULL;

-- 一个发布标签可用于多个模板，同一个模板也可使用多个标签。
CREATE TABLE "TemplateTagBinding" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "tagId" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "titleSnapshot" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TemplateTagBinding_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TemplateTagBinding_tagId_templateId_version_key" ON "TemplateTagBinding"("tagId", "templateId", "version");
CREATE INDEX "TemplateTagBinding_organizationId_templateId_idx" ON "TemplateTagBinding"("organizationId", "templateId");
ALTER TABLE "TemplateTagBinding" ADD CONSTRAINT "TemplateTagBinding_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "TemplateTrackingTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TemplateTagBinding" ADD CONSTRAINT "TemplateTagBinding_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlatformVideo" ADD COLUMN "templateTagBindingId" TEXT;
ALTER TABLE "PlatformVideo" ADD CONSTRAINT "PlatformVideo_templateTagBindingId_fkey" FOREIGN KEY ("templateTagBindingId") REFERENCES "TemplateTagBinding"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 按历史创作时实际选择的标签补全关联；不修改旧作品的发布话题快照。
INSERT INTO "TemplateTagBinding" ("id", "organizationId", "tagId", "templateId", "version", "titleSnapshot")
SELECT DISTINCT ON (t.id, d."templateId", d.revision)
  'ttb_' || md5(t.id || ':' || d."templateId" || ':' || d.revision::text),
  d."organizationId", t.id, d."templateId", 'v' || d.revision::text,
  COALESCE(d."templateSnapshot"->>'title', '')
FROM "VideoCreationDraft" d
JOIN "TemplateTrackingTag" t ON t.id = ANY(d."contentTagIds") AND t."organizationId" = d."organizationId"
WHERE NOT t."systemGenerated"
ORDER BY t.id, d."templateId", d.revision, d."createdAt";

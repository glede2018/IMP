ALTER TABLE "TemplateTrackingTag" ALTER COLUMN "templateId" DROP NOT NULL;
ALTER TABLE "TemplateTrackingTag" ALTER COLUMN "version" SET DEFAULT '';
ALTER TABLE "TemplateTrackingTag" ALTER COLUMN "titleSnapshot" SET DEFAULT '';
ALTER TABLE "TemplateTrackingTag" ADD COLUMN "name" TEXT NOT NULL DEFAULT '', ADD COLUMN "code" TEXT, ADD COLUMN "description" TEXT NOT NULL DEFAULT '', ADD COLUMN "sort" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true, ADD COLUMN "deletedAt" TIMESTAMP(3);
UPDATE "TemplateTrackingTag" SET "name" = "tag";
CREATE UNIQUE INDEX "TemplateTrackingTag_organizationId_code_key" ON "TemplateTrackingTag"("organizationId", "code");
-- Keep any labels entered before the interpretation was corrected.
INSERT INTO "TemplateTrackingTag" ("id","organizationId","name","tag","code","description","sort","active","createdAt")
SELECT g."id",g."organizationId",g."name",lower(g."name"),g."code",g."description",g."sort",g."active",g."createdAt" FROM "TagGroup" g
ON CONFLICT ("organizationId","tag") DO NOTHING;
DROP TABLE "TagItem";
DROP TABLE "TagGroup";

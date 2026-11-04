ALTER TABLE "Template" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1;
CREATE TABLE "VideoCreationDraft" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "organizationId" TEXT NOT NULL,
 "creatorId" TEXT NOT NULL,
 "templateId" TEXT NOT NULL REFERENCES "Template"("id") ON DELETE RESTRICT,
 "revision" INTEGER NOT NULL,
 "title" TEXT NOT NULL,
 "contentTagIds" TEXT[] NOT NULL,
 "publishTags" TEXT[] NOT NULL,
 "trackingTagId" TEXT NOT NULL,
 "templateSnapshot" JSONB NOT NULL,
 "materialSnapshot" JSONB NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'awaiting_provider',
 "requestId" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "VideoCreationDraft_organizationId_requestId_key" ON "VideoCreationDraft"("organizationId","requestId");
CREATE INDEX "VideoCreationDraft_organizationId_createdAt_idx" ON "VideoCreationDraft"("organizationId","createdAt");

ALTER TABLE "Work" ADD COLUMN "caption" TEXT NOT NULL DEFAULT '', ADD COLUMN "publishTags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], ADD COLUMN "templateSnapshot" JSONB, ADD COLUMN "creationId" TEXT, ADD COLUMN "width" INTEGER, ADD COLUMN "height" INTEGER, ADD COLUMN "generationSeconds" INTEGER;
CREATE UNIQUE INDEX "Work_creationId_key" ON "Work"("creationId");
ALTER TABLE "Work" ADD CONSTRAINT "Work_creationId_fkey" FOREIGN KEY ("creationId") REFERENCES "VideoCreationDraft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

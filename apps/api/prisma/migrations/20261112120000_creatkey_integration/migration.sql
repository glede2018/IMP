-- AlterTable
ALTER TABLE "Template" ADD COLUMN     "sourceTemplateId" TEXT;

-- AlterTable
ALTER TABLE "VideoCreationDraft" ADD COLUMN     "nextPollAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "remoteAssets" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "remoteJobId" TEXT;

-- CreateTable
CREATE TABLE "ModelGeneration" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "referenceAssets" JSONB NOT NULL DEFAULT '{}',
    "nextPollAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "remoteJobId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "error" TEXT,
    "result" JSONB NOT NULL DEFAULT '[]',
    "leaseUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ModelGeneration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ModelGeneration_status_leaseUntil_idx" ON "ModelGeneration"("status", "leaseUntil");

-- CreateIndex
CREATE UNIQUE INDEX "ModelGeneration_organizationId_requestId_key" ON "ModelGeneration"("organizationId", "requestId");

-- CreateIndex
CREATE UNIQUE INDEX "Template_organizationId_sourceTemplateId_key" ON "Template"("organizationId", "sourceTemplateId");


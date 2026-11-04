ALTER TABLE "VideoCreationDraft" ADD COLUMN "workflowSnapshot" JSONB, ADD COLUMN "nodeStates" JSONB NOT NULL DEFAULT '{}', ADD COLUMN "error" TEXT, ADD COLUMN "leaseUntil" TIMESTAMP(3), ADD COLUMN "startedAt" TIMESTAMP(3), ADD COLUMN "finishedAt" TIMESTAMP(3);
CREATE INDEX "VideoCreationDraft_status_leaseUntil_idx" ON "VideoCreationDraft"("status", "leaseUntil");

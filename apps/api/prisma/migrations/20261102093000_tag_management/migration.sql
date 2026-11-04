CREATE TABLE "TagGroup" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "organizationId" TEXT NOT NULL REFERENCES "Organization"("id"),
 "name" TEXT NOT NULL,
 "code" TEXT NOT NULL,
 "description" TEXT NOT NULL DEFAULT '',
 "sort" INTEGER NOT NULL DEFAULT 0,
 "active" BOOLEAN NOT NULL DEFAULT true,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "TagGroup_organizationId_code_key" ON "TagGroup"("organizationId", "code");
CREATE INDEX "TagGroup_organizationId_sort_idx" ON "TagGroup"("organizationId", "sort");
CREATE TABLE "TagItem" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "groupId" TEXT NOT NULL REFERENCES "TagGroup"("id") ON DELETE CASCADE,
 "name" TEXT NOT NULL,
 "code" TEXT NOT NULL,
 "description" TEXT NOT NULL DEFAULT '',
 "sort" INTEGER NOT NULL DEFAULT 0,
 "active" BOOLEAN NOT NULL DEFAULT true,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "TagItem_groupId_code_key" ON "TagItem"("groupId", "code");
CREATE INDEX "TagItem_groupId_sort_idx" ON "TagItem"("groupId", "sort");

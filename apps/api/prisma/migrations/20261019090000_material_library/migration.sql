ALTER TABLE "Asset" ADD COLUMN "retained" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Work" ADD COLUMN "materialSnapshot" JSONB;
CREATE TABLE "Material" (
 "id" TEXT PRIMARY KEY, "organizationId" TEXT NOT NULL REFERENCES "Organization"("id"),
 "type" TEXT NOT NULL, "name" TEXT NOT NULL, "description" TEXT NOT NULL DEFAULT '',
 "categoryPath" TEXT[] NOT NULL DEFAULT '{}', "tags" TEXT[] NOT NULL DEFAULT '{}', "priceCents" INTEGER NOT NULL DEFAULT 0 CHECK ("priceCents">=0),
 "creatorId" TEXT NOT NULL, "creatorName" TEXT NOT NULL, "voiceAssetId" TEXT REFERENCES "Asset"("id") ON DELETE RESTRICT,
 "isDefault" BOOLEAN NOT NULL DEFAULT false, "generationStatus" TEXT NOT NULL DEFAULT 'reference',
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "deletedAt" TIMESTAMP(3)
);
CREATE INDEX "Material_organizationId_type_deletedAt_createdAt_idx" ON "Material"("organizationId","type","deletedAt","createdAt");
CREATE UNIQUE INDEX "Material_unique_default_person" ON "Material"("organizationId") WHERE "type"='person' AND "isDefault"=true AND "deletedAt" IS NULL;
CREATE TABLE "MaterialFile" (
 "id" TEXT PRIMARY KEY, "materialId" TEXT NOT NULL REFERENCES "Material"("id") ON DELETE CASCADE,
 "assetId" TEXT NOT NULL REFERENCES "Asset"("id") ON DELETE RESTRICT, "position" INTEGER NOT NULL, "label" TEXT NOT NULL DEFAULT '主图'
);
CREATE UNIQUE INDEX "MaterialFile_materialId_assetId_key" ON "MaterialFile"("materialId","assetId");
CREATE INDEX "MaterialFile_assetId_idx" ON "MaterialFile"("assetId");
INSERT INTO "Material" ("id","organizationId","type","name","tags","creatorId","creatorName","createdAt","updatedAt")
 SELECT 'material_'||"id","organizationId",CASE "type" WHEN 'portrait' THEN 'person' ELSE 'product' END,left("name",CASE "type" WHEN 'portrait' THEN 30 ELSE 120 END),"tags",'legacy','历史导入',"createdAt","createdAt" FROM "Asset" WHERE "type" IN ('product','portrait');
INSERT INTO "MaterialFile" ("id","materialId","assetId","position") SELECT 'file_'||"id",'material_'||"id","id",0 FROM "Asset" WHERE "type" IN ('product','portrait');
UPDATE "Work" w SET "materialSnapshot"=jsonb_build_array(jsonb_build_object('id',m."id",'name',m."name",'description',m."description",'priceCents',m."priceCents",'fileIds',jsonb_build_array(w."assetId"))) FROM "Material" m JOIN "MaterialFile" f ON f."materialId"=m."id" WHERE f."assetId"=w."assetId";

UPDATE "Asset" SET "retained"=true WHERE "type" IN ('product','portrait');

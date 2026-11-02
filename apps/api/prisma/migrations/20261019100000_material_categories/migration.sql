CREATE TABLE "MaterialCategory" (
 "id" TEXT PRIMARY KEY, "organizationId" TEXT NOT NULL REFERENCES "Organization"("id"),
 "name" TEXT NOT NULL, "parentId" TEXT REFERENCES "MaterialCategory"("id") ON DELETE RESTRICT,
 "sort" INTEGER NOT NULL DEFAULT 0, "system" BOOLEAN NOT NULL DEFAULT false,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "MaterialCategory_organizationId_parentId_idx" ON "MaterialCategory"("organizationId","parentId");
CREATE UNIQUE INDEX "MaterialCategory_root_name_key" ON "MaterialCategory"("organizationId","name") WHERE "parentId" IS NULL;
CREATE UNIQUE INDEX "MaterialCategory_child_name_key" ON "MaterialCategory"("organizationId","parentId","name") WHERE "parentId" IS NOT NULL;
ALTER TABLE "Material" ADD COLUMN "categoryId" TEXT REFERENCES "MaterialCategory"("id") ON DELETE SET NULL;
INSERT INTO "MaterialCategory" ("id","organizationId","name","parentId","sort","system")
SELECT 'category_'||md5(o."id"||'|'||p.path::text),o."id",p.path[cardinality(p.path)],
 CASE WHEN cardinality(p.path)>1 THEN 'category_'||md5(o."id"||'|'||p.path[1:cardinality(p.path)-1]::text) ELSE NULL END,
 p.sort,p.path=ARRAY['未分类'] FROM "Organization" o CROSS JOIN (VALUES
 (ARRAY['未分类'],0),(ARRAY['食品'],1),(ARRAY['食品','蛋糕'],1),(ARRAY['食品','面包'],2),(ARRAY['食品','糕点'],3),(ARRAY['食品','礼盒'],4),
 (ARRAY['饮品'],2),(ARRAY['饮品','咖啡'],1),(ARRAY['饮品','茶饮'],2),(ARRAY['其他'],3)) AS p(path,sort);
-- Import every prefix of existing paths; preserve custom categories and names.
INSERT INTO "MaterialCategory" ("id","organizationId","name","parentId")
SELECT DISTINCT 'category_'||md5(m."organizationId"||'|'||m."categoryPath"[1:n]::text),m."organizationId",m."categoryPath"[n],
 CASE WHEN n>1 THEN 'category_'||md5(m."organizationId"||'|'||m."categoryPath"[1:n-1]::text) ELSE NULL END
FROM "Material" m CROSS JOIN LATERAL generate_series(1,cardinality(m."categoryPath")) n WHERE m."type"='product' ON CONFLICT DO NOTHING;
UPDATE "Material" m SET "categoryId"='category_'||md5(m."organizationId"||'|'||CASE WHEN cardinality(m."categoryPath")>0 THEN m."categoryPath" ELSE ARRAY['未分类'] END::text) WHERE m."type"='product';
UPDATE "Material" SET "categoryPath"=ARRAY['未分类'] WHERE "type"='product' AND cardinality("categoryPath")=0;

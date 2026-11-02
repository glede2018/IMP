ALTER TABLE "User" ADD COLUMN "username" TEXT, ADD COLUMN "lastLoginAt" TIMESTAMP(3);
UPDATE "User" SET "username" = "phone";
ALTER TABLE "User" ALTER COLUMN "username" SET NOT NULL;
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
ALTER TABLE "User" DROP CONSTRAINT "User_storeId_fkey";
ALTER TABLE "User" DROP COLUMN "storeId";
CREATE TABLE "AccessRole" (
 "id" TEXT PRIMARY KEY, "organizationId" TEXT NOT NULL REFERENCES "Organization"("id"),
 "name" TEXT NOT NULL, "code" TEXT NOT NULL, "description" TEXT NOT NULL DEFAULT '',
 "sort" INTEGER NOT NULL DEFAULT 0, "active" BOOLEAN NOT NULL DEFAULT true,
 "system" BOOLEAN NOT NULL DEFAULT false, "permissions" TEXT[] NOT NULL DEFAULT '{}',
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "AccessRole_organizationId_code_key" ON "AccessRole"("organizationId","code");
CREATE TABLE "UserRole" (
 "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
 "roleId" TEXT NOT NULL REFERENCES "AccessRole"("id") ON DELETE RESTRICT,
 PRIMARY KEY ("userId","roleId")
);
INSERT INTO "AccessRole" ("id","organizationId","name","code","description","sort","system","permissions")
SELECT 'role_' || o."id" || '_' || r.code, o."id",r.name,r.code,'由原角色迁移',r.sort,r.code='super_admin',r.permissions
FROM "Organization" o CROSS JOIN (VALUES
 ('super_admin','超级管理员',1,ARRAY['*']),
 ('content_admin','内容管理员',2,ARRAY['home','accounts','templates','assets','works','analytics','help','accounts:write','templates:write','assets:write','works:write']),
 ('reviewer','审核员',3,ARRAY['home','accounts','templates','assets','works','analytics','help','works:review']),
 ('viewer','只读访客',4,ARRAY['home','accounts','templates','assets','works','analytics','help'])
) AS r(code,name,sort,permissions);
INSERT INTO "UserRole" ("userId","roleId") SELECT "id",'role_' || "organizationId" || '_' || CASE "role" WHEN 'admin' THEN 'super_admin' WHEN 'operator' THEN 'content_admin' ELSE "role"::text END FROM "User";

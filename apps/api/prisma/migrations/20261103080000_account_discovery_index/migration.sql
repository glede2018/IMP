-- 支持按平台和账号游标分页发现待同步账号。
CREATE INDEX "Account_platform_id_idx" ON "Account"("platform", "id");

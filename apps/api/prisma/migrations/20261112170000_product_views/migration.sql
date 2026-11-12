-- 产品视图独立于上传参考图保存，不混入原图列表。
ALTER TABLE "Material" ADD COLUMN "productViewAssetId" TEXT, ADD COLUMN "productViewJobId" TEXT;
ALTER TABLE "Material" ADD CONSTRAINT "Material_productViewAssetId_fkey" FOREIGN KEY ("productViewAssetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ModelGeneration" ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'general';

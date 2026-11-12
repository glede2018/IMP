-- 人物三视图独立保存，原图与历史音色数据保留。
ALTER TABLE "Material" ADD COLUMN "personViewAssetId" TEXT, ADD COLUMN "personViewJobId" TEXT;
ALTER TABLE "Material" ADD CONSTRAINT "Material_personViewAssetId_fkey" FOREIGN KEY ("personViewAssetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

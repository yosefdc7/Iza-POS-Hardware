-- AlterTable
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "tag" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Product_tag_idx" ON "Product"("tag");

-- AlterTable
ALTER TABLE "BusinessSettings" ALTER COLUMN "currency" SET DEFAULT '₱',
ALTER COLUMN "taxRate" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "loyaltyEarnRate" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "loyaltyRedeemValue" SET DATA TYPE DECIMAL(65,30);

-- AlterTable
ALTER TABLE "Product" ALTER COLUMN "price" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "cost" SET DATA TYPE DECIMAL(65,30);

-- AlterTable
ALTER TABLE "Refund" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(65,30);

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "clientRequestId" TEXT,
ADD COLUMN     "drSiNumber" TEXT,
ADD COLUMN     "requestFingerprint" TEXT,
ALTER COLUMN "subtotal" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "taxAmount" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "discountAmount" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "tipAmount" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "total" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "amountTendered" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "changeDue" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "taxRate" SET DATA TYPE DECIMAL(65,30);

-- AlterTable
ALTER TABLE "SaleItem" ADD COLUMN     "basePrice" DECIMAL(14,4),
ADD COLUMN     "packagingId" TEXT,
ADD COLUMN     "packagingQty" DECIMAL(14,4),
ALTER COLUMN "price" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "total" SET DATA TYPE DECIMAL(65,30);

-- CreateTable
CREATE TABLE "ProductPackaging" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "conversionQty" DECIMAL(14,4) NOT NULL,
    "price" DECIMAL(65,30) NOT NULL,
    "barcode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductPackaging_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductPackaging_barcode_key" ON "ProductPackaging"("barcode");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_clientRequestId_key" ON "Sale"("clientRequestId");

-- AddForeignKey
ALTER TABLE "ProductPackaging" ADD CONSTRAINT "ProductPackaging_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_packagingId_fkey" FOREIGN KEY ("packagingId") REFERENCES "ProductPackaging"("id") ON DELETE SET NULL ON UPDATE CASCADE;

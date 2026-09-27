CREATE TABLE "ProductChangeRequest" (
 "id" TEXT PRIMARY KEY, "productId" TEXT NOT NULL REFERENCES "Product"("id") ON DELETE RESTRICT,
 "requesterId" TEXT NOT NULL, "requesterName" TEXT NOT NULL, "operation" TEXT NOT NULL,
 "reason" TEXT NOT NULL, "changes" JSONB NOT NULL, "original" JSONB NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'PENDING', "reviewerId" TEXT, "reviewerName" TEXT,
 "reviewReason" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "reviewedAt" TIMESTAMP(3),
 CONSTRAINT "ProductChangeRequest_status_check" CHECK ("status" IN ('PENDING','APPROVED','REJECTED','CANCELLED')),
 CONSTRAINT "ProductChangeRequest_operation_check" CHECK ("operation" IN ('EDIT','ARCHIVE','STOCK','PACK_ADD','PACK_EDIT','PACK_DELETE'))
);
CREATE INDEX "ProductChangeRequest_status_createdAt_idx" ON "ProductChangeRequest"("status", "createdAt");
CREATE INDEX "ProductChangeRequest_requesterId_createdAt_idx" ON "ProductChangeRequest"("requesterId", "createdAt");
ALTER TABLE "ProductChangeRequest" ENABLE ROW LEVEL SECURITY;

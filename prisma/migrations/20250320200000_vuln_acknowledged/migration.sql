-- AlterTable
ALTER TABLE "Vulnerability" ADD COLUMN "acknowledgedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Vulnerability_acknowledgedAt_idx" ON "Vulnerability"("acknowledgedAt");

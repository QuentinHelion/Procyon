-- AlterTable
ALTER TABLE "Vulnerability" ADD COLUMN "dueAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Vulnerability_dueAt_idx" ON "Vulnerability"("dueAt");

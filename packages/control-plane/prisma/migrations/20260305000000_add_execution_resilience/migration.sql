-- Add resilience fields to Execution model
ALTER TABLE "Execution" ADD COLUMN "nodeId" TEXT;
ALTER TABLE "Execution" ADD COLUMN "timeoutMs" INTEGER;
ALTER TABLE "Execution" ADD COLUMN "startedAt" TIMESTAMPTZ;

-- Add default timeout to Pattern model
ALTER TABLE "Pattern" ADD COLUMN "timeout" INTEGER;

-- Add index for orphan recovery queries
CREATE INDEX "Execution_nodeId_status_idx" ON "Execution"("nodeId", "status");

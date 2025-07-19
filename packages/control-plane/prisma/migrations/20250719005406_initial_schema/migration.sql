-- CreateTable
CREATE TABLE "Pattern" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "description" TEXT NOT NULL,
    "script" TEXT NOT NULL,
    "metadata" JSONB,
    "input" JSONB,
    "minAgents" INTEGER,
    "maxAgents" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pattern_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "capabilities" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'unknown',
    "expertise" JSONB,
    "metadata" JSONB,
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Execution" (
    "id" TEXT NOT NULL,
    "time" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "patternId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "input" JSONB NOT NULL,
    "result" JSONB,
    "error" TEXT,
    "confidence" DOUBLE PRECISION,
    "metrics" JSONB,
    "warnings" JSONB,
    "durationMs" INTEGER,
    "agentCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Execution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExecutionEvent" (
    "id" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "time" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" TEXT NOT NULL,
    "agentId" TEXT,
    "data" JSONB NOT NULL,

    CONSTRAINT "ExecutionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfidenceMetric" (
    "id" TEXT NOT NULL,
    "time" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "agentId" TEXT NOT NULL,
    "patternId" TEXT,
    "task" TEXT,
    "predicted" DOUBLE PRECISION NOT NULL,
    "actual" DOUBLE PRECISION,
    "metadata" JSONB,

    CONSTRAINT "ConfidenceMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatternVersion" (
    "id" TEXT NOT NULL,
    "patternId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "script" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "PatternVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "License" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "features" JSONB NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "License_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT,
    "data" JSONB,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Pattern_name_key" ON "Pattern"("name");

-- CreateIndex
CREATE INDEX "Pattern_name_idx" ON "Pattern"("name");

-- CreateIndex
CREATE INDEX "Agent_status_idx" ON "Agent"("status");

-- CreateIndex
CREATE INDEX "Agent_lastSeen_idx" ON "Agent"("lastSeen");

-- CreateIndex
CREATE INDEX "Execution_time_patternId_idx" ON "Execution"("time", "patternId");

-- CreateIndex
CREATE INDEX "Execution_status_idx" ON "Execution"("status");

-- CreateIndex
CREATE INDEX "Execution_time_idx" ON "Execution"("time");

-- CreateIndex
CREATE INDEX "ExecutionEvent_executionId_time_idx" ON "ExecutionEvent"("executionId", "time");

-- CreateIndex
CREATE INDEX "ExecutionEvent_time_idx" ON "ExecutionEvent"("time");

-- CreateIndex
CREATE INDEX "ConfidenceMetric_time_agentId_idx" ON "ConfidenceMetric"("time", "agentId");

-- CreateIndex
CREATE INDEX "ConfidenceMetric_time_patternId_idx" ON "ConfidenceMetric"("time", "patternId");

-- CreateIndex
CREATE INDEX "ConfidenceMetric_time_idx" ON "ConfidenceMetric"("time");

-- CreateIndex
CREATE INDEX "PatternVersion_patternId_idx" ON "PatternVersion"("patternId");

-- CreateIndex
CREATE UNIQUE INDEX "PatternVersion_patternId_version_key" ON "PatternVersion"("patternId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "License_key_key" ON "License"("key");

-- CreateIndex
CREATE INDEX "License_key_idx" ON "License"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_token_idx" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- AddForeignKey
ALTER TABLE "Execution" ADD CONSTRAINT "Execution_patternId_fkey" FOREIGN KEY ("patternId") REFERENCES "Pattern"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionEvent" ADD CONSTRAINT "ExecutionEvent_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "Execution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

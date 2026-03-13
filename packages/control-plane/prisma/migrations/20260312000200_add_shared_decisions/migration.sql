CREATE TABLE "shared_decisions" (
    "id" TEXT NOT NULL,
    "execution_id" TEXT NOT NULL,
    "thread_id" TEXT,
    "category" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "details" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shared_decisions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "shared_decisions_execution_id_created_at_idx" ON "shared_decisions"("execution_id", "created_at");
CREATE INDEX "shared_decisions_thread_id_created_at_idx" ON "shared_decisions"("thread_id", "created_at");
CREATE INDEX "shared_decisions_category_created_at_idx" ON "shared_decisions"("category", "created_at");

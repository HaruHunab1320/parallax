CREATE TABLE "threads" (
    "id" TEXT NOT NULL,
    "execution_id" TEXT NOT NULL,
    "runtime_name" TEXT NOT NULL,
    "agent_id" TEXT,
    "agent_type" TEXT NOT NULL,
    "role" TEXT,
    "status" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "workspace" JSONB,
    "summary" TEXT,
    "completion" JSONB,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_activity_at" TIMESTAMPTZ,

    CONSTRAINT "threads_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "thread_events" (
    "id" TEXT NOT NULL,
    "thread_id" TEXT NOT NULL,
    "execution_id" TEXT NOT NULL,
    "time" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" TEXT NOT NULL,
    "data" JSONB NOT NULL,

    CONSTRAINT "thread_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "threads_execution_id_created_at_idx" ON "threads"("execution_id", "created_at");
CREATE INDEX "threads_status_idx" ON "threads"("status");
CREATE INDEX "threads_runtime_name_status_idx" ON "threads"("runtime_name", "status");
CREATE INDEX "threads_last_activity_at_idx" ON "threads"("last_activity_at");

CREATE INDEX "thread_events_thread_id_time_idx" ON "thread_events"("thread_id", "time");
CREATE INDEX "thread_events_execution_id_time_idx" ON "thread_events"("execution_id", "time");
CREATE INDEX "thread_events_time_idx" ON "thread_events"("time");

ALTER TABLE "thread_events"
ADD CONSTRAINT "thread_events_thread_id_fkey"
FOREIGN KEY ("thread_id") REFERENCES "threads"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

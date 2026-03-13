CREATE TABLE "episodic_experiences" (
    "id" TEXT NOT NULL,
    "execution_id" TEXT NOT NULL,
    "thread_id" TEXT,
    "role" TEXT,
    "repo" TEXT,
    "objective" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "details" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "episodic_experiences_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "episodic_experiences_repo_created_at_idx" ON "episodic_experiences"("repo", "created_at");
CREATE INDEX "episodic_experiences_role_created_at_idx" ON "episodic_experiences"("role", "created_at");
CREATE INDEX "episodic_experiences_execution_id_created_at_idx" ON "episodic_experiences"("execution_id", "created_at");

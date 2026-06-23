-- CreateTable
CREATE TABLE "session_participants" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "session_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "invited_by" TEXT,
    "joined_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "session_participants_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "session_logs" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "session_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "session_invites" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "session_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "expires_at" DATETIME,
    "max_uses" INTEGER,
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "session_invites_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "session_logs" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_session_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "machine_id" TEXT NOT NULL,
    "project_id" TEXT,
    "started_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" DATETIME,
    "duration_seconds" INTEGER,
    "approval_mode" TEXT NOT NULL DEFAULT 'owner',
    CONSTRAINT "session_logs_machine_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "machines" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "session_logs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_session_logs" ("duration_seconds", "ended_at", "id", "machine_id", "project_id", "started_at") SELECT "duration_seconds", "ended_at", "id", "machine_id", "project_id", "started_at" FROM "session_logs";
DROP TABLE "session_logs";
ALTER TABLE "new_session_logs" RENAME TO "session_logs";
CREATE INDEX "session_logs_machine_id_idx" ON "session_logs"("machine_id");
CREATE INDEX "session_logs_project_id_idx" ON "session_logs"("project_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "session_participants_session_id_idx" ON "session_participants"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "session_participants_session_id_user_id_key" ON "session_participants"("session_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "session_invites_token_key" ON "session_invites"("token");

-- CreateIndex
CREATE INDEX "session_invites_session_id_idx" ON "session_invites"("session_id");


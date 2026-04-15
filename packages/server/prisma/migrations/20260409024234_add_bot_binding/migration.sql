-- CreateTable
CREATE TABLE "bot_bindings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "platform_user_id" TEXT NOT NULL,
    "chat_id" TEXT NOT NULL,
    "refresh_secret" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bot_bindings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "bot_bindings_user_id_idx" ON "bot_bindings"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "bot_bindings_platform_platform_user_id_key" ON "bot_bindings"("platform", "platform_user_id");

-- CreateIndex
CREATE INDEX "CardActivity_actorId_boardId_createdAt_idx" ON "CardActivity"("actorId", "boardId", "createdAt");

-- Wipe Google-era votes so email can become the unique voter key (local/dev OK).
DELETE FROM "votes";
UPDATE "vote_counts" SET "count" = 0, "updated_at" = CURRENT_TIMESTAMP;

DROP INDEX IF EXISTS "votes_google_sub_key";
ALTER TABLE "votes" DROP COLUMN IF EXISTS "google_sub";

-- Remove null emails (none left after wipe), then require + unique email.
DELETE FROM "votes" WHERE "email" IS NULL;
ALTER TABLE "votes" ALTER COLUMN "email" SET NOT NULL;
CREATE UNIQUE INDEX "votes_email_key" ON "votes"("email");

CREATE TABLE "magic_link_tokens" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "magic_link_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "magic_link_tokens_token_hash_key" ON "magic_link_tokens"("token_hash");
CREATE INDEX "magic_link_tokens_email_idx" ON "magic_link_tokens"("email");
CREATE INDEX "magic_link_tokens_created_at_idx" ON "magic_link_tokens"("created_at");

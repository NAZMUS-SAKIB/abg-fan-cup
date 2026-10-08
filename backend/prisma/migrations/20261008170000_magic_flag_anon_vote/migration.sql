-- Global magic-link toggle
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "magic_link_required" BOOLEAN NOT NULL DEFAULT true;

-- Allow anonymous votes: email optional; add device + fingerprint keys
ALTER TABLE "votes" DROP CONSTRAINT IF EXISTS "votes_email_key";
DROP INDEX IF EXISTS "votes_email_key";

ALTER TABLE "votes" ALTER COLUMN "email" DROP NOT NULL;

ALTER TABLE "votes" ADD COLUMN IF NOT EXISTS "device_key" TEXT;
ALTER TABLE "votes" ADD COLUMN IF NOT EXISTS "fingerprint_hash" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "votes_email_key" ON "votes"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "votes_device_key_key" ON "votes"("device_key");
CREATE UNIQUE INDEX IF NOT EXISTS "votes_fingerprint_hash_key" ON "votes"("fingerprint_hash");
CREATE INDEX IF NOT EXISTS "votes_ip_idx" ON "votes"("ip");

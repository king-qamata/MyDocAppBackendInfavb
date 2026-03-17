ALTER TABLE "Consultation"
  ADD COLUMN IF NOT EXISTS "expiryNotifiedAt" TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "livenessRequestedAt" TIMESTAMP;

ALTER TABLE "Wallet"
  ADD COLUMN IF NOT EXISTS "metadata" JSONB;

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "passwordHash" TEXT;

CREATE TABLE IF NOT EXISTS "RefreshToken" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP NOT NULL,
  "revokedAt" TIMESTAMP,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "RefreshToken_userId_idx" ON "RefreshToken"("userId");
CREATE INDEX IF NOT EXISTS "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");

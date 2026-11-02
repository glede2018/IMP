-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "avatar" TEXT;

-- CreateTable
CREATE TABLE "OAuthState" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "storeId" TEXT,
    "targetAccountId" TEXT,
    "mode" TEXT NOT NULL,
    "clientKey" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountAuthorization" (
    "accountId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "clientKey" TEXT NOT NULL,
    "openId" TEXT NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "accessTokenCiphertext" TEXT,
    "refreshTokenCiphertext" TEXT,
    "accessExpiresAt" TIMESTAMP(3) NOT NULL,
    "refreshExpiresAt" TIMESTAMP(3) NOT NULL,
    "lastVerifiedAt" TIMESTAMP(3) NOT NULL,
    "refreshLockUntil" TIMESTAMP(3),
    "revision" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AccountAuthorization_pkey" PRIMARY KEY ("accountId")
);

-- CreateIndex
CREATE INDEX "OAuthState_expiresAt_idx" ON "OAuthState"("expiresAt");

-- CreateIndex
CREATE INDEX "AccountAuthorization_accessExpiresAt_idx" ON "AccountAuthorization"("accessExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AccountAuthorization_clientKey_openId_key" ON "AccountAuthorization"("clientKey", "openId");

-- AddForeignKey
ALTER TABLE "OAuthState" ADD CONSTRAINT "OAuthState_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountAuthorization" ADD CONSTRAINT "AccountAuthorization_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;


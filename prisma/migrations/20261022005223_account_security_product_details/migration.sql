-- CreateEnum
CREATE TYPE "AccountTokenType" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET');

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "preferredLanguage" TEXT NOT NULL DEFAULT 'en';

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "care" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "fit" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "material" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "sizeGuide" JSONB;

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "ipAddress" TEXT,
ADD COLUMN     "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "userAgent" TEXT;

-- CreateTable
CREATE TABLE "AccountToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "type" "AccountTokenType" NOT NULL,
    "customerId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountToken_tokenHash_key" ON "AccountToken"("tokenHash");

-- CreateIndex
CREATE INDEX "AccountToken_customerId_type_idx" ON "AccountToken"("customerId", "type");

-- CreateIndex
CREATE INDEX "AccountToken_expiresAt_idx" ON "AccountToken"("expiresAt");

-- AddForeignKey
ALTER TABLE "AccountToken" ADD CONSTRAINT "AccountToken_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

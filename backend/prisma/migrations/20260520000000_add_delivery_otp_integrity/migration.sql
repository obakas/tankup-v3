ALTER TABLE "Delivery"
ADD COLUMN "otpCode" TEXT,
ADD COLUMN "otpExpiresAt" TIMESTAMP(3),
ADD COLUMN "otpVerifiedAt" TIMESTAMP(3),
ADD COLUMN "otpVerifiedByActorType" "ActorType",
ADD COLUMN "otpVerifiedByActorId" TEXT,
ADD COLUMN "otpAttemptCount" INTEGER NOT NULL DEFAULT 0;

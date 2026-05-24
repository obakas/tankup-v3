-- CreateEnum
CREATE TYPE "TankerAvailabilityStatus" AS ENUM ('AVAILABLE', 'ASSIGNED', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AssignmentDecisionResult" AS ENUM ('ACCEPTED', 'REJECTED');

-- CreateTable
CREATE TABLE "Tanker" (
    "id" TEXT NOT NULL,
    "label" TEXT,
    "driverId" TEXT,
    "fleetId" TEXT,
    "capacityLiters" INTEGER,
    "availabilityStatus" "TankerAvailabilityStatus" NOT NULL DEFAULT 'AVAILABLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tanker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobOffer" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "tankerId" TEXT NOT NULL,
    "status" "OfferStatus" NOT NULL DEFAULT 'PENDING',
    "score" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssignmentDecision" (
    "id" TEXT NOT NULL,
    "jobOfferId" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "tankerId" TEXT NOT NULL,
    "result" "AssignmentDecisionResult" NOT NULL,
    "actorType" "ActorType" NOT NULL,
    "actorId" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssignmentDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Tanker_availabilityStatus_idx" ON "Tanker"("availabilityStatus");

-- CreateIndex
CREATE INDEX "JobOffer_deliveryId_status_idx" ON "JobOffer"("deliveryId", "status");

-- CreateIndex
CREATE INDEX "JobOffer_tankerId_status_idx" ON "JobOffer"("tankerId", "status");

-- CreateIndex
CREATE INDEX "JobOffer_expiresAt_idx" ON "JobOffer"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "JobOffer_one_pending_offer_per_delivery" ON "JobOffer"("deliveryId") WHERE "status" = 'PENDING';

-- CreateIndex
CREATE UNIQUE INDEX "JobOffer_one_pending_offer_per_tanker" ON "JobOffer"("tankerId") WHERE "status" = 'PENDING';

-- CreateIndex
CREATE INDEX "AssignmentDecision_deliveryId_createdAt_idx" ON "AssignmentDecision"("deliveryId", "createdAt");

-- CreateIndex
CREATE INDEX "AssignmentDecision_tankerId_createdAt_idx" ON "AssignmentDecision"("tankerId", "createdAt");

-- AddForeignKey
ALTER TABLE "JobOffer" ADD CONSTRAINT "JobOffer_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobOffer" ADD CONSTRAINT "JobOffer_tankerId_fkey" FOREIGN KEY ("tankerId") REFERENCES "Tanker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentDecision" ADD CONSTRAINT "AssignmentDecision_jobOfferId_fkey" FOREIGN KEY ("jobOfferId") REFERENCES "JobOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentDecision" ADD CONSTRAINT "AssignmentDecision_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentDecision" ADD CONSTRAINT "AssignmentDecision_tankerId_fkey" FOREIGN KEY ("tankerId") REFERENCES "Tanker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

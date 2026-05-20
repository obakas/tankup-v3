CREATE TYPE "OperationalAlertSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

CREATE TABLE "DeliveryAlert" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" "OperationalAlertSeverity" NOT NULL,
    "metadata" JSONB,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryAlert_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DeliveryAlert_deliveryId_type_resolvedAt_idx" ON "DeliveryAlert"("deliveryId", "type", "resolvedAt");

ALTER TABLE "DeliveryAlert" ADD CONSTRAINT "DeliveryAlert_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

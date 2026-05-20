CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP');

CREATE TYPE "NotificationCategory" AS ENUM ('TRANSACTIONAL', 'OPERATIONAL', 'ALERT', 'ESCALATION');

CREATE TYPE "NotificationPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'CRITICAL');

CREATE TYPE "NotificationStatus" AS ENUM ('UNREAD', 'READ');

CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "recipientActorType" "ActorType" NOT NULL,
    "recipientActorId" TEXT,
    "recipientKey" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'IN_APP',
    "category" "NotificationCategory" NOT NULL,
    "priority" "NotificationPriority" NOT NULL DEFAULT 'NORMAL',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "relatedEntityType" TEXT NOT NULL,
    "relatedEntityId" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'UNREAD',
    "metadata" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deliveryId" TEXT,
    "sourceEventId" TEXT NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Notification_sourceEventId_recipientKey_key" ON "Notification"("sourceEventId", "recipientKey");

CREATE INDEX "Notification_recipientKey_status_createdAt_idx" ON "Notification"("recipientKey", "status", "createdAt");

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_sourceEventId_fkey" FOREIGN KEY ("sourceEventId") REFERENCES "DeliveryEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

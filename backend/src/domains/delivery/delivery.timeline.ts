import { type ActorType, type DeliveryStatus, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.ts";
import { DeliveryNotFoundError } from "./delivery.errors.ts";

type DeliveryTimelineEntrySource = "EVENT" | "AUDIT" | "NOTIFICATION";

type DeliveryTimelineDelivery = {
  id: string;
  status: DeliveryStatus;
  customerId: string | null;
  driverId: string | null;
  tankerId: string | null;
  siteId: string | null;
  otpVerifiedAt: Date | null;
  otpAttemptCount: number;
  createdAt: Date;
  updatedAt: Date;
};

export type DeliveryTimelineEntry = {
  timestamp: string;
  source: DeliveryTimelineEntrySource;
  type: string;
  actorType: ActorType | null;
  actorId: string | null;
  message: string;
  metadata: Prisma.JsonValue;
};

export type DeliveryTimeline = {
  delivery: DeliveryTimelineDelivery;
  timeline: DeliveryTimelineEntry[];
};

export async function getDeliveryTimeline(
  deliveryId: string
): Promise<DeliveryTimeline> {
  const delivery = await prisma.delivery.findUnique({
    where: { id: deliveryId },
    select: {
      id: true,
      status: true,
      customerId: true,
      driverId: true,
      tankerId: true,
      siteId: true,
      otpVerifiedAt: true,
      otpAttemptCount: true,
      createdAt: true,
      updatedAt: true,
      events: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          type: true,
          actorType: true,
          actorId: true,
          metadata: true,
          createdAt: true,
        },
      },
      auditLogs: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          action: true,
          actorType: true,
          actorId: true,
          entityType: true,
          entityId: true,
          reason: true,
          before: true,
          after: true,
          metadata: true,
          createdAt: true,
        },
      },
      notifications: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          recipientActorType: true,
          recipientActorId: true,
          recipientKey: true,
          channel: true,
          category: true,
          priority: true,
          title: true,
          message: true,
          relatedEntityType: true,
          relatedEntityId: true,
          status: true,
          metadata: true,
          readAt: true,
          sourceEventId: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });

  if (!delivery) {
    throw new DeliveryNotFoundError(deliveryId);
  }

  const eventEntries: DeliveryTimelineEntry[] = delivery.events.map((event) => ({
    timestamp: event.createdAt.toISOString(),
    source: "EVENT",
    type: event.type,
    actorType: event.actorType,
    actorId: event.actorId,
    message: humanizeTimelineType(event.type),
    metadata: {
      id: event.id,
      deliveryId: delivery.id,
      ...metadataObject(event.metadata),
    },
  }));

  const auditEntries: DeliveryTimelineEntry[] = delivery.auditLogs.map(
    (auditLog) => ({
      timestamp: auditLog.createdAt.toISOString(),
      source: "AUDIT",
      type: auditLog.action,
      actorType: auditLog.actorType,
      actorId: auditLog.actorId,
      message: getAuditLogMessage(auditLog.action, auditLog.reason),
      metadata: {
        id: auditLog.id,
        entityType: auditLog.entityType,
        entityId: auditLog.entityId,
        before: sanitizeJson(auditLog.before),
        after: sanitizeJson(auditLog.after),
        reason: auditLog.reason,
        ...metadataObject(auditLog.metadata),
      },
    })
  );

  const notificationEntries: DeliveryTimelineEntry[] = delivery.notifications.map(
    (notification) => ({
      timestamp: notification.createdAt.toISOString(),
      source: "NOTIFICATION",
      type: notification.category,
      actorType: notification.recipientActorType,
      actorId: notification.recipientActorId,
      message: notification.message,
      metadata: {
        id: notification.id,
        recipientKey: notification.recipientKey,
        channel: notification.channel,
        category: notification.category,
        priority: notification.priority,
        title: notification.title,
        relatedEntityType: notification.relatedEntityType,
        relatedEntityId: notification.relatedEntityId,
        status: notification.status,
        readAt: notification.readAt?.toISOString() ?? null,
        sourceEventId: notification.sourceEventId,
        updatedAt: notification.updatedAt.toISOString(),
        ...metadataObject(notification.metadata),
      },
    })
  );

  return {
    delivery: {
      id: delivery.id,
      status: delivery.status,
      customerId: delivery.customerId,
      driverId: delivery.driverId,
      tankerId: delivery.tankerId,
      siteId: delivery.siteId,
      otpVerifiedAt: delivery.otpVerifiedAt,
      otpAttemptCount: delivery.otpAttemptCount,
      createdAt: delivery.createdAt,
      updatedAt: delivery.updatedAt,
    },
    timeline: [...eventEntries, ...auditEntries, ...notificationEntries].sort(
      compareTimelineEntries
    ),
  };
}

function compareTimelineEntries(
  left: DeliveryTimelineEntry,
  right: DeliveryTimelineEntry
) {
  const timestampDelta =
    new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime();

  if (timestampDelta !== 0) {
    return timestampDelta;
  }

  return getSourceSortOrder(left.source) - getSourceSortOrder(right.source);
}

function getSourceSortOrder(source: DeliveryTimelineEntrySource) {
  if (source === "EVENT") {
    return 0;
  }

  if (source === "AUDIT") {
    return 1;
  }

  return 2;
}

function getAuditLogMessage(action: string, reason: string | null) {
  if (reason) {
    return `${humanizeTimelineType(action)}: ${reason}`;
  }

  return humanizeTimelineType(action);
}

function humanizeTimelineType(type: string) {
  return type
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function metadataObject(value: Prisma.JsonValue | null): Prisma.JsonObject {
  const sanitized = sanitizeJson(value);

  if (!sanitized || Array.isArray(sanitized) || typeof sanitized !== "object") {
    return {};
  }

  return sanitized;
}

function sanitizeJson(value: Prisma.JsonValue | null): Prisma.JsonValue {
  if (value === null) {
    return null;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeJson(item));
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      (Object.entries(value) as [string, Prisma.JsonValue][])
        .filter(([key]) => key !== "otpCode")
        .map(([key, item]) => [key, sanitizeJson(item)])
    );
  }

  return value;
}

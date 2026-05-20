import { type ActorType, type DeliveryStatus, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.ts";
import { DeliveryNotFoundError } from "./delivery.errors.ts";

type DeliveryTimelineEntryType = "event" | "audit_log";

type DeliveryEventTimelineRecord = {
  id: string;
  type: string;
  actorType: ActorType;
  actorId: string | null;
  metadata: Prisma.JsonValue;
  createdAt: Date;
};

type AuditLogTimelineRecord = {
  id: string;
  action: string;
  actorType: ActorType;
  actorId: string | null;
  entityType: string;
  entityId: string;
  before: Prisma.JsonValue;
  after: Prisma.JsonValue;
  reason: string | null;
  metadata: Prisma.JsonValue;
  createdAt: Date;
};

export type DeliveryTimelineEntry = {
  id: string;
  type: DeliveryTimelineEntryType;
  action: string;
  actorType: ActorType;
  actorId: string | null;
  entityType: string;
  entityId: string;
  before?: Prisma.JsonValue;
  after?: Prisma.JsonValue;
  reason: string | null;
  metadata: Prisma.JsonValue;
  createdAt: Date;
};

export type DeliveryTimeline = {
  deliveryId: string;
  currentStatus: DeliveryStatus;
  otpVerifiedAt: Date | null;
  deliveryEvents: DeliveryEventTimelineRecord[];
  auditLogs: AuditLogTimelineRecord[];
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
      otpVerifiedAt: true,
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
    },
  });

  if (!delivery) {
    throw new DeliveryNotFoundError(deliveryId);
  }

  const deliveryEvents: DeliveryEventTimelineRecord[] = delivery.events.map(
    (event) => ({
      id: event.id,
      type: event.type,
      actorType: event.actorType,
      actorId: event.actorId,
      metadata: sanitizeJson(event.metadata),
      createdAt: event.createdAt,
    })
  );

  const auditLogs: AuditLogTimelineRecord[] = delivery.auditLogs.map(
    (auditLog) => ({
      id: auditLog.id,
      action: auditLog.action,
      actorType: auditLog.actorType,
      actorId: auditLog.actorId,
      entityType: auditLog.entityType,
      entityId: auditLog.entityId,
      before: sanitizeJson(auditLog.before),
      after: sanitizeJson(auditLog.after),
      reason: auditLog.reason,
      metadata: sanitizeJson(auditLog.metadata),
      createdAt: auditLog.createdAt,
    })
  );

  const eventEntries: DeliveryTimelineEntry[] = deliveryEvents.map((event) => ({
    id: event.id,
    type: "event",
    action: event.type,
    actorType: event.actorType,
    actorId: event.actorId,
    entityType: "delivery",
    entityId: delivery.id,
    reason: null,
    metadata: event.metadata,
    createdAt: event.createdAt,
  }));

  const auditEntries: DeliveryTimelineEntry[] = auditLogs.map((auditLog) => ({
    id: auditLog.id,
    type: "audit_log",
    action: auditLog.action,
    actorType: auditLog.actorType,
    actorId: auditLog.actorId,
    entityType: "delivery",
    entityId: auditLog.entityId,
    before: auditLog.before,
    after: auditLog.after,
    reason: auditLog.reason,
    metadata: auditLog.metadata,
    createdAt: auditLog.createdAt,
  }));

  return {
    deliveryId: delivery.id,
    currentStatus: delivery.status,
    otpVerifiedAt: delivery.otpVerifiedAt,
    deliveryEvents,
    auditLogs,
    timeline: [...eventEntries, ...auditEntries].sort(compareTimelineEntries),
  };
}

function compareTimelineEntries(
  left: DeliveryTimelineEntry,
  right: DeliveryTimelineEntry
) {
  const createdAtDelta = left.createdAt.getTime() - right.createdAt.getTime();

  if (createdAtDelta !== 0) {
    return createdAtDelta;
  }

  if (left.type === right.type) {
    return left.id.localeCompare(right.id);
  }

  return left.type === "event" ? -1 : 1;
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

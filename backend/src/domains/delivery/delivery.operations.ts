import { type ActorType, DeliveryStatus, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.ts";
import { DeliveryNotFoundError } from "./delivery.errors.ts";
import {
  detectDeliveryAlertCandidates,
  type DeliveryAlertCandidate,
} from "./delivery.alerts.ts";
import { DeliveryEventType } from "./delivery.events.ts";

type OperationsEvent = {
  id: string;
  type: string;
  actorType: ActorType;
  actorId: string | null;
  metadata: Prisma.JsonValue;
  createdAt: string;
};

type OperationsAuditLog = {
  id: string;
  action: string;
  actorType: ActorType;
  actorId: string | null;
  reason: string | null;
  metadata: Prisma.JsonValue;
  createdAt: string;
};

type OperationsAlert = {
  id: string;
  type: string;
  severity: string;
  metadata: Prisma.JsonValue;
  createdAt: string;
};

type OperationsRiskFlag = {
  type: string;
  severity: string;
  message: string;
};

export type DeliveryOperationsView = {
  delivery: {
    id: string;
    status: DeliveryStatus;
    customerId: string | null;
    driverId: string | null;
    tankerId: string | null;
    siteId: string | null;
  };
  currentStatusAge: {
    startedAt: string;
    ageMinutes: number;
  };
  latestEvent: OperationsEvent | null;
  latestAuditLog: OperationsAuditLog | null;
  otp: {
    state: "NOT_GENERATED" | "PENDING" | "EXPIRED" | "VERIFIED";
    expiresAt: string | null;
    verifiedAt: string | null;
    verifiedByActorType: ActorType | null;
    verifiedByActorId: string | null;
    attemptCount: number;
  };
  alerts: {
    unresolved: OperationsAlert[];
    candidates: DeliveryAlertCandidate[];
  };
  riskFlags: OperationsRiskFlag[];
  suggestedOperatorAction: string;
  generatedAt: string;
};

export type ListOperationsDeliveriesInput = {
  status?: DeliveryStatus;
  limit: number;
  search?: string;
};

export type OperationsDeliveryListItem = {
  id: string;
  status: DeliveryStatus;
  identifiers: {
    customerId: string | null;
    orderId: string | null;
    requestId: string | null;
    driverId: string | null;
    tankerId: string | null;
    siteId: string | null;
  };
  volumeLitres: number | null;
  createdAt: string;
  updatedAt: string;
  lastEvent: OperationsEvent | null;
  activeAlertsCount: number;
};

export type OperationsDeliveriesList = {
  generatedAt: string;
  filters: {
    status: DeliveryStatus | null;
    limit: number;
    search: string | null;
  };
  deliveries: OperationsDeliveryListItem[];
};

export async function listOperationsDeliveries(
  input: ListOperationsDeliveriesInput
): Promise<OperationsDeliveriesList> {
  const now = new Date();
  const search = input.search?.trim() || null;
  const where: Prisma.DeliveryWhereInput = {
    ...(input.status ? { status: input.status } : {}),
    ...(search
      ? {
          OR: [
            { id: { contains: search, mode: "insensitive" } },
            { customerId: { contains: search, mode: "insensitive" } },
            { driverId: { contains: search, mode: "insensitive" } },
            { tankerId: { contains: search, mode: "insensitive" } },
            { siteId: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const deliveries = await prisma.delivery.findMany({
    where,
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    take: input.limit,
    select: {
      id: true,
      status: true,
      customerId: true,
      driverId: true,
      tankerId: true,
      siteId: true,
      createdAt: true,
      updatedAt: true,
      otpVerifiedAt: true,
      otpAttemptCount: true,
      events: {
        orderBy: { createdAt: "desc" },
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
        orderBy: { createdAt: "desc" },
        select: {
          action: true,
          actorType: true,
          actorId: true,
          reason: true,
          metadata: true,
          createdAt: true,
        },
      },
      alerts: {
        where: { resolvedAt: null },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          type: true,
          severity: true,
          metadata: true,
          createdAt: true,
          resolvedAt: true,
        },
      },
    },
  });

  return {
    generatedAt: now.toISOString(),
    filters: {
      status: input.status ?? null,
      limit: input.limit,
      search,
    },
    deliveries: deliveries.map((delivery) => {
      const candidateAlerts = detectDeliveryAlertCandidates(delivery, now);

      return {
        id: delivery.id,
        status: delivery.status,
        identifiers: {
          customerId: delivery.customerId,
          orderId: null,
          requestId: null,
          driverId: delivery.driverId,
          tankerId: delivery.tankerId,
          siteId: delivery.siteId,
        },
        volumeLitres: getDeliveryVolumeLitres(delivery.events),
        createdAt: delivery.createdAt.toISOString(),
        updatedAt: delivery.updatedAt.toISOString(),
        lastEvent: delivery.events[0] ? formatEvent(delivery.events[0]) : null,
        activeAlertsCount: getActiveAlertsCount(delivery.alerts, candidateAlerts),
      };
    }),
  };
}

export async function getDeliveryOperationsView(
  deliveryId: string
): Promise<DeliveryOperationsView> {
  const now = new Date();
  const delivery = await prisma.delivery.findUnique({
    where: { id: deliveryId },
    select: {
      id: true,
      status: true,
      customerId: true,
      driverId: true,
      tankerId: true,
      siteId: true,
      otpExpiresAt: true,
      otpVerifiedAt: true,
      otpVerifiedByActorType: true,
      otpVerifiedByActorId: true,
      otpAttemptCount: true,
      createdAt: true,
      updatedAt: true,
      events: {
        orderBy: { createdAt: "desc" },
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
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          action: true,
          actorType: true,
          actorId: true,
          reason: true,
          metadata: true,
          createdAt: true,
        },
      },
      alerts: {
        where: { resolvedAt: null },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          type: true,
          severity: true,
          metadata: true,
          createdAt: true,
          resolvedAt: true,
        },
      },
    },
  });

  if (!delivery) {
    throw new DeliveryNotFoundError(deliveryId);
  }

  const statusStartedAt = getStatusStartedAt(delivery);
  const candidateAlerts = detectDeliveryAlertCandidates(delivery, now);
  const riskFlags = buildRiskFlags(candidateAlerts);

  return {
    delivery: {
      id: delivery.id,
      status: delivery.status,
      customerId: delivery.customerId,
      driverId: delivery.driverId,
      tankerId: delivery.tankerId,
      siteId: delivery.siteId,
    },
    currentStatusAge: {
      startedAt: statusStartedAt.toISOString(),
      ageMinutes: getElapsedMinutes(statusStartedAt, now),
    },
    latestEvent: delivery.events[0] ? formatEvent(delivery.events[0]) : null,
    latestAuditLog: delivery.auditLogs[0]
      ? formatAuditLog(delivery.auditLogs[0])
      : null,
    otp: {
      state: getOtpState(delivery, now),
      expiresAt: delivery.otpExpiresAt?.toISOString() ?? null,
      verifiedAt: delivery.otpVerifiedAt?.toISOString() ?? null,
      verifiedByActorType: delivery.otpVerifiedByActorType,
      verifiedByActorId: delivery.otpVerifiedByActorId,
      attemptCount: delivery.otpAttemptCount,
    },
    alerts: {
      unresolved: delivery.alerts.map((alert) => ({
        id: alert.id,
        type: alert.type,
        severity: alert.severity,
        metadata: sanitizeJson(alert.metadata),
        createdAt: alert.createdAt.toISOString(),
      })),
      candidates: candidateAlerts,
    },
    riskFlags,
    suggestedOperatorAction: getSuggestedOperatorAction(
      delivery.status,
      candidateAlerts
    ),
    generatedAt: now.toISOString(),
  };
}

function formatEvent(event: {
  id: string;
  type: string;
  actorType: ActorType;
  actorId: string | null;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
}): OperationsEvent {
  return {
    id: event.id,
    type: event.type,
    actorType: event.actorType,
    actorId: event.actorId,
    metadata: sanitizeJson(event.metadata),
    createdAt: event.createdAt.toISOString(),
  };
}

function formatAuditLog(auditLog: {
  id: string;
  action: string;
  actorType: ActorType;
  actorId: string | null;
  reason: string | null;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
}): OperationsAuditLog {
  return {
    id: auditLog.id,
    action: auditLog.action,
    actorType: auditLog.actorType,
    actorId: auditLog.actorId,
    reason: auditLog.reason,
    metadata: sanitizeJson(auditLog.metadata),
    createdAt: auditLog.createdAt.toISOString(),
  };
}

function getOtpState(
  delivery: {
    otpExpiresAt: Date | null;
    otpVerifiedAt: Date | null;
  },
  now: Date
) {
  if (delivery.otpVerifiedAt) {
    return "VERIFIED";
  }

  if (!delivery.otpExpiresAt) {
    return "NOT_GENERATED";
  }

  if (delivery.otpExpiresAt.getTime() <= now.getTime()) {
    return "EXPIRED";
  }

  return "PENDING";
}

function buildRiskFlags(alerts: DeliveryAlertCandidate[]) {
  return alerts.map((alert) => ({
    type: alert.type,
    severity: alert.severity,
    message: alert.message,
  }));
}

function getActiveAlertsCount(
  unresolvedAlerts: { type: string }[],
  candidateAlerts: DeliveryAlertCandidate[]
) {
  return new Set([
    ...unresolvedAlerts.map((alert) => alert.type),
    ...candidateAlerts.map((alert) => alert.type),
  ]).size;
}

function getDeliveryVolumeLitres(
  events: {
    type: string;
    metadata: Prisma.JsonValue | null;
  }[]
) {
  for (const event of events) {
    const metadata = metadataObject(event.metadata);
    const measurement = metadataObject(metadata.measurement ?? null);
    const volume =
      getJsonNumber(measurement.measuredVolumeLiters) ??
      getJsonNumber(measurement.estimatedDeliveredLitres) ??
      getJsonNumber(measurement.volumeLitres) ??
      getJsonNumber(metadata.measuredVolumeLiters) ??
      getJsonNumber(metadata.estimatedDeliveredLitres) ??
      getJsonNumber(metadata.volumeLitres);

    if (volume !== null) {
      return volume;
    }
  }

  return null;
}

function getJsonNumber(value: Prisma.JsonValue | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function metadataObject(value: Prisma.JsonValue | null): Prisma.JsonObject {
  const sanitized = sanitizeJson(value);

  if (!sanitized || Array.isArray(sanitized) || typeof sanitized !== "object") {
    return {};
  }

  return sanitized;
}

function getSuggestedOperatorAction(
  status: DeliveryStatus,
  alerts: DeliveryAlertCandidate[]
) {
  const criticalAlert = alerts.find((alert) => alert.severity === "CRITICAL");
  if (criticalAlert) {
    return "Escalate to admin review immediately.";
  }

  const highAlert = alerts.find((alert) => alert.severity === "HIGH");
  if (highAlert) {
    return "Contact driver or fleet head and capture an operational update.";
  }

  if (status === DeliveryStatus.AWAITING_OTP) {
    return "Monitor OTP confirmation and prepare dispute handling if customer refuses OTP.";
  }

  if (status === DeliveryStatus.SKIPPED || status === DeliveryStatus.FAILED) {
    return "Review event and audit evidence before closing operations follow-up.";
  }

  return "Continue monitoring delivery progress.";
}

function getStatusStartedAt(delivery: {
  status: DeliveryStatus;
  createdAt: Date;
  updatedAt: Date;
  events: {
    type: string;
    createdAt: Date;
  }[];
}) {
  const entryEventType = getStatusEntryEventType(delivery.status);

  if (!entryEventType) {
    return delivery.updatedAt;
  }

  return (
    delivery.events.find((event) => event.type === entryEventType)?.createdAt ??
    delivery.createdAt
  );
}

function getStatusEntryEventType(status: DeliveryStatus) {
  if (status === DeliveryStatus.LOADING) {
    return DeliveryEventType.LOADING_STARTED;
  }

  if (status === DeliveryStatus.EN_ROUTE) {
    return DeliveryEventType.DRIVER_EN_ROUTE;
  }

  if (status === DeliveryStatus.ARRIVED) {
    return DeliveryEventType.DRIVER_ARRIVED;
  }

  if (status === DeliveryStatus.MEASURING) {
    return DeliveryEventType.MEASUREMENT_STARTED;
  }

  if (status === DeliveryStatus.AWAITING_OTP) {
    return DeliveryEventType.MEASUREMENT_COMPLETED;
  }

  if (status === DeliveryStatus.COMPLETED) {
    return DeliveryEventType.DELIVERY_COMPLETED;
  }

  if (status === DeliveryStatus.FAILED) {
    return DeliveryEventType.DELIVERY_FAILED;
  }

  if (status === DeliveryStatus.SKIPPED) {
    return DeliveryEventType.DELIVERY_SKIPPED;
  }

  return null;
}

function getElapsedMinutes(startedAt: Date, now: Date) {
  return Math.floor((now.getTime() - startedAt.getTime()) / 60_000);
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

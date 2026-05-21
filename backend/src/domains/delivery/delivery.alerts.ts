import { ActorType, DeliveryStatus, Prisma } from "@prisma/client";

import { eventBus } from "../../events/eventBus.ts";
import { prisma } from "../../lib/prisma.ts";
import { createAuditLog } from "../audit/audit.service.ts";
import { DeliveryEventType } from "./delivery.events.ts";

const DeliveryAlertCandidateType = {
  LOADING_TOO_LONG: "LOADING_TOO_LONG",
  EN_ROUTE_TOO_LONG: "EN_ROUTE_TOO_LONG",
  ARRIVED_NOT_MEASURING: "ARRIVED_NOT_MEASURING",
  MEASURING_TOO_LONG: "MEASURING_TOO_LONG",
  AWAITING_OTP_TOO_LONG: "AWAITING_OTP_TOO_LONG",
  REPEATED_OTP_FAILURES: "REPEATED_OTP_FAILURES",
  SKIPPED_SUSPICIOUS: "SKIPPED_SUSPICIOUS",
} as const;

export type DeliveryAlertCandidateType =
  (typeof DeliveryAlertCandidateType)[keyof typeof DeliveryAlertCandidateType];

export type DeliveryAlertSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

type JsonValue = Prisma.JsonValue;
type JsonObject = Prisma.InputJsonObject;

const ALERT_THRESHOLDS = {
  loadingTooLongMinutes: 60,
  enRouteTooLongMinutes: 120,
  arrivedNotMeasuringMinutes: 30,
  measuringTooLongMinutes: 45,
  awaitingOtpTooLongMinutes: 30,
  repeatedOtpFailures: 3,
} as const;

export type DeliveryAlertCandidate = {
  deliveryId: string;
  status: DeliveryStatus;
  type: DeliveryAlertCandidateType;
  severity: DeliveryAlertSeverity;
  ageMinutes: number;
  message: string;
  metadata: JsonObject;
};

export type CreatedDeliveryAlertCandidate = DeliveryAlertCandidate & {
  eventId: string;
  createdAt: Date;
};

export type CheckDeliveryAlertsResult = {
  alertsCreated: number;
  alerts: CreatedDeliveryAlertCandidate[];
};

export type ListDeliveryOperationalAlertsResult = {
  generatedAt: string;
  alerts: DeliveryAlertCandidate[];
};

type AlertDeliverySnapshot = {
  id: string;
  status: DeliveryStatus;
  customerId?: string | null;
  driverId?: string | null;
  tankerId?: string | null;
  siteId?: string | null;
  createdAt: Date;
  updatedAt: Date;
  otpVerifiedAt: Date | null;
  otpAttemptCount: number;
  events: {
    type: string;
    actorType?: ActorType;
    actorId?: string | null;
    metadata?: JsonValue;
    createdAt: Date;
  }[];
  auditLogs?: {
    action: string;
    actorType: ActorType;
    actorId: string | null;
    reason: string | null;
    metadata: JsonValue;
    createdAt: Date;
  }[];
  alerts?: {
    id: string;
    type: string;
    severity: DeliveryAlertSeverity;
    metadata: JsonValue;
    createdAt: Date;
    resolvedAt: Date | null;
  }[];
};

const ALERT_SCAN_STATUSES = [
  DeliveryStatus.LOADING,
  DeliveryStatus.EN_ROUTE,
  DeliveryStatus.ARRIVED,
  DeliveryStatus.MEASURING,
  DeliveryStatus.AWAITING_OTP,
] as const;

const ALERT_LIST_SCAN_STATUSES = [
  ...ALERT_SCAN_STATUSES,
  DeliveryStatus.SKIPPED,
] as const;

const SEVERITY_SORT_ORDER: Record<DeliveryAlertSeverity, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

export async function checkDeliveryAlerts(): Promise<CheckDeliveryAlertsResult> {
  const now = new Date();
  const deliveries = await prisma.delivery.findMany({
    where: {
      status: {
        in: [...ALERT_SCAN_STATUSES],
      },
    },
    select: {
      id: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      otpVerifiedAt: true,
      otpAttemptCount: true,
      events: {
        orderBy: { createdAt: "desc" },
        select: {
          type: true,
          actorType: true,
          actorId: true,
          metadata: true,
          createdAt: true,
        },
      },
    },
  });

  const candidates = deliveries.flatMap((delivery) =>
    detectDeliveryAlertCandidates(delivery, now)
  );

  const createdAlerts: CreatedDeliveryAlertCandidate[] = [];

  for (const candidate of candidates) {
    const alert = await recordDeliveryAlertCandidate(candidate);

    if (alert) {
      createdAlerts.push(alert);
    }
  }

  return {
    alertsCreated: createdAlerts.length,
    alerts: createdAlerts,
  };
}

export async function listDeliveryOperationalAlertCandidates(): Promise<ListDeliveryOperationalAlertsResult> {
  const now = new Date();
  const deliveries = await prisma.delivery.findMany({
    where: {
      OR: [
        {
          status: {
            in: [...ALERT_LIST_SCAN_STATUSES],
          },
        },
        {
          otpAttemptCount: {
            gte: ALERT_THRESHOLDS.repeatedOtpFailures,
          },
        },
      ],
    },
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
        where: {
          resolvedAt: null,
        },
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

  const alerts = deliveries
    .flatMap((delivery) => detectDeliveryAlertCandidates(delivery, now))
    .sort(compareAlertCandidates);

  return {
    generatedAt: now.toISOString(),
    alerts,
  };
}

export function detectDeliveryAlertCandidates(
  delivery: AlertDeliverySnapshot,
  now = new Date()
): DeliveryAlertCandidate[] {
  const statusStartedAt = getStatusStartedAt(delivery);
  const minutesInStatus = getElapsedMinutes(statusStartedAt, now);
  const alerts: DeliveryAlertCandidate[] = [];

  if (
    delivery.status === DeliveryStatus.LOADING &&
    minutesInStatus >= ALERT_THRESHOLDS.loadingTooLongMinutes
  ) {
    alerts.push(
      buildDurationCandidate({
        deliveryId: delivery.id,
        type: DeliveryAlertCandidateType.LOADING_TOO_LONG,
        severity: "MEDIUM",
        ageMinutes: minutesInStatus,
        message: "Delivery has been loading longer than expected.",
        status: delivery.status,
        statusStartedAt,
        minutesInStatus,
        thresholdMinutes: ALERT_THRESHOLDS.loadingTooLongMinutes,
      })
    );
  }

  if (
    delivery.status === DeliveryStatus.EN_ROUTE &&
    minutesInStatus >= ALERT_THRESHOLDS.enRouteTooLongMinutes
  ) {
    alerts.push(
      buildDurationCandidate({
        deliveryId: delivery.id,
        type: DeliveryAlertCandidateType.EN_ROUTE_TOO_LONG,
        severity: "HIGH",
        ageMinutes: minutesInStatus,
        message: "Delivery has been en route longer than expected.",
        status: delivery.status,
        statusStartedAt,
        minutesInStatus,
        thresholdMinutes: ALERT_THRESHOLDS.enRouteTooLongMinutes,
      })
    );
  }

  if (
    delivery.status === DeliveryStatus.ARRIVED &&
    minutesInStatus >= ALERT_THRESHOLDS.arrivedNotMeasuringMinutes
  ) {
    alerts.push(
      buildDurationCandidate({
        deliveryId: delivery.id,
        type: DeliveryAlertCandidateType.ARRIVED_NOT_MEASURING,
        severity: "MEDIUM",
        ageMinutes: minutesInStatus,
        message: "Driver arrived but measurement has not started.",
        status: delivery.status,
        statusStartedAt,
        minutesInStatus,
        thresholdMinutes: ALERT_THRESHOLDS.arrivedNotMeasuringMinutes,
      })
    );
  }

  if (
    delivery.status === DeliveryStatus.MEASURING &&
    minutesInStatus >= ALERT_THRESHOLDS.measuringTooLongMinutes
  ) {
    alerts.push(
      buildDurationCandidate({
        deliveryId: delivery.id,
        type: DeliveryAlertCandidateType.MEASURING_TOO_LONG,
        severity: "HIGH",
        ageMinutes: minutesInStatus,
        message: "Measurement is taking longer than expected.",
        status: delivery.status,
        statusStartedAt,
        minutesInStatus,
        thresholdMinutes: ALERT_THRESHOLDS.measuringTooLongMinutes,
      })
    );
  }

  if (
    delivery.status === DeliveryStatus.AWAITING_OTP &&
    delivery.otpVerifiedAt === null &&
    minutesInStatus >= ALERT_THRESHOLDS.awaitingOtpTooLongMinutes
  ) {
    alerts.push(
      buildDurationCandidate({
        deliveryId: delivery.id,
        type: DeliveryAlertCandidateType.AWAITING_OTP_TOO_LONG,
        severity: "HIGH",
        ageMinutes: minutesInStatus,
        message: "Delivery is awaiting OTP confirmation longer than expected.",
        status: delivery.status,
        statusStartedAt,
        minutesInStatus,
        thresholdMinutes: ALERT_THRESHOLDS.awaitingOtpTooLongMinutes,
      })
    );
  }

  if (delivery.otpAttemptCount >= ALERT_THRESHOLDS.repeatedOtpFailures) {
    alerts.push({
      deliveryId: delivery.id,
      status: delivery.status,
      type: DeliveryAlertCandidateType.REPEATED_OTP_FAILURES,
      severity: "CRITICAL",
      ageMinutes: minutesInStatus,
      message: "Delivery has repeated failed OTP attempts.",
      metadata: {
        status: delivery.status,
        otpAttemptCount: delivery.otpAttemptCount,
        failedOtpEventCount: getFailedOtpEventCount(delivery.events),
        thresholdAttempts: ALERT_THRESHOLDS.repeatedOtpFailures,
      },
    });
  }

  const skippedSuspicion = detectSkippedSuspicion(delivery, now);

  if (skippedSuspicion) {
    alerts.push(skippedSuspicion);
  }

  return alerts.map((alert) => ({
    ...alert,
    metadata: {
      ...alert.metadata,
      customerId: delivery.customerId ?? null,
      driverId: delivery.driverId ?? null,
      tankerId: delivery.tankerId ?? null,
      siteId: delivery.siteId ?? null,
      existingDeliveryAlerts: getExistingDeliveryAlertIds(delivery, alert.type),
    },
  }));
}

function detectSkippedSuspicion(
  delivery: AlertDeliverySnapshot,
  now: Date
): DeliveryAlertCandidate | null {
  if (delivery.status !== DeliveryStatus.SKIPPED) {
    return null;
  }

  const skippedEvent = delivery.events.find(
    (event) => event.type === DeliveryEventType.DELIVERY_SKIPPED
  );
  const skippedAuditLog = delivery.auditLogs?.find(
    (auditLog) => auditLog.action === DeliveryEventType.DELIVERY_SKIPPED
  );
  const allowedActors: readonly ActorType[] = [
    ActorType.ADMIN,
    ActorType.SYSTEM,
    ActorType.FLEET_HEAD,
  ];
  const actorType = skippedEvent?.actorType ?? skippedAuditLog?.actorType ?? null;
  const reason =
    skippedAuditLog?.reason ??
    getMetadataString(skippedEvent?.metadata, "reason") ??
    getMetadataString(skippedAuditLog?.metadata, "reason");
  const suspicionReasons: string[] = [];

  if (!skippedEvent) {
    suspicionReasons.push("missing DELIVERY_SKIPPED event");
  }

  if (!skippedAuditLog) {
    suspicionReasons.push("missing DELIVERY_SKIPPED audit log");
  }

  if (!reason?.trim()) {
    suspicionReasons.push("missing skip reason");
  }

  if (actorType && !allowedActors.includes(actorType)) {
    suspicionReasons.push(`unexpected skip actor ${actorType}`);
  }

  if (suspicionReasons.length === 0) {
    return null;
  }

  const skippedAt =
    skippedEvent?.createdAt ?? skippedAuditLog?.createdAt ?? delivery.updatedAt;
  const severity = suspicionReasons.some(
    (item) =>
      item.includes("missing DELIVERY_SKIPPED") ||
      item.includes("unexpected skip actor")
  )
    ? "HIGH"
    : "MEDIUM";

  return {
    deliveryId: delivery.id,
    status: delivery.status,
    type: DeliveryAlertCandidateType.SKIPPED_SUSPICIOUS,
    severity,
    ageMinutes: getElapsedMinutes(skippedAt, now),
    message: "Delivery was skipped with suspicious or incomplete operational evidence.",
    metadata: {
      status: delivery.status,
      skippedAt: skippedAt.toISOString(),
      actorType,
      actorId: skippedEvent?.actorId ?? skippedAuditLog?.actorId ?? null,
      reason: reason ?? null,
      suspicionReasons,
    },
  };
}

function compareAlertCandidates(
  left: DeliveryAlertCandidate,
  right: DeliveryAlertCandidate
) {
  const severityDelta =
    SEVERITY_SORT_ORDER[left.severity] - SEVERITY_SORT_ORDER[right.severity];

  if (severityDelta !== 0) {
    return severityDelta;
  }

  const ageDelta = right.ageMinutes - left.ageMinutes;

  if (ageDelta !== 0) {
    return ageDelta;
  }

  return left.deliveryId.localeCompare(right.deliveryId);
}

function getExistingDeliveryAlertIds(
  delivery: AlertDeliverySnapshot,
  alertType: DeliveryAlertCandidateType
) {
  return (
    delivery.alerts
      ?.filter((alert) => alert.type === alertType && alert.resolvedAt === null)
      .map((alert) => ({
        id: alert.id,
        severity: alert.severity,
        createdAt: alert.createdAt.toISOString(),
      })) ?? []
  );
}

function getMetadataString(value: JsonValue | undefined, key: string) {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    return null;
  }

  const item = value[key];

  return typeof item === "string" ? item : null;
}

async function recordDeliveryAlertCandidate(alert: DeliveryAlertCandidate) {
  const result = await prisma.$transaction(async (tx) => {
    const existingEvent = await tx.deliveryEvent.findFirst({
      where: {
        deliveryId: alert.deliveryId,
        type: DeliveryEventType.DELIVERY_ALERT_CREATED,
        metadata: {
          path: ["alertType"],
          equals: alert.type,
        },
      },
    });

    if (existingEvent) {
      return null;
    }

    const metadata: JsonObject = {
      alertType: alert.type,
      severity: alert.severity,
      message: alert.message,
      details: alert.metadata,
    };

    const deliveryEvent = await tx.deliveryEvent.create({
      data: {
        deliveryId: alert.deliveryId,
        type: DeliveryEventType.DELIVERY_ALERT_CREATED,
        actorType: ActorType.SYSTEM,
        actorId: null,
        metadata,
      },
    });

    await createAuditLog(
      {
        actorType: ActorType.SYSTEM,
        action: DeliveryEventType.DELIVERY_ALERT_CREATED,
        entityType: "delivery",
        entityId: alert.deliveryId,
        deliveryId: alert.deliveryId,
        after: {
          type: alert.type,
          severity: alert.severity,
          message: alert.message,
          metadata: alert.metadata,
        },
        metadata,
      },
      tx
    );

    return {
      alert: {
        ...alert,
        eventId: deliveryEvent.id,
        createdAt: deliveryEvent.createdAt,
      },
      eventId: deliveryEvent.id,
    };
  });

  if (result) {
    eventBus.emit({
      type: DeliveryEventType.DELIVERY_ALERT_CREATED,
      data: {
        deliveryId: alert.deliveryId,
        eventId: result.eventId,
        alertType: result.alert.type,
        severity: result.alert.severity,
      },
    });
  }

  return result?.alert ?? null;
}

type DurationCandidateInput = {
  deliveryId: string;
  type: DeliveryAlertCandidateType;
  severity: DeliveryAlertSeverity;
  ageMinutes: number;
  message: string;
  status: DeliveryStatus;
  statusStartedAt: Date;
  minutesInStatus: number;
  thresholdMinutes: number;
};

function buildDurationCandidate({
  deliveryId,
  type,
  severity,
  ageMinutes,
  message,
  status,
  statusStartedAt,
  minutesInStatus,
  thresholdMinutes,
}: DurationCandidateInput): DeliveryAlertCandidate {
  return {
    deliveryId,
    status,
    type,
    severity,
    ageMinutes,
    message,
    metadata: {
      status,
      statusStartedAt: statusStartedAt.toISOString(),
      minutesInStatus,
      thresholdMinutes,
    },
  };
}

function getStatusStartedAt(delivery: AlertDeliverySnapshot) {
  const statusEntryEventType = getStatusEntryEventType(delivery.status);

  if (!statusEntryEventType) {
    return delivery.updatedAt;
  }

  return (
    delivery.events.find((event) => event.type === statusEntryEventType)
      ?.createdAt ?? delivery.createdAt
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

  return null;
}

function getElapsedMinutes(startedAt: Date, now: Date) {
  return Math.floor((now.getTime() - startedAt.getTime()) / 60_000);
}

function getFailedOtpEventCount(events: AlertDeliverySnapshot["events"]) {
  return events.filter(
    (event) => event.type === DeliveryEventType.DELIVERY_OTP_FAILED
  ).length;
}

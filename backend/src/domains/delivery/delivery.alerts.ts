import { ActorType, DeliveryStatus } from "@prisma/client";

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
} as const;

export type DeliveryAlertCandidateType =
  (typeof DeliveryAlertCandidateType)[keyof typeof DeliveryAlertCandidateType];

export type DeliveryAlertSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

type JsonObject = { [key: string]: JsonValue };

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
  type: DeliveryAlertCandidateType;
  severity: DeliveryAlertSeverity;
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

type AlertDeliverySnapshot = {
  id: string;
  status: DeliveryStatus;
  createdAt: Date;
  updatedAt: Date;
  otpVerifiedAt: Date | null;
  otpAttemptCount: number;
  events: {
    type: string;
    createdAt: Date;
  }[];
};

export async function checkDeliveryAlerts(): Promise<CheckDeliveryAlertsResult> {
  const now = new Date();
  const deliveries = await prisma.delivery.findMany({
    where: {
      status: {
        in: [
          DeliveryStatus.LOADING,
          DeliveryStatus.EN_ROUTE,
          DeliveryStatus.ARRIVED,
          DeliveryStatus.MEASURING,
          DeliveryStatus.AWAITING_OTP,
        ],
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
      type: DeliveryAlertCandidateType.REPEATED_OTP_FAILURES,
      severity: "CRITICAL",
      message: "Delivery has repeated failed OTP attempts.",
      metadata: {
        status: delivery.status,
        otpAttemptCount: delivery.otpAttemptCount,
        failedOtpEventCount: getFailedOtpEventCount(delivery.events),
        thresholdAttempts: ALERT_THRESHOLDS.repeatedOtpFailures,
      },
    });
  }

  return alerts;
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
  message,
  status,
  statusStartedAt,
  minutesInStatus,
  thresholdMinutes,
}: DurationCandidateInput): DeliveryAlertCandidate {
  return {
    deliveryId,
    type,
    severity,
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

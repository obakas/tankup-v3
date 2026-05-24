import "dotenv/config";
import {
  ActorType,
  DeliveryStatus,
  NotificationCategory,
  NotificationPriority,
  OperationalAlertSeverity,
  Prisma,
} from "@prisma/client";
import { prisma } from "../src/lib/prisma.ts";
import { DeliveryEventType } from "../src/domains/delivery/delivery.events.ts";

const SEED_PREFIX = "seed-delivery-scenario";

type ScenarioEventInput = {
  type: string;
  actorType: ActorType;
  actorId?: string | null;
  minutesAgo: number;
  metadata?: Prisma.InputJsonObject;
};

type ScenarioAuditInput = {
  action: string;
  actorType: ActorType;
  actorId?: string | null;
  minutesAgo: number;
  before?: Prisma.InputJsonObject;
  after?: Prisma.InputJsonObject;
  reason?: string | null;
  metadata?: Prisma.InputJsonObject;
};

type ScenarioAlertInput = {
  type: string;
  severity: OperationalAlertSeverity;
  minutesAgo: number;
  metadata?: Prisma.InputJsonObject;
};

type ScenarioNotificationInput = {
  sourceEventType: string;
  recipientActorType: ActorType;
  recipientActorId?: string | null;
  category: NotificationCategory;
  priority: NotificationPriority;
  title: string;
  message: string;
  minutesAgo: number;
};

type DeliveryScenario = {
  key: string;
  label: string;
  status: DeliveryStatus;
  createdMinutesAgo: number;
  updatedMinutesAgo: number;
  otpAttemptCount?: number;
  otpCode?: string | null;
  otpExpiresMinutesAgo?: number | null;
  otpVerifiedMinutesAgo?: number | null;
  otpVerifiedByActorType?: ActorType | null;
  otpVerifiedByActorId?: string | null;
  events: ScenarioEventInput[];
  audits: ScenarioAuditInput[];
  alerts?: ScenarioAlertInput[];
  notifications?: ScenarioNotificationInput[];
};

type ScenarioSummary = {
  key: string;
  label: string;
  deliveryId: string;
  status: DeliveryStatus;
};

const now = new Date();

async function main() {
  const clearedCount = await clearExistingSeedData();

  const summaries: ScenarioSummary[] = [];

  for (const scenario of buildScenarios()) {
    const summary = await createScenario(scenario);
    summaries.push(summary);
  }

  console.log(
    `Cleared ${clearedCount} existing demo delivery scenario${
      clearedCount === 1 ? "" : "s"
    }.`
  );
  console.log("Seeded delivery scenarios:");
  for (const summary of summaries) {
    console.log(
      `- ${summary.label}: ${summary.deliveryId} (${summary.status})`
    );
  }
  console.log("Seeded delivery scenario IDs:");
  console.log(JSON.stringify(groupSummariesByScenarioName(summaries), null, 2));
}

async function clearExistingSeedData() {
  const existing = await prisma.delivery.findMany({
    where: {
      siteId: {
        startsWith: `${SEED_PREFIX}:`,
      },
    },
    select: { id: true },
  });
  const deliveryIds = existing.map((delivery) => delivery.id);

  if (deliveryIds.length === 0) {
    return 0;
  }

  await prisma.$transaction([
    prisma.notification.deleteMany({
      where: {
        deliveryId: {
          in: deliveryIds,
        },
      },
    }),
    prisma.deliveryAlert.deleteMany({
      where: {
        deliveryId: {
          in: deliveryIds,
        },
      },
    }),
    prisma.auditLog.deleteMany({
      where: {
        deliveryId: {
          in: deliveryIds,
        },
      },
    }),
    prisma.deliveryEvent.deleteMany({
      where: {
        deliveryId: {
          in: deliveryIds,
        },
      },
    }),
    prisma.delivery.deleteMany({
      where: {
        id: {
          in: deliveryIds,
        },
      },
    }),
  ]);

  return deliveryIds.length;
}

async function createScenario(
  scenario: DeliveryScenario
): Promise<ScenarioSummary> {
  const delivery = await prisma.delivery.create({
    data: {
      status: scenario.status,
      customerId: `${SEED_PREFIX}:customer:${scenario.key}`,
      driverId: `${SEED_PREFIX}:driver:${scenario.key}`,
      tankerId: `${SEED_PREFIX}:tanker:${scenario.key}`,
      siteId: `${SEED_PREFIX}:site:${scenario.key}`,
      otpCode: scenario.otpCode ?? null,
      otpExpiresAt:
        scenario.otpExpiresMinutesAgo === undefined ||
        scenario.otpExpiresMinutesAgo === null
          ? null
          : minutesAgo(scenario.otpExpiresMinutesAgo),
      otpVerifiedAt:
        scenario.otpVerifiedMinutesAgo === undefined ||
        scenario.otpVerifiedMinutesAgo === null
          ? null
          : minutesAgo(scenario.otpVerifiedMinutesAgo),
      otpVerifiedByActorType: scenario.otpVerifiedByActorType ?? null,
      otpVerifiedByActorId: scenario.otpVerifiedByActorId ?? null,
      otpAttemptCount: scenario.otpAttemptCount ?? 0,
      createdAt: minutesAgo(scenario.createdMinutesAgo),
      updatedAt: minutesAgo(scenario.updatedMinutesAgo),
    },
  });

  const eventIdsByType = new Map<string, string>();

  for (const event of scenario.events) {
    const created = await prisma.deliveryEvent.create({
      data: {
        deliveryId: delivery.id,
        type: event.type,
        actorType: event.actorType,
        actorId: event.actorId ?? null,
        metadata: event.metadata ?? Prisma.JsonNull,
        createdAt: minutesAgo(event.minutesAgo),
      },
    });

    eventIdsByType.set(event.type, created.id);
  }

  for (const audit of scenario.audits) {
    await prisma.auditLog.create({
      data: {
        deliveryId: delivery.id,
        actorType: audit.actorType,
        actorId: audit.actorId ?? null,
        action: audit.action,
        entityType: "delivery",
        entityId: delivery.id,
        before: audit.before ?? Prisma.JsonNull,
        after: audit.after ?? Prisma.JsonNull,
        reason: audit.reason ?? null,
        metadata: audit.metadata ?? Prisma.JsonNull,
        createdAt: minutesAgo(audit.minutesAgo),
      },
    });
  }

  for (const alert of scenario.alerts ?? []) {
    await prisma.deliveryAlert.create({
      data: {
        deliveryId: delivery.id,
        type: alert.type,
        severity: alert.severity,
        metadata: alert.metadata ?? Prisma.JsonNull,
        createdAt: minutesAgo(alert.minutesAgo),
      },
    });
  }

  for (const notification of scenario.notifications ?? []) {
    const sourceEventId = eventIdsByType.get(notification.sourceEventType);

    if (!sourceEventId) {
      throw new Error(
        `Scenario ${scenario.key} notification references missing event ${notification.sourceEventType}`
      );
    }

    const recipientActorId =
      notification.recipientActorId ??
      getDefaultRecipientId(scenario.key, notification.recipientActorType);

    await prisma.notification.create({
      data: {
        recipientActorType: notification.recipientActorType,
        recipientActorId,
        recipientKey: `${notification.recipientActorType}:${
          recipientActorId ?? "GLOBAL"
        }`,
        category: notification.category,
        priority: notification.priority,
        title: notification.title,
        message: notification.message,
        relatedEntityType: "delivery",
        relatedEntityId: delivery.id,
        deliveryId: delivery.id,
        sourceEventId,
        metadata: {
          deliveryId: delivery.id,
          scenario: scenario.key,
          eventType: notification.sourceEventType,
        },
        createdAt: minutesAgo(notification.minutesAgo),
      },
    });
  }

  return {
    key: scenario.key,
    label: scenario.label,
    deliveryId: delivery.id,
    status: delivery.status,
  };
}

function groupSummariesByScenarioName(summaries: ScenarioSummary[]) {
  return Object.fromEntries(
    summaries.map((summary) => [
      summary.label,
      {
        key: summary.key,
        deliveryId: summary.deliveryId,
        status: summary.status,
      },
    ])
  );
}

function buildScenarios(): DeliveryScenario[] {
  return [
    {
      key: "healthy-delivery",
      label: "healthy delivery",
      status: DeliveryStatus.EN_ROUTE,
      createdMinutesAgo: 45,
      updatedMinutesAgo: 10,
      events: [
        transitionEvent(DeliveryEventType.DELIVERY_ASSIGNED, 40, {
          from: DeliveryStatus.CREATED,
          to: DeliveryStatus.ASSIGNED,
          actorType: ActorType.ADMIN,
        }),
        transitionEvent(DeliveryEventType.LOADING_STARTED, 35, {
          from: DeliveryStatus.ASSIGNED,
          to: DeliveryStatus.LOADING,
          actorType: ActorType.DRIVER,
        }),
        transitionEvent(DeliveryEventType.DRIVER_EN_ROUTE, 10, {
          from: DeliveryStatus.LOADING,
          to: DeliveryStatus.EN_ROUTE,
          actorType: ActorType.DRIVER,
        }),
      ],
      audits: [
        transitionAudit(DeliveryEventType.DELIVERY_ASSIGNED, 40, {
          from: DeliveryStatus.CREATED,
          to: DeliveryStatus.ASSIGNED,
          actorType: ActorType.ADMIN,
        }),
        transitionAudit(DeliveryEventType.LOADING_STARTED, 35, {
          from: DeliveryStatus.ASSIGNED,
          to: DeliveryStatus.LOADING,
          actorType: ActorType.DRIVER,
        }),
        transitionAudit(DeliveryEventType.DRIVER_EN_ROUTE, 10, {
          from: DeliveryStatus.LOADING,
          to: DeliveryStatus.EN_ROUTE,
          actorType: ActorType.DRIVER,
        }),
      ],
      notifications: [
        {
          sourceEventType: DeliveryEventType.DRIVER_EN_ROUTE,
          recipientActorType: ActorType.CUSTOMER,
          category: NotificationCategory.OPERATIONAL,
          priority: NotificationPriority.NORMAL,
          title: "Driver en route",
          message: "Your tanker is on the way.",
          minutesAgo: 9,
        },
      ],
    },
    {
      key: "stuck-loading",
      label: "stuck LOADING",
      status: DeliveryStatus.LOADING,
      createdMinutesAgo: 130,
      updatedMinutesAgo: 95,
      events: [
        transitionEvent(DeliveryEventType.DELIVERY_ASSIGNED, 125, {
          from: DeliveryStatus.CREATED,
          to: DeliveryStatus.ASSIGNED,
          actorType: ActorType.FLEET_HEAD,
        }),
        transitionEvent(DeliveryEventType.LOADING_STARTED, 95, {
          from: DeliveryStatus.ASSIGNED,
          to: DeliveryStatus.LOADING,
          actorType: ActorType.DRIVER,
        }),
      ],
      audits: [
        transitionAudit(DeliveryEventType.DELIVERY_ASSIGNED, 125, {
          from: DeliveryStatus.CREATED,
          to: DeliveryStatus.ASSIGNED,
          actorType: ActorType.FLEET_HEAD,
        }),
        transitionAudit(DeliveryEventType.LOADING_STARTED, 95, {
          from: DeliveryStatus.ASSIGNED,
          to: DeliveryStatus.LOADING,
          actorType: ActorType.DRIVER,
        }),
      ],
      alerts: [
        {
          type: "LOADING_TOO_LONG",
          severity: OperationalAlertSeverity.MEDIUM,
          minutesAgo: 20,
          metadata: {
            seeded: true,
            reason: "Driver has stayed at loading point past expected window.",
          },
        },
      ],
    },
    {
      key: "stuck-en-route",
      label: "stuck EN_ROUTE",
      status: DeliveryStatus.EN_ROUTE,
      createdMinutesAgo: 210,
      updatedMinutesAgo: 155,
      events: [
        transitionEvent(DeliveryEventType.LOADING_STARTED, 190, {
          from: DeliveryStatus.ASSIGNED,
          to: DeliveryStatus.LOADING,
          actorType: ActorType.DRIVER,
        }),
        transitionEvent(DeliveryEventType.DRIVER_EN_ROUTE, 155, {
          from: DeliveryStatus.LOADING,
          to: DeliveryStatus.EN_ROUTE,
          actorType: ActorType.DRIVER,
        }),
      ],
      audits: [
        transitionAudit(DeliveryEventType.LOADING_STARTED, 190, {
          from: DeliveryStatus.ASSIGNED,
          to: DeliveryStatus.LOADING,
          actorType: ActorType.DRIVER,
        }),
        transitionAudit(DeliveryEventType.DRIVER_EN_ROUTE, 155, {
          from: DeliveryStatus.LOADING,
          to: DeliveryStatus.EN_ROUTE,
          actorType: ActorType.DRIVER,
        }),
      ],
    },
    {
      key: "arrived-not-measuring",
      label: "ARRIVED but not MEASURING",
      status: DeliveryStatus.ARRIVED,
      createdMinutesAgo: 115,
      updatedMinutesAgo: 42,
      events: [
        transitionEvent(DeliveryEventType.DRIVER_EN_ROUTE, 80, {
          from: DeliveryStatus.LOADING,
          to: DeliveryStatus.EN_ROUTE,
          actorType: ActorType.DRIVER,
        }),
        transitionEvent(DeliveryEventType.DRIVER_ARRIVED, 42, {
          from: DeliveryStatus.EN_ROUTE,
          to: DeliveryStatus.ARRIVED,
          actorType: ActorType.DRIVER,
        }),
      ],
      audits: [
        transitionAudit(DeliveryEventType.DRIVER_EN_ROUTE, 80, {
          from: DeliveryStatus.LOADING,
          to: DeliveryStatus.EN_ROUTE,
          actorType: ActorType.DRIVER,
        }),
        transitionAudit(DeliveryEventType.DRIVER_ARRIVED, 42, {
          from: DeliveryStatus.EN_ROUTE,
          to: DeliveryStatus.ARRIVED,
          actorType: ActorType.DRIVER,
        }),
      ],
    },
    {
      key: "measuring-too-long",
      label: "MEASURING too long",
      status: DeliveryStatus.MEASURING,
      createdMinutesAgo: 135,
      updatedMinutesAgo: 68,
      events: [
        transitionEvent(DeliveryEventType.DRIVER_ARRIVED, 85, {
          from: DeliveryStatus.EN_ROUTE,
          to: DeliveryStatus.ARRIVED,
          actorType: ActorType.DRIVER,
        }),
        transitionEvent(DeliveryEventType.MEASUREMENT_STARTED, 68, {
          from: DeliveryStatus.ARRIVED,
          to: DeliveryStatus.MEASURING,
          actorType: ActorType.DRIVER,
        }),
      ],
      audits: [
        transitionAudit(DeliveryEventType.DRIVER_ARRIVED, 85, {
          from: DeliveryStatus.EN_ROUTE,
          to: DeliveryStatus.ARRIVED,
          actorType: ActorType.DRIVER,
        }),
        transitionAudit(DeliveryEventType.MEASUREMENT_STARTED, 68, {
          from: DeliveryStatus.ARRIVED,
          to: DeliveryStatus.MEASURING,
          actorType: ActorType.DRIVER,
        }),
      ],
    },
    {
      key: "awaiting-otp-too-long",
      label: "AWAITING_OTP too long",
      status: DeliveryStatus.AWAITING_OTP,
      createdMinutesAgo: 140,
      updatedMinutesAgo: 52,
      otpCode: "482913",
      otpExpiresMinutesAgo: 42,
      events: [
        transitionEvent(DeliveryEventType.MEASUREMENT_STARTED, 78, {
          from: DeliveryStatus.ARRIVED,
          to: DeliveryStatus.MEASURING,
          actorType: ActorType.DRIVER,
        }),
        transitionEvent(DeliveryEventType.MEASUREMENT_COMPLETED, 52, {
          from: DeliveryStatus.MEASURING,
          to: DeliveryStatus.AWAITING_OTP,
          actorType: ActorType.DRIVER,
        }),
        {
          type: DeliveryEventType.DELIVERY_OTP_GENERATED,
          actorType: ActorType.DRIVER,
          actorId: "seed-driver-awaiting-otp-too-long",
          minutesAgo: 51,
          metadata: {
            status: DeliveryStatus.AWAITING_OTP,
            expiresAt: minutesAgo(42).toISOString(),
            ttlMinutes: 10,
          },
        },
      ],
      audits: [
        transitionAudit(DeliveryEventType.MEASUREMENT_COMPLETED, 52, {
          from: DeliveryStatus.MEASURING,
          to: DeliveryStatus.AWAITING_OTP,
          actorType: ActorType.DRIVER,
        }),
      ],
    },
    {
      key: "repeated-otp-failures",
      label: "repeated OTP failures",
      status: DeliveryStatus.AWAITING_OTP,
      createdMinutesAgo: 90,
      updatedMinutesAgo: 12,
      otpCode: "771204",
      otpExpiresMinutesAgo: -3,
      otpAttemptCount: 3,
      events: [
        transitionEvent(DeliveryEventType.MEASUREMENT_COMPLETED, 20, {
          from: DeliveryStatus.MEASURING,
          to: DeliveryStatus.AWAITING_OTP,
          actorType: ActorType.DRIVER,
        }),
        otpFailedEvent(18, 1),
        otpFailedEvent(15, 2),
        otpFailedEvent(12, 3),
      ],
      audits: [
        transitionAudit(DeliveryEventType.MEASUREMENT_COMPLETED, 20, {
          from: DeliveryStatus.MEASURING,
          to: DeliveryStatus.AWAITING_OTP,
          actorType: ActorType.DRIVER,
        }),
        otpFailedAudit(18, 1),
        otpFailedAudit(15, 2),
        otpFailedAudit(12, 3),
      ],
      alerts: [
        {
          type: "REPEATED_OTP_FAILURES",
          severity: OperationalAlertSeverity.CRITICAL,
          minutesAgo: 10,
          metadata: {
            seeded: true,
            otpAttemptCount: 3,
          },
        },
      ],
    },
    {
      key: "suspicious-skipped",
      label: "suspicious SKIPPED",
      status: DeliveryStatus.SKIPPED,
      createdMinutesAgo: 75,
      updatedMinutesAgo: 25,
      events: [
        {
          type: DeliveryEventType.DELIVERY_SKIPPED,
          actorType: ActorType.DRIVER,
          actorId: "seed-driver-suspicious-skipped",
          minutesAgo: 25,
          metadata: {
            from: DeliveryStatus.EN_ROUTE,
            to: DeliveryStatus.SKIPPED,
            reason: null,
          },
        },
      ],
      audits: [],
    },
    {
      key: "completed-delivery",
      label: "completed delivery",
      status: DeliveryStatus.COMPLETED,
      createdMinutesAgo: 180,
      updatedMinutesAgo: 25,
      otpVerifiedMinutesAgo: 27,
      otpVerifiedByActorType: ActorType.CUSTOMER,
      otpVerifiedByActorId: "seed-customer-completed-delivery",
      events: [
        transitionEvent(DeliveryEventType.DRIVER_ARRIVED, 75, {
          from: DeliveryStatus.EN_ROUTE,
          to: DeliveryStatus.ARRIVED,
          actorType: ActorType.DRIVER,
        }),
        transitionEvent(DeliveryEventType.MEASUREMENT_STARTED, 55, {
          from: DeliveryStatus.ARRIVED,
          to: DeliveryStatus.MEASURING,
          actorType: ActorType.DRIVER,
        }),
        transitionEvent(DeliveryEventType.MEASUREMENT_COMPLETED, 35, {
          from: DeliveryStatus.MEASURING,
          to: DeliveryStatus.AWAITING_OTP,
          actorType: ActorType.DRIVER,
        }),
        {
          type: DeliveryEventType.DELIVERY_OTP_VERIFIED,
          actorType: ActorType.CUSTOMER,
          actorId: "seed-customer-completed-delivery",
          minutesAgo: 27,
          metadata: {
            verifiedAt: minutesAgo(27).toISOString(),
          },
        },
        transitionEvent(DeliveryEventType.DELIVERY_COMPLETED, 25, {
          from: DeliveryStatus.AWAITING_OTP,
          to: DeliveryStatus.COMPLETED,
          actorType: ActorType.CUSTOMER,
        }),
      ],
      audits: [
        transitionAudit(DeliveryEventType.DELIVERY_COMPLETED, 25, {
          from: DeliveryStatus.AWAITING_OTP,
          to: DeliveryStatus.COMPLETED,
          actorType: ActorType.CUSTOMER,
        }),
      ],
      notifications: [
        {
          sourceEventType: DeliveryEventType.DELIVERY_COMPLETED,
          recipientActorType: ActorType.CUSTOMER,
          category: NotificationCategory.TRANSACTIONAL,
          priority: NotificationPriority.NORMAL,
          title: "Delivery completed",
          message: "Your seeded delivery has been completed.",
          minutesAgo: 24,
        },
      ],
    },
    {
      key: "failed-delivery",
      label: "failed delivery",
      status: DeliveryStatus.FAILED,
      createdMinutesAgo: 160,
      updatedMinutesAgo: 30,
      events: [
        transitionEvent(DeliveryEventType.DRIVER_EN_ROUTE, 95, {
          from: DeliveryStatus.LOADING,
          to: DeliveryStatus.EN_ROUTE,
          actorType: ActorType.DRIVER,
        }),
        transitionEvent(DeliveryEventType.DELIVERY_FAILED, 30, {
          from: DeliveryStatus.EN_ROUTE,
          to: DeliveryStatus.FAILED,
          actorType: ActorType.FLEET_HEAD,
          reason: "Tanker breakdown reported by fleet head",
        }),
      ],
      audits: [
        transitionAudit(DeliveryEventType.DELIVERY_FAILED, 30, {
          from: DeliveryStatus.EN_ROUTE,
          to: DeliveryStatus.FAILED,
          actorType: ActorType.FLEET_HEAD,
          reason: "Tanker breakdown reported by fleet head",
        }),
      ],
      notifications: [
        {
          sourceEventType: DeliveryEventType.DELIVERY_FAILED,
          recipientActorType: ActorType.ADMIN,
          recipientActorId: null,
          category: NotificationCategory.ESCALATION,
          priority: NotificationPriority.HIGH,
          title: "Delivery failed",
          message: "Seeded failed delivery requires operational review.",
          minutesAgo: 29,
        },
      ],
    },
  ];
}

function transitionEvent(
  type: string,
  minutesAgoValue: number,
  input: {
    from: DeliveryStatus;
    to: DeliveryStatus;
    actorType: ActorType;
    reason?: string | null;
  }
): ScenarioEventInput {
  return {
    type,
    actorType: input.actorType,
    actorId: getActorId(input.actorType, type),
    minutesAgo: minutesAgoValue,
    metadata: {
      from: input.from,
      to: input.to,
      reason: input.reason ?? null,
      metadata: null,
    },
  };
}

function transitionAudit(
  action: string,
  minutesAgoValue: number,
  input: {
    from: DeliveryStatus;
    to: DeliveryStatus;
    actorType: ActorType;
    reason?: string | null;
  }
): ScenarioAuditInput {
  return {
    action,
    actorType: input.actorType,
    actorId: getActorId(input.actorType, action),
    minutesAgo: minutesAgoValue,
    before: { status: input.from },
    after: { status: input.to },
    reason: input.reason ?? null,
    metadata: {
      from: input.from,
      to: input.to,
      reason: input.reason ?? null,
      metadata: null,
    },
  };
}

function otpFailedEvent(minutesAgoValue: number, attemptCount: number) {
  return {
    type: DeliveryEventType.DELIVERY_OTP_FAILED,
    actorType: ActorType.CUSTOMER,
    actorId: "seed-customer-repeated-otp-failures",
    minutesAgo: minutesAgoValue,
    metadata: {
      failureReason: "invalid",
      attemptedAt: minutesAgo(minutesAgoValue).toISOString(),
      attemptCount,
    },
  };
}

function otpFailedAudit(
  minutesAgoValue: number,
  attemptCount: number
): ScenarioAuditInput {
  return {
    action: DeliveryEventType.DELIVERY_OTP_FAILED,
    actorType: ActorType.CUSTOMER,
    actorId: "seed-customer-repeated-otp-failures",
    minutesAgo: minutesAgoValue,
    before: { otpAttemptCount: attemptCount - 1 },
    after: { otpAttemptCount: attemptCount },
    metadata: {
      failureReason: "invalid",
      attemptedAt: minutesAgo(minutesAgoValue).toISOString(),
      attemptCount,
    },
  };
}

function getActorId(actorType: ActorType, label: string) {
  return `${SEED_PREFIX}:${actorType.toLowerCase()}:${label.toLowerCase()}`;
}

function getDefaultRecipientId(key: string, actorType: ActorType) {
  if (actorType === ActorType.ADMIN || actorType === ActorType.FLEET_HEAD) {
    return null;
  }

  return `${SEED_PREFIX}:${actorType.toLowerCase()}:${key}`;
}

function minutesAgo(value: number) {
  return new Date(now.getTime() - value * 60_000);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

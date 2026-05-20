import {
  ActorType,
  Prisma,
  type Delivery,
  type NotificationCategory,
  type NotificationPriority,
} from "@prisma/client";
import { prisma } from "../../lib/prisma.ts";
import { DeliveryEventType } from "../delivery/delivery.events.ts";

const NotificationAlertType = {
  LOADING_TOO_LONG: "LOADING_TOO_LONG",
  EN_ROUTE_TOO_LONG: "EN_ROUTE_TOO_LONG",
  REPEATED_OTP_FAILURES: "REPEATED_OTP_FAILURES",
} as const;

const NotificationCategoryValue = {
  TRANSACTIONAL: "TRANSACTIONAL",
  OPERATIONAL: "OPERATIONAL",
  ALERT: "ALERT",
  ESCALATION: "ESCALATION",
} as const satisfies Record<string, NotificationCategory>;

const NotificationPriorityValue = {
  LOW: "LOW",
  NORMAL: "NORMAL",
  HIGH: "HIGH",
  CRITICAL: "CRITICAL",
} as const satisfies Record<string, NotificationPriority>;

type NotificationRecipient = {
  actorType: ActorType;
  actorId: string | null;
};

type NotificationPlan = {
  recipient: NotificationRecipient;
  category: NotificationCategory;
  priority: NotificationPriority;
  title: string;
  message: string;
};

type DeliveryNotificationContext = Pick<
  Delivery,
  "id" | "customerId" | "driverId"
>;

export async function createNotificationsForDeliveryEvent(eventId: string) {
  const event = await prisma.deliveryEvent.findUnique({
    where: { id: eventId },
    include: {
      delivery: {
        select: {
          id: true,
          customerId: true,
          driverId: true,
        },
      },
    },
  });

  if (!event) {
    return { notificationsCreated: 0 };
  }

  const plans = buildNotificationPlans({
    eventType: event.type,
    delivery: event.delivery,
    metadata: event.metadata,
  });

  if (plans.length === 0) {
    return { notificationsCreated: 0 };
  }

  const result = await prisma.notification.createMany({
    data: plans.map((plan) => ({
      recipientActorType: plan.recipient.actorType,
      recipientActorId: plan.recipient.actorId,
      recipientKey: getRecipientKey(plan.recipient),
      category: plan.category,
      priority: plan.priority,
      title: plan.title,
      message: plan.message,
      relatedEntityType: "delivery",
      relatedEntityId: event.deliveryId,
      deliveryId: event.deliveryId,
      sourceEventId: event.id,
      metadata: {
        deliveryId: event.deliveryId,
        eventType: event.type,
        eventId: event.id,
      },
    })),
    skipDuplicates: true,
  });

  return {
    notificationsCreated: result.count,
  };
}

export async function listNotifications() {
  return prisma.notification.findMany({
    orderBy: { createdAt: "desc" },
  });
}

export async function markNotificationRead(notificationId: string) {
  return prisma.notification.update({
    where: { id: notificationId },
    data: {
      status: "READ",
      readAt: new Date(),
    },
  });
}

type BuildNotificationPlansInput = {
  eventType: string;
  delivery: DeliveryNotificationContext;
  metadata: Prisma.JsonValue | null;
};

function buildNotificationPlans({
  eventType,
  delivery,
  metadata,
}: BuildNotificationPlansInput) {
  if (eventType === DeliveryEventType.DELIVERY_ASSIGNED) {
    return compactPlans([
      customerPlan(delivery, {
        category: NotificationCategoryValue.OPERATIONAL,
        priority: NotificationPriorityValue.HIGH,
        title: "Delivery assigned",
        message: "A driver has been assigned to your delivery.",
      }),
      driverPlan(delivery, {
        category: NotificationCategoryValue.OPERATIONAL,
        priority: NotificationPriorityValue.HIGH,
        title: "New delivery assigned",
        message: "You have been assigned a delivery.",
      }),
    ]);
  }

  if (eventType === DeliveryEventType.DRIVER_ARRIVED) {
    return compactPlans([
      customerPlan(delivery, {
        category: NotificationCategoryValue.OPERATIONAL,
        priority: NotificationPriorityValue.HIGH,
        title: "Driver arrived",
        message: "Your driver has arrived at the delivery site.",
      }),
      driverPlan(delivery, {
        category: NotificationCategoryValue.OPERATIONAL,
        priority: NotificationPriorityValue.NORMAL,
        title: "Arrival recorded",
        message: "Your arrival has been recorded.",
      }),
    ]);
  }

  if (eventType === DeliveryEventType.MEASUREMENT_STARTED) {
    return compactPlans([
      customerPlan(delivery, {
        category: NotificationCategoryValue.OPERATIONAL,
        priority: NotificationPriorityValue.NORMAL,
        title: "Measurement started",
        message: "Delivery measurement has started.",
      }),
      driverPlan(delivery, {
        category: NotificationCategoryValue.OPERATIONAL,
        priority: NotificationPriorityValue.NORMAL,
        title: "Measurement started",
        message: "Measurement has been recorded as started.",
      }),
    ]);
  }

  if (eventType === DeliveryEventType.MEASUREMENT_COMPLETED) {
    return compactPlans([
      customerPlan(delivery, {
        category: NotificationCategoryValue.TRANSACTIONAL,
        priority: NotificationPriorityValue.HIGH,
        title: "OTP confirmation required",
        message: "Please confirm the delivery with OTP.",
      }),
      driverPlan(delivery, {
        category: NotificationCategoryValue.OPERATIONAL,
        priority: NotificationPriorityValue.HIGH,
        title: "OTP pending",
        message: "Collect OTP confirmation to complete this delivery.",
      }),
    ]);
  }

  if (eventType === DeliveryEventType.DELIVERY_COMPLETED) {
    return compactPlans([
      customerPlan(delivery, {
        category: NotificationCategoryValue.TRANSACTIONAL,
        priority: NotificationPriorityValue.NORMAL,
        title: "Delivery completed",
        message: "Your delivery has been completed.",
      }),
      driverPlan(delivery, {
        category: NotificationCategoryValue.TRANSACTIONAL,
        priority: NotificationPriorityValue.NORMAL,
        title: "Delivery completed",
        message: "This delivery has been completed.",
      }),
      adminPlan({
        category: NotificationCategoryValue.OPERATIONAL,
        priority: NotificationPriorityValue.LOW,
        title: "Delivery completed",
        message: "A delivery has been completed.",
      }),
    ]);
  }

  if (eventType === DeliveryEventType.DELIVERY_FAILED) {
    return compactPlans([
      customerPlan(delivery, {
        category: NotificationCategoryValue.OPERATIONAL,
        priority: NotificationPriorityValue.HIGH,
        title: "Delivery failed",
        message: "Your delivery has been marked failed.",
      }),
      driverPlan(delivery, {
        category: NotificationCategoryValue.OPERATIONAL,
        priority: NotificationPriorityValue.HIGH,
        title: "Delivery failed",
        message: "This delivery has been marked failed.",
      }),
      fleetHeadPlan({
        category: NotificationCategoryValue.ESCALATION,
        priority: NotificationPriorityValue.HIGH,
        title: "Delivery failed",
        message: "A fleet delivery has failed and may need review.",
      }),
      adminPlan({
        category: NotificationCategoryValue.ESCALATION,
        priority: NotificationPriorityValue.HIGH,
        title: "Delivery failed",
        message: "A delivery failed and may need admin review.",
      }),
    ]);
  }

  if (eventType === DeliveryEventType.DELIVERY_SKIPPED) {
    return compactPlans([
      customerPlan(delivery, {
        category: NotificationCategoryValue.OPERATIONAL,
        priority: NotificationPriorityValue.NORMAL,
        title: "Delivery skipped",
        message: "Your delivery has been skipped.",
      }),
      driverPlan(delivery, {
        category: NotificationCategoryValue.OPERATIONAL,
        priority: NotificationPriorityValue.NORMAL,
        title: "Delivery skipped",
        message: "This delivery has been skipped.",
      }),
      fleetHeadPlan({
        category: NotificationCategoryValue.OPERATIONAL,
        priority: NotificationPriorityValue.NORMAL,
        title: "Delivery skipped",
        message: "A fleet delivery has been skipped.",
      }),
      adminPlan({
        category: NotificationCategoryValue.OPERATIONAL,
        priority: NotificationPriorityValue.NORMAL,
        title: "Delivery skipped",
        message: "A delivery has been skipped.",
      }),
    ]);
  }

  if (eventType === DeliveryEventType.DELIVERY_ALERT_CREATED) {
    return buildAlertNotificationPlans(delivery, metadata);
  }

  return [];
}

function buildAlertNotificationPlans(
  delivery: DeliveryNotificationContext,
  metadata: Prisma.JsonValue | null
) {
  const alertType = getMetadataString(metadata, "alertType");

  if (alertType === NotificationAlertType.LOADING_TOO_LONG) {
    return compactPlans([
      driverPlan(delivery, {
        category: NotificationCategoryValue.ALERT,
        priority: NotificationPriorityValue.HIGH,
        title: "Loading is taking too long",
        message: "This delivery has stayed in loading longer than expected.",
      }),
      fleetHeadPlan({
        category: NotificationCategoryValue.ALERT,
        priority: NotificationPriorityValue.HIGH,
        title: "Driver loading delay",
        message: "A fleet delivery is delayed during loading.",
      }),
      adminPlan({
        category: NotificationCategoryValue.ALERT,
        priority: NotificationPriorityValue.HIGH,
        title: "Loading delay",
        message: "A delivery is delayed during loading.",
      }),
    ]);
  }

  if (alertType === NotificationAlertType.EN_ROUTE_TOO_LONG) {
    return compactPlans([
      customerPlan(delivery, {
        category: NotificationCategoryValue.ALERT,
        priority: NotificationPriorityValue.NORMAL,
        title: "Delivery delayed",
        message: "Your delivery is taking longer than expected en route.",
      }),
      driverPlan(delivery, {
        category: NotificationCategoryValue.ALERT,
        priority: NotificationPriorityValue.HIGH,
        title: "En route delay",
        message: "This delivery has stayed en route longer than expected.",
      }),
      fleetHeadPlan({
        category: NotificationCategoryValue.ALERT,
        priority: NotificationPriorityValue.HIGH,
        title: "Driver en route delay",
        message: "A fleet delivery is delayed en route.",
      }),
      adminPlan({
        category: NotificationCategoryValue.ALERT,
        priority: NotificationPriorityValue.HIGH,
        title: "En route delay",
        message: "A delivery is delayed en route.",
      }),
    ]);
  }

  if (alertType === NotificationAlertType.REPEATED_OTP_FAILURES) {
    return compactPlans([
      customerPlan(delivery, {
        category: NotificationCategoryValue.ESCALATION,
        priority: NotificationPriorityValue.CRITICAL,
        title: "OTP verification issue",
        message: "There have been repeated failed OTP attempts for your delivery.",
      }),
      driverPlan(delivery, {
        category: NotificationCategoryValue.ESCALATION,
        priority: NotificationPriorityValue.CRITICAL,
        title: "Repeated OTP failures",
        message: "This delivery has repeated failed OTP attempts.",
      }),
      fleetHeadPlan({
        category: NotificationCategoryValue.ESCALATION,
        priority: NotificationPriorityValue.CRITICAL,
        title: "Repeated OTP failures",
        message: "A fleet delivery has repeated failed OTP attempts.",
      }),
      adminPlan({
        category: NotificationCategoryValue.ESCALATION,
        priority: NotificationPriorityValue.CRITICAL,
        title: "Repeated OTP failures",
        message: "A delivery may need admin review due to repeated OTP failures.",
      }),
    ]);
  }

  return [];
}

type PlanTemplate = Omit<NotificationPlan, "recipient">;

function customerPlan(
  delivery: DeliveryNotificationContext,
  template: PlanTemplate
): NotificationPlan | null {
  if (!delivery.customerId) {
    return null;
  }

  return {
    recipient: {
      actorType: ActorType.CUSTOMER,
      actorId: delivery.customerId,
    },
    ...template,
  };
}

function driverPlan(
  delivery: DeliveryNotificationContext,
  template: PlanTemplate
): NotificationPlan | null {
  if (!delivery.driverId) {
    return null;
  }

  return {
    recipient: {
      actorType: ActorType.DRIVER,
      actorId: delivery.driverId,
    },
    ...template,
  };
}

function adminPlan(template: PlanTemplate): NotificationPlan {
  return {
    recipient: {
      actorType: ActorType.ADMIN,
      actorId: null,
    },
    ...template,
  };
}

function fleetHeadPlan(template: PlanTemplate): NotificationPlan {
  return {
    recipient: {
      actorType: ActorType.FLEET_HEAD,
      actorId: null,
    },
    ...template,
  };
}

function compactPlans(plans: (NotificationPlan | null)[]) {
  return plans.filter((plan): plan is NotificationPlan => plan !== null);
}

function getRecipientKey(recipient: NotificationRecipient) {
  return `${recipient.actorType}:${recipient.actorId ?? "GLOBAL"}`;
}

function getMetadataString(metadata: Prisma.JsonValue | null, key: string) {
  if (!metadata || Array.isArray(metadata) || typeof metadata !== "object") {
    return null;
  }

  const value = metadata[key];

  return typeof value === "string" ? value : null;
}

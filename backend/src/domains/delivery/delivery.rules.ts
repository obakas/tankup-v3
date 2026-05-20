import { ActorType, DeliveryStatus } from "@prisma/client";
import { DeliveryEventType } from "./delivery.events.ts";

export type DeliveryTransitionRule = {
  readonly to: DeliveryStatus;
  readonly eventType: DeliveryEventType;
  readonly actorTypes: readonly ActorType[];
  readonly requiresReason?: true;
};

const SKIPPED_TRANSITION_RULE: DeliveryTransitionRule = {
  to: DeliveryStatus.SKIPPED,
  eventType: DeliveryEventType.DELIVERY_SKIPPED,
  actorTypes: [ActorType.ADMIN, ActorType.SYSTEM, ActorType.FLEET_HEAD],
  requiresReason: true,
};

export const DELIVERY_TRANSITIONS: Record<
  DeliveryStatus,
  readonly DeliveryTransitionRule[]
> = {
  CREATED: [
    {
      to: DeliveryStatus.ASSIGNED,
      eventType: DeliveryEventType.DELIVERY_ASSIGNED,
      actorTypes: [ActorType.ADMIN, ActorType.SYSTEM, ActorType.FLEET_HEAD],
    },
  ],
  ASSIGNED: [
    {
      to: DeliveryStatus.LOADING,
      eventType: DeliveryEventType.LOADING_STARTED,
      actorTypes: [ActorType.DRIVER, ActorType.FLEET_HEAD],
    },
    SKIPPED_TRANSITION_RULE,
  ],
  LOADING: [
    {
      to: DeliveryStatus.EN_ROUTE,
      eventType: DeliveryEventType.DRIVER_EN_ROUTE,
      actorTypes: [ActorType.DRIVER],
    },
    {
      to: DeliveryStatus.FAILED,
      eventType: DeliveryEventType.DELIVERY_FAILED,
      actorTypes: [
        ActorType.DRIVER,
        ActorType.FLEET_HEAD,
        ActorType.ADMIN,
        ActorType.SYSTEM,
      ],
      requiresReason: true,
    },
    SKIPPED_TRANSITION_RULE,
  ],
  EN_ROUTE: [
    {
      to: DeliveryStatus.ARRIVED,
      eventType: DeliveryEventType.DRIVER_ARRIVED,
      actorTypes: [ActorType.DRIVER],
    },
    {
      to: DeliveryStatus.FAILED,
      eventType: DeliveryEventType.DELIVERY_FAILED,
      actorTypes: [
        ActorType.DRIVER,
        ActorType.FLEET_HEAD,
        ActorType.ADMIN,
        ActorType.SYSTEM,
      ],
      requiresReason: true,
    },
    SKIPPED_TRANSITION_RULE,
  ],
  ARRIVED: [
    {
      to: DeliveryStatus.MEASURING,
      eventType: DeliveryEventType.MEASUREMENT_STARTED,
      actorTypes: [ActorType.DRIVER],
    },
    {
      to: DeliveryStatus.FAILED,
      eventType: DeliveryEventType.DELIVERY_FAILED,
      actorTypes: [
        ActorType.DRIVER,
        ActorType.FLEET_HEAD,
        ActorType.ADMIN,
        ActorType.SYSTEM,
      ],
      requiresReason: true,
    },
    SKIPPED_TRANSITION_RULE,
  ],
  MEASURING: [
    {
      to: DeliveryStatus.AWAITING_OTP,
      eventType: DeliveryEventType.MEASUREMENT_COMPLETED,
      actorTypes: [ActorType.DRIVER],
    },
    {
      to: DeliveryStatus.FAILED,
      eventType: DeliveryEventType.DELIVERY_FAILED,
      actorTypes: [
        ActorType.DRIVER,
        ActorType.FLEET_HEAD,
        ActorType.ADMIN,
        ActorType.SYSTEM,
      ],
      requiresReason: true,
    },
  ],
  AWAITING_OTP: [
    {
      to: DeliveryStatus.COMPLETED,
      eventType: DeliveryEventType.DELIVERY_COMPLETED,
      actorTypes: [ActorType.CUSTOMER],
    },
    {
      to: DeliveryStatus.FAILED,
      eventType: DeliveryEventType.DELIVERY_FAILED,
      actorTypes: [ActorType.ADMIN, ActorType.SYSTEM],
      requiresReason: true,
    },
  ],
  COMPLETED: [],
  FAILED: [],
  SKIPPED: [],
};


function getDeliveryTransitionRules(from: DeliveryStatus) {
  return DELIVERY_TRANSITIONS[from] ?? [];
}

export function findDeliveryTransitionRule(
  from: DeliveryStatus,
  to: DeliveryStatus
) {
  return getDeliveryTransitionRules(from).find(
    (transition) => transition.to === to
  );
}

export function getAllowedDeliveryStatuses(from: DeliveryStatus) {
  return getDeliveryTransitionRules(from).map((transition) => transition.to);
}
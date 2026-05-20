import { ActorType, DeliveryStatus, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.ts";
import {
  findDeliveryTransitionRule,
  getAllowedDeliveryStatuses,
} from "./delivery.rules.ts";
import { DeliveryEventType } from "./delivery.events.ts";
import { createAuditLog } from "../audit/audit.service.ts";
import { createNotificationsForDeliveryEvent } from "../notification/notification.service.ts";
import { eventBus } from "../../events/eventBus.ts";
import {
  DeliveryNotFoundError,
  DeliveryCompletionRequiresVerifiedOtpError,
  DeliveryTransitionActorIdRequiredError,
  DeliveryTransitionConflictError,
  InvalidDeliveryTransitionError,
} from "./delivery.errors.ts";
import { validateDeliveryTransitionRequirements } from "./delivery.validation.ts";

type TransitionDeliveryInput = {
  deliveryId: string;
  to: DeliveryStatus;
  actorType: ActorType;
  actorId?: string;
  reason?: string;
  metadata?: Prisma.InputJsonObject;
};

export async function transitionDeliveryStatus(input: TransitionDeliveryInput) {
  if (input.actorType !== ActorType.SYSTEM && !input.actorId?.trim()) {
    throw new DeliveryTransitionActorIdRequiredError(input.actorType);
  }

  const transition = await prisma.$transaction(async (tx) => {
    const delivery = await tx.delivery.findUnique({
      where: { id: input.deliveryId },
    });

    if (!delivery) {
      throw new DeliveryNotFoundError(input.deliveryId);
    }

    const from = delivery.status;
    const transitionRule = findDeliveryTransitionRule(from, input.to);

    if (!transitionRule) {
      throw new InvalidDeliveryTransitionError(
        from,
        input.to,
        getAllowedDeliveryStatuses(from)
      );
    }

    validateDeliveryTransitionRequirements(
      {
        from,
        to: input.to,
        actorType: input.actorType,
        ...(input.reason !== undefined ? { reason: input.reason } : {}),
      },
      transitionRule
    );

    if (input.to === DeliveryStatus.COMPLETED && !delivery.otpVerifiedAt) {
      throw new DeliveryCompletionRequiresVerifiedOtpError(input.deliveryId);
    }

    const transitionResult = await tx.delivery.updateMany({
      where: {
        id: input.deliveryId,
        status: from,
      },
      data: {
        status: input.to,
      },
    });

    if (transitionResult.count !== 1) {
      throw new DeliveryTransitionConflictError(input.deliveryId);
    }

    const updated = await tx.delivery.findUnique({
      where: { id: input.deliveryId },
    });

    if (!updated) {
      throw new DeliveryNotFoundError(input.deliveryId);
    }

    const transitionMetadata: Prisma.InputJsonObject = {
      from,
      to: input.to,
      reason: input.reason ?? null,
      metadata: input.metadata ?? null,
    };

    const deliveryEvent = await tx.deliveryEvent.create({
      data: {
        deliveryId: input.deliveryId,
        type: transitionRule.eventType,
        actorType: input.actorType,
        actorId: input.actorId ?? null,
        metadata: transitionMetadata,
      },
    });

    const auditInput = {
      actorType: input.actorType,
      action: getDeliveryAuditAction(input.to),
      entityType: "delivery",
      entityId: input.deliveryId,
      deliveryId: input.deliveryId,
      before: {
        status: from,
      },
      after: {
        status: input.to,
      },
      metadata: transitionMetadata,
      ...(input.actorId !== undefined ? { actorId: input.actorId } : {}),
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
    };

    await createAuditLog(auditInput, tx);

    return {
      delivery: updated,
      from,
      eventType: transitionRule.eventType,
      eventId: deliveryEvent.id,
    };
  });

  eventBus.emit({
    type: transition.eventType,
    data: {
      deliveryId: input.deliveryId,
      from: transition.from,
      to: input.to,
      actorType: input.actorType,
      actorId: input.actorId ?? null,
    },
  });

  await createNotificationsForDeliveryEvent(transition.eventId);

  return transition.delivery;
}

function getDeliveryAuditAction(to: DeliveryStatus) {
  if (to === DeliveryStatus.COMPLETED) {
    return DeliveryEventType.DELIVERY_COMPLETED;
  }

  if (to === DeliveryStatus.FAILED) {
    return DeliveryEventType.DELIVERY_FAILED;
  }

  if (to === DeliveryStatus.SKIPPED) {
    return DeliveryEventType.DELIVERY_SKIPPED;
  }

  return "DELIVERY_STATUS_CHANGED";
}

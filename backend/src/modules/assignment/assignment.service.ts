import {
  ActorType,
  AssignmentDecisionResult,
  DeliveryStatus,
  OfferStatus,
  Prisma,
  TankerAvailabilityStatus,
  type JobOffer,
} from "@prisma/client";
import { prisma } from "../../lib/prisma.ts";
import { createAuditLog } from "../../domains/audit/audit.service.ts";
import { DeliveryEventType } from "../../domains/delivery/delivery.events.ts";
import {
  DeliveryNotFoundError,
  DeliveryTransitionActorIdRequiredError,
  DeliveryTransitionConflictError,
  InvalidDeliveryTransitionError,
} from "../../domains/delivery/delivery.errors.ts";
import {
  findDeliveryTransitionRule,
  getAllowedDeliveryStatuses,
} from "../../domains/delivery/delivery.rules.ts";
import { validateDeliveryTransitionRequirements } from "../../domains/delivery/delivery.validation.ts";
import { createNotificationsForDeliveryEvent } from "../../domains/notification/notification.service.ts";
import { eventBus } from "../../events/eventBus.ts";
import { listAssignmentCandidates } from "./candidate.service.ts";
import { createJobOffer } from "./offer.service.ts";

const DEFAULT_OFFER_TTL_MINUTES = 15;

export type AssignmentErrorCode =
  | "ASSIGNMENT_NO_CANDIDATES"
  | "ASSIGNMENT_OFFER_NOT_FOUND"
  | "ASSIGNMENT_OFFER_NOT_PENDING"
  | "ASSIGNMENT_OFFER_EXPIRED"
  | "ASSIGNMENT_OFFER_CONFLICT";

export class AssignmentDomainError extends Error {
  constructor(
    readonly code: AssignmentErrorCode,
    message: string,
    readonly statusCode: number,
    readonly details: Record<string, string | number | boolean | null> = {}
  ) {
    super(message);
    this.name = "AssignmentDomainError";
  }
}

type RunAssignmentInput = {
  deliveryId: string;
  actorType: ActorType;
  actorId?: string;
  expiresInMinutes?: number;
};

type OfferDecisionInput = {
  offerId: string;
  actorType: ActorType;
  actorId?: string;
  reason?: string;
};

export async function runAssignment(input: RunAssignmentInput) {
  requireActorIdWhenNeeded(input.actorType, input.actorId);

  return prisma.$transaction(async (tx) => {
    const candidates = await listAssignmentCandidates(input.deliveryId, tx);
    const bestCandidate = candidates[0];

    if (!bestCandidate) {
      throw new AssignmentDomainError(
        "ASSIGNMENT_NO_CANDIDATES",
        "No available tanker can receive an assignment offer",
        409,
        { deliveryId: input.deliveryId }
      );
    }

    const expiresAt = minutesFromNow(
      input.expiresInMinutes ?? DEFAULT_OFFER_TTL_MINUTES
    );
    const offer = await createJobOffer(
      {
        deliveryId: input.deliveryId,
        tankerId: bestCandidate.tanker.id,
        score: bestCandidate.score,
        reason: bestCandidate.reason,
        expiresAt,
      },
      tx
    );

    if (!offer) {
      throw new AssignmentDomainError(
        "ASSIGNMENT_OFFER_CONFLICT",
        "An active offer already exists for this delivery or tanker",
        409,
        { deliveryId: input.deliveryId, tankerId: bestCandidate.tanker.id }
      );
    }

    await createAuditLog(
      {
        actorType: input.actorType,
        ...(input.actorId !== undefined ? { actorId: input.actorId } : {}),
        action: "JOB_OFFER_CREATED",
        entityType: "job_offer",
        entityId: offer.id,
        deliveryId: input.deliveryId,
        after: {
          status: offer.status,
          deliveryId: offer.deliveryId,
          tankerId: offer.tankerId,
          expiresAt: offer.expiresAt.toISOString(),
        },
        metadata: {
          score: offer.score,
          reason: offer.reason,
        },
      },
      tx
    );

    return offer;
  });
}

export async function acceptOffer(input: OfferDecisionInput) {
  requireActorIdWhenNeeded(input.actorType, input.actorId);

  const result = await prisma.$transaction(async (tx) => {
    const offer = await tx.jobOffer.findUnique({
      where: { id: input.offerId },
      include: {
        delivery: true,
        tanker: true,
      },
    });

    if (!offer) {
      throw new AssignmentDomainError(
        "ASSIGNMENT_OFFER_NOT_FOUND",
        "Assignment offer not found",
        404,
        { offerId: input.offerId }
      );
    }

    await assertOfferCanBeDecided(offer, "accept", tx);

    const from = offer.delivery.status;
    const transitionRule = findDeliveryTransitionRule(from, DeliveryStatus.ASSIGNED);

    if (!transitionRule) {
      throw new InvalidDeliveryTransitionError(
        from,
        DeliveryStatus.ASSIGNED,
        getAllowedDeliveryStatuses(from)
      );
    }

    validateDeliveryTransitionRequirements(
      {
        from,
        to: DeliveryStatus.ASSIGNED,
        actorType: ActorType.SYSTEM,
      },
      transitionRule
    );

    const acceptedOffer = await tx.jobOffer.updateMany({
      where: {
        id: input.offerId,
        status: OfferStatus.PENDING,
      },
      data: {
        status: OfferStatus.ACCEPTED,
        respondedAt: new Date(),
      },
    });

    if (acceptedOffer.count !== 1) {
      throw new AssignmentDomainError(
        "ASSIGNMENT_OFFER_CONFLICT",
        "Assignment offer changed before it could be accepted",
        409,
        { offerId: input.offerId }
      );
    }

    const tankerUpdate = await tx.tanker.updateMany({
      where: {
        id: offer.tankerId,
        availabilityStatus: TankerAvailabilityStatus.AVAILABLE,
      },
      data: {
        availabilityStatus: TankerAvailabilityStatus.ASSIGNED,
      },
    });

    if (tankerUpdate.count !== 1) {
      throw new AssignmentDomainError(
        "ASSIGNMENT_OFFER_CONFLICT",
        "Tanker availability changed before the offer could be accepted",
        409,
        { offerId: input.offerId, tankerId: offer.tankerId }
      );
    }

    const deliveryUpdate = await tx.delivery.updateMany({
      where: {
        id: offer.deliveryId,
        status: from,
        tankerId: null,
      },
      data: {
        status: DeliveryStatus.ASSIGNED,
        tankerId: offer.tankerId,
        driverId: offer.tanker.driverId ?? offer.delivery.driverId,
      },
    });

    if (deliveryUpdate.count !== 1) {
      throw new DeliveryTransitionConflictError(offer.deliveryId);
    }

    const metadata: Prisma.InputJsonObject = {
      from,
      to: DeliveryStatus.ASSIGNED,
      reason: input.reason ?? null,
      metadata: {
        jobOfferId: offer.id,
        tankerId: offer.tankerId,
        acceptedByActorType: input.actorType,
        acceptedByActorId: input.actorId ?? null,
      },
    };

    const deliveryEvent = await tx.deliveryEvent.create({
      data: {
        deliveryId: offer.deliveryId,
        type: transitionRule.eventType,
        actorType: ActorType.SYSTEM,
        actorId: null,
        metadata,
      },
    });

    await createAuditLog(
      {
        actorType: ActorType.SYSTEM,
        action: DeliveryEventType.DELIVERY_ASSIGNED,
        entityType: "delivery",
        entityId: offer.deliveryId,
        deliveryId: offer.deliveryId,
        before: {
          status: from,
          tankerId: offer.delivery.tankerId,
          driverId: offer.delivery.driverId,
        },
        after: {
          status: DeliveryStatus.ASSIGNED,
          tankerId: offer.tankerId,
          driverId: offer.tanker.driverId ?? offer.delivery.driverId,
        },
        ...(input.reason !== undefined ? { reason: input.reason } : {}),
        metadata,
      },
      tx
    );

    const decision = await createAssignmentDecision(
      {
        offer,
        result: AssignmentDecisionResult.ACCEPTED,
        actorType: input.actorType,
        ...(input.actorId !== undefined ? { actorId: input.actorId } : {}),
        ...(input.reason !== undefined ? { reason: input.reason } : {}),
      },
      tx
    );

    const delivery = await tx.delivery.findUniqueOrThrow({
      where: { id: offer.deliveryId },
    });

    return {
      delivery,
      offerId: offer.id,
      decision,
      eventId: deliveryEvent.id,
      from,
      eventType: transitionRule.eventType,
    };
  });

  eventBus.emit({
    type: result.eventType,
    data: {
      deliveryId: result.delivery.id,
      from: result.from,
      to: DeliveryStatus.ASSIGNED,
      actorType: ActorType.SYSTEM,
      actorId: null,
    },
  });

  await createNotificationsForDeliveryEvent(result.eventId);

  return result;
}

export async function rejectOffer(input: OfferDecisionInput) {
  requireActorIdWhenNeeded(input.actorType, input.actorId);

  return prisma.$transaction(async (tx) => {
    const offer = await tx.jobOffer.findUnique({
      where: { id: input.offerId },
      include: {
        delivery: true,
        tanker: true,
      },
    });

    if (!offer) {
      throw new AssignmentDomainError(
        "ASSIGNMENT_OFFER_NOT_FOUND",
        "Assignment offer not found",
        404,
        { offerId: input.offerId }
      );
    }

    await assertOfferCanBeDecided(offer, "reject", tx);

    const updatedOffer = await tx.jobOffer.update({
      where: { id: offer.id },
      data: {
        status: OfferStatus.REJECTED,
        respondedAt: new Date(),
      },
      include: {
        delivery: true,
        tanker: true,
      },
    });

    const decision = await createAssignmentDecision(
      {
        offer,
        result: AssignmentDecisionResult.REJECTED,
        actorType: input.actorType,
        ...(input.actorId !== undefined ? { actorId: input.actorId } : {}),
        ...(input.reason !== undefined ? { reason: input.reason } : {}),
      },
      tx
    );

    return {
      offer: updatedOffer,
      decision,
    };
  });
}

async function assertOfferCanBeDecided(
  offer: JobOffer,
  action: "accept" | "reject",
  tx: Prisma.TransactionClient
) {
  if (offer.status !== OfferStatus.PENDING) {
    throw new AssignmentDomainError(
      "ASSIGNMENT_OFFER_NOT_PENDING",
      `Assignment offer cannot be ${action}ed because it is ${offer.status}`,
      409,
      { offerId: offer.id, status: offer.status }
    );
  }

  if (offer.expiresAt <= new Date()) {
    await tx.jobOffer.update({
      where: { id: offer.id },
      data: {
        status: OfferStatus.EXPIRED,
        respondedAt: new Date(),
      },
    });

    throw new AssignmentDomainError(
      "ASSIGNMENT_OFFER_EXPIRED",
      `Assignment offer cannot be ${action}ed because it has expired`,
      409,
      { offerId: offer.id, expiresAt: offer.expiresAt.toISOString() }
    );
  }
}

async function createAssignmentDecision(
  input: {
    offer: JobOffer;
    result: AssignmentDecisionResult;
    actorType: ActorType;
    actorId?: string;
    reason?: string;
  },
  tx: Prisma.TransactionClient
) {
  const decision = await tx.assignmentDecision.create({
    data: {
      jobOfferId: input.offer.id,
      deliveryId: input.offer.deliveryId,
      tankerId: input.offer.tankerId,
      result: input.result,
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      reason: input.reason ?? null,
    },
  });

  await createAuditLog(
    {
      actorType: input.actorType,
      ...(input.actorId !== undefined ? { actorId: input.actorId } : {}),
      action: `JOB_OFFER_${input.result}`,
      entityType: "job_offer",
      entityId: input.offer.id,
      deliveryId: input.offer.deliveryId,
      before: {
        status: OfferStatus.PENDING,
      },
      after: {
        status:
          input.result === AssignmentDecisionResult.ACCEPTED
            ? OfferStatus.ACCEPTED
            : OfferStatus.REJECTED,
      },
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
      metadata: {
        decisionId: decision.id,
        tankerId: input.offer.tankerId,
      },
    },
    tx
  );

  return decision;
}

function requireActorIdWhenNeeded(actorType: ActorType, actorId?: string) {
  if (actorType !== ActorType.SYSTEM && !actorId?.trim()) {
    throw new DeliveryTransitionActorIdRequiredError(actorType);
  }
}

function minutesFromNow(minutes: number) {
  return new Date(Date.now() + minutes * 60 * 1000);
}

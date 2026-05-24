import {
  ActorType,
  AssignmentDecisionResult,
  DeliveryStatus,
  OfferStatus,
} from "@prisma/client";
import { createAuditLog } from "../../domains/audit/audit.service.ts";
import { prisma } from "../../lib/prisma.ts";
import { listAssignmentCandidates } from "./candidate.service.ts";
import { createJobOffer } from "./offer.service.ts";

const ASSIGNMENT_WORKER_INTERVAL_MS = 15_000;
const ASSIGNMENT_WORKER_BATCH_SIZE = 25;
const RETRY_OFFER_TTL_MINUTES = 15;
const TERMINAL_DELIVERY_STATUSES = [
  DeliveryStatus.COMPLETED,
  DeliveryStatus.FAILED,
  DeliveryStatus.SKIPPED,
] as const;

let workerInterval: NodeJS.Timeout | null = null;
let isWorkerRunning = false;

export type AssignmentWorkerRunResult = {
  expiredOffers: number;
  retriedOffers: number;
  skippedTerminalDeliveries: number;
};

export function startAssignmentWorker() {
  if (workerInterval) {
    return;
  }

  workerInterval = setInterval(() => {
    void runAssignmentWorkerSafely();
  }, ASSIGNMENT_WORKER_INTERVAL_MS);
  workerInterval.unref();

  console.log("[assignment-worker] started interval=15s");
}

export function stopAssignmentWorker() {
  if (!workerInterval) {
    return;
  }

  clearInterval(workerInterval);
  workerInterval = null;
}

export async function runAssignmentWorkerSafely() {
  if (isWorkerRunning) {
    return;
  }

  isWorkerRunning = true;

  try {
    const result = await processExpiredAssignmentOffers();

    if (
      result.expiredOffers > 0 ||
      result.retriedOffers > 0 ||
      result.skippedTerminalDeliveries > 0
    ) {
      console.log(
        `[assignment-worker] expired=${result.expiredOffers} retried=${result.retriedOffers} terminal=${result.skippedTerminalDeliveries}`
      );
    }
  } catch (error) {
    console.error("[assignment-worker] run failed", error);
  } finally {
    isWorkerRunning = false;
  }
}

export async function processExpiredAssignmentOffers(
  now: Date = new Date()
): Promise<AssignmentWorkerRunResult> {
  const expiredOffers = await prisma.jobOffer.findMany({
    where: {
      status: OfferStatus.PENDING,
      expiresAt: {
        lte: now,
      },
    },
    orderBy: {
      expiresAt: "asc",
    },
    take: ASSIGNMENT_WORKER_BATCH_SIZE,
    select: {
      id: true,
    },
  });

  const result: AssignmentWorkerRunResult = {
    expiredOffers: 0,
    retriedOffers: 0,
    skippedTerminalDeliveries: 0,
  };

  for (const offer of expiredOffers) {
    const processed = await processExpiredOffer(offer.id, now);

    result.expiredOffers += processed.expiredOffers;
    result.retriedOffers += processed.retriedOffers;
    result.skippedTerminalDeliveries += processed.skippedTerminalDeliveries;
  }

  return result;
}

async function processExpiredOffer(
  offerId: string,
  now: Date
): Promise<AssignmentWorkerRunResult> {
  return prisma.$transaction(async (tx) => {
    const result: AssignmentWorkerRunResult = {
      expiredOffers: 0,
      retriedOffers: 0,
      skippedTerminalDeliveries: 0,
    };

    const offer = await tx.jobOffer.findUnique({
      where: { id: offerId },
      include: {
        delivery: true,
        tanker: true,
      },
    });

    if (!offer || offer.status !== OfferStatus.PENDING || offer.expiresAt > now) {
      return result;
    }

    const expiredOffer = await tx.jobOffer.updateMany({
      where: {
        id: offer.id,
        status: OfferStatus.PENDING,
        expiresAt: {
          lte: now,
        },
      },
      data: {
        status: OfferStatus.EXPIRED,
        respondedAt: now,
      },
    });

    if (expiredOffer.count !== 1) {
      return result;
    }

    result.expiredOffers += 1;

    const decision = await tx.assignmentDecision.create({
      data: {
        jobOfferId: offer.id,
        deliveryId: offer.deliveryId,
        tankerId: offer.tankerId,
        result: AssignmentDecisionResult.EXPIRED,
        actorType: ActorType.SYSTEM,
        actorId: null,
        reason: "Offer expired before response",
      },
    });

    await createAuditLog(
      {
        actorType: ActorType.SYSTEM,
        action: "JOB_OFFER_EXPIRED",
        entityType: "job_offer",
        entityId: offer.id,
        deliveryId: offer.deliveryId,
        before: {
          status: OfferStatus.PENDING,
        },
        after: {
          status: OfferStatus.EXPIRED,
        },
        reason: "Offer expired before response",
        metadata: {
          decisionId: decision.id,
          tankerId: offer.tankerId,
          expiredAt: now.toISOString(),
        },
      },
      tx
    );

    if (isTerminalDeliveryStatus(offer.delivery.status)) {
      result.skippedTerminalDeliveries += 1;
      return result;
    }

    if (
      offer.delivery.status !== DeliveryStatus.CREATED ||
      offer.delivery.tankerId !== null
    ) {
      return result;
    }

    const pendingDeliveryOffer = await tx.jobOffer.findFirst({
      where: {
        deliveryId: offer.deliveryId,
        status: OfferStatus.PENDING,
      },
      select: {
        id: true,
      },
    });

    if (pendingDeliveryOffer) {
      return result;
    }

    const previousTankerIds = await tx.jobOffer.findMany({
      where: {
        deliveryId: offer.deliveryId,
      },
      distinct: ["tankerId"],
      select: {
        tankerId: true,
      },
    });
    const candidates = await listAssignmentCandidates(
      offer.deliveryId,
      tx,
      previousTankerIds.map((previousOffer) => previousOffer.tankerId),
      false
    );
    const nextCandidate = candidates[0];

    if (!nextCandidate) {
      return result;
    }

    const nextOffer = await createJobOffer(
      {
        deliveryId: offer.deliveryId,
        tankerId: nextCandidate.tanker.id,
        score: nextCandidate.score,
        reason: "Assignment retry after expired offer",
        expiresAt: minutesFromNow(RETRY_OFFER_TTL_MINUTES, now),
        skipExpirationSweep: true,
      },
      tx
    );

    if (nextOffer) {
      result.retriedOffers += 1;
    }

    return result;
  });
}

function isTerminalDeliveryStatus(status: DeliveryStatus) {
  return TERMINAL_DELIVERY_STATUSES.includes(
    status as (typeof TERMINAL_DELIVERY_STATUSES)[number]
  );
}

function minutesFromNow(minutes: number, now: Date) {
  return new Date(now.getTime() + minutes * 60 * 1000);
}

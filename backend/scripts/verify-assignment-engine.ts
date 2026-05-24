import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  ActorType,
  AssignmentDecisionResult,
  DeliveryStatus,
  OfferStatus,
  TankerAvailabilityStatus,
} from "@prisma/client";
import {
  getDeliveryOperationsView,
  listOperationsDeliveries,
} from "../src/domains/delivery/delivery.operations.ts";
import { DeliveryEventType } from "../src/domains/delivery/delivery.events.ts";
import { prisma } from "../src/lib/prisma.ts";
import { processExpiredAssignmentOffers } from "../src/modules/assignment/assignment.worker.ts";
import {
  acceptOffer,
  AssignmentDomainError,
  rejectOffer,
  runAssignment,
} from "../src/modules/assignment/assignment.service.ts";
import { createJobOffer, getIncomingOfferForTanker } from "../src/modules/assignment/offer.service.ts";

const TEST_PREFIX = "verify-assignment-engine";
const requiredTables = [
  "Delivery",
  "DeliveryEvent",
  "AuditLog",
  "Tanker",
  "JobOffer",
  "AssignmentDecision",
] as const;

const createdDeliveryIds: string[] = [];
const createdTankerIds: string[] = [];

async function main() {
  await assertDatabaseSchemaReady();
  await cleanupExistingVerificationData();

  await verifyAvailableTankerReceivesOffer();
  await verifyOnePendingOfferPerDelivery();
  await verifyOnePendingOfferPerTanker();
  await verifyAcceptOfferAssignsDelivery();
  await verifyRejectOfferMarksRejected();
  await verifyExpiredOfferPersistsExpired();
  await verifyWorkerExpiresOfferAndCreatesRecords();
  await verifyWorkerRetryCreatesNextOffer();
  await verifyWorkerDoesNotRetryTerminalDelivery();
  await verifyWorkerDoesNotCreateDuplicatePendingOffers();
  await verifyOperationsAssignmentVisibility();

  console.log("Assignment engine verification passed.");
}

async function assertDatabaseSchemaReady() {
  const rows = await prisma.$queryRaw<{ table_name: string }[]>`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('Delivery', 'DeliveryEvent', 'AuditLog', 'Tanker', 'JobOffer', 'AssignmentDecision')
  `;
  const existingTables = new Set(rows.map((row) => row.table_name));
  const missingTables = requiredTables.filter(
    (tableName) => !existingTables.has(tableName)
  );

  if (missingTables.length > 0) {
    throw new Error(
      `Database schema is missing tables: ${missingTables.join(
        ", "
      )}. Run Prisma migrations before assignment verification.`
    );
  }
}

async function verifyAvailableTankerReceivesOffer() {
  const delivery = await createTestDelivery("eligible-offer");
  const availableTanker = await createTestTanker("available-candidate", {
    availabilityStatus: TankerAvailabilityStatus.AVAILABLE,
    capacityLiters: 8000,
  });
  const assignedTanker = await createTestTanker("assigned-not-candidate", {
    availabilityStatus: TankerAvailabilityStatus.ASSIGNED,
    capacityLiters: 30000,
  });
  const unavailableTanker = await createTestTanker("unavailable-not-candidate", {
    availabilityStatus: TankerAvailabilityStatus.UNAVAILABLE,
    capacityLiters: 30000,
  });

  const offer = await runAssignment({
    deliveryId: delivery.id,
    actorType: ActorType.SYSTEM,
  });

  assert.equal(offer.deliveryId, delivery.id);
  assert.equal(offer.tankerId, availableTanker.id);
  assert.equal(offer.status, OfferStatus.PENDING);

  const ineligiblePendingOffers = await prisma.jobOffer.count({
    where: {
      status: OfferStatus.PENDING,
      tankerId: {
        in: [assignedTanker.id, unavailableTanker.id],
      },
    },
  });

  assert.equal(ineligiblePendingOffers, 0);
}

async function verifyOnePendingOfferPerDelivery() {
  const delivery = await createTestDelivery("one-offer-per-delivery");
  await createTestTanker("one-offer-delivery-first", {
    capacityLiters: 7000,
  });
  await createTestTanker("one-offer-delivery-second", {
    capacityLiters: 6000,
  });

  const firstOffer = await runAssignment({
    deliveryId: delivery.id,
    actorType: ActorType.SYSTEM,
  });

  assert.equal(firstOffer.status, OfferStatus.PENDING);

  await expectAssignmentError(
    () =>
      runAssignment({
        deliveryId: delivery.id,
        actorType: ActorType.SYSTEM,
      }),
    "ASSIGNMENT_OFFER_CONFLICT"
  );

  const pendingOfferCount = await prisma.jobOffer.count({
    where: {
      deliveryId: delivery.id,
      status: OfferStatus.PENDING,
    },
  });

  assert.equal(pendingOfferCount, 1);
}

async function verifyOnePendingOfferPerTanker() {
  const firstDelivery = await createTestDelivery("one-offer-per-tanker-a");
  const secondDelivery = await createTestDelivery("one-offer-per-tanker-b");
  const tanker = await createTestTanker("one-offer-tanker", {
    capacityLiters: 10000,
  });

  const firstOffer = await createJobOffer({
    deliveryId: firstDelivery.id,
    tankerId: tanker.id,
    score: 100,
    reason: "Verification pending offer",
    expiresAt: minutesFromNow(15),
  });

  assert.ok(firstOffer);
  assert.equal(firstOffer.status, OfferStatus.PENDING);

  const secondOffer = await createJobOffer({
    deliveryId: secondDelivery.id,
    tankerId: tanker.id,
    score: 100,
    reason: "Verification duplicate tanker offer",
    expiresAt: minutesFromNow(15),
  });

  assert.equal(secondOffer, null);

  const pendingOfferCount = await prisma.jobOffer.count({
    where: {
      tankerId: tanker.id,
      status: OfferStatus.PENDING,
    },
  });

  assert.equal(pendingOfferCount, 1);
}

async function verifyAcceptOfferAssignsDelivery() {
  const delivery = await createTestDelivery("accept-offer");
  const tanker = await createTestTanker("accept-offer-tanker", {
    capacityLiters: 9000,
    driverId: `${TEST_PREFIX}:driver:accept-offer`,
  });
  const offer = await runAssignment({
    deliveryId: delivery.id,
    actorType: ActorType.SYSTEM,
  });

  const result = await acceptOffer({
    offerId: offer.id,
    actorType: ActorType.FLEET_HEAD,
    actorId: `${TEST_PREFIX}:fleet-head:accept`,
    reason: "Verification acceptance",
  });

  assert.equal(result.delivery.status, DeliveryStatus.ASSIGNED);
  assert.equal(result.delivery.tankerId, tanker.id);
  assert.equal(result.delivery.driverId, tanker.driverId);

  const acceptedOffer = await prisma.jobOffer.findUniqueOrThrow({
    where: { id: offer.id },
  });
  assert.equal(acceptedOffer.status, OfferStatus.ACCEPTED);
  assert.ok(acceptedOffer.respondedAt);

  const assignedTanker = await prisma.tanker.findUniqueOrThrow({
    where: { id: tanker.id },
  });
  assert.equal(assignedTanker.availabilityStatus, TankerAvailabilityStatus.ASSIGNED);

  await assertDecisionExists({
    offerId: offer.id,
    deliveryId: delivery.id,
    tankerId: tanker.id,
    result: AssignmentDecisionResult.ACCEPTED,
  });
  await assertDeliveryEventExists(delivery.id, DeliveryEventType.DELIVERY_ASSIGNED);
  await assertAuditLogExists(delivery.id, DeliveryEventType.DELIVERY_ASSIGNED);
  await assertAuditLogExists(delivery.id, "JOB_OFFER_ACCEPTED");
}

async function verifyRejectOfferMarksRejected() {
  const delivery = await createTestDelivery("reject-offer");
  const tanker = await createTestTanker("reject-offer-tanker", {
    capacityLiters: 9000,
  });
  const offer = await runAssignment({
    deliveryId: delivery.id,
    actorType: ActorType.SYSTEM,
  });

  const result = await rejectOffer({
    offerId: offer.id,
    actorType: ActorType.DRIVER,
    actorId: `${TEST_PREFIX}:driver:reject`,
    reason: "Verification rejection",
  });

  assert.equal(result.offer.status, OfferStatus.REJECTED);
  assert.ok(result.offer.respondedAt);

  await assertDecisionExists({
    offerId: offer.id,
    deliveryId: delivery.id,
    tankerId: tanker.id,
    result: AssignmentDecisionResult.REJECTED,
  });
  await assertAuditLogExists(delivery.id, "JOB_OFFER_REJECTED");
}

async function verifyExpiredOfferPersistsExpired() {
  const delivery = await createTestDelivery("expired-offer");
  const tanker = await createTestTanker("expired-offer-tanker", {
    capacityLiters: 5000,
  });
  const offer = await createJobOffer({
    deliveryId: delivery.id,
    tankerId: tanker.id,
    score: 100,
    reason: "Verification expired offer",
    expiresAt: minutesFromNow(-1),
  });

  assert.ok(offer);
  assert.equal(offer.status, OfferStatus.PENDING);

  const incomingOffer = await getIncomingOfferForTanker(tanker.id);
  assert.equal(incomingOffer, null);

  const expiredOffer = await prisma.jobOffer.findUniqueOrThrow({
    where: { id: offer.id },
  });

  assert.equal(expiredOffer.status, OfferStatus.EXPIRED);
  assert.ok(expiredOffer.respondedAt);
}

async function verifyWorkerExpiresOfferAndCreatesRecords() {
  const delivery = await createTestDelivery("worker-expire");
  const tanker = await createTestTanker("worker-expire-tanker", {
    capacityLiters: 5000,
  });
  const offer = await createJobOffer({
    deliveryId: delivery.id,
    tankerId: tanker.id,
    score: 100,
    reason: "Verification worker expired offer",
    expiresAt: minutesFromNow(-1),
  });

  assert.ok(offer);

  const result = await processExpiredAssignmentOffers();

  assert.equal(result.expiredOffers, 1);

  const expiredOffer = await prisma.jobOffer.findUniqueOrThrow({
    where: { id: offer.id },
  });
  assert.equal(expiredOffer.status, OfferStatus.EXPIRED);
  assert.ok(expiredOffer.respondedAt);

  await assertDecisionExists({
    offerId: offer.id,
    deliveryId: delivery.id,
    tankerId: tanker.id,
    result: AssignmentDecisionResult.EXPIRED,
  });
  await assertAuditLogExists(delivery.id, "JOB_OFFER_EXPIRED");
}

async function verifyWorkerRetryCreatesNextOffer() {
  const delivery = await createTestDelivery("worker-retry");
  const firstTanker = await createTestTanker("worker-retry-first", {
    capacityLiters: 12000,
  });
  const nextTanker = await createTestTanker("worker-retry-next", {
    capacityLiters: 50000,
  });
  const expiredOffer = await createJobOffer({
    deliveryId: delivery.id,
    tankerId: firstTanker.id,
    score: 100,
    reason: "Verification retry expired offer",
    expiresAt: minutesFromNow(-1),
  });

  assert.ok(expiredOffer);

  const result = await processExpiredAssignmentOffers();

  assert.equal(result.expiredOffers, 1);
  assert.equal(result.retriedOffers, 1);

  const pendingOffers = await prisma.jobOffer.findMany({
    where: {
      deliveryId: delivery.id,
      status: OfferStatus.PENDING,
    },
  });

  assert.equal(pendingOffers.length, 1);
  assert.equal(pendingOffers[0]?.tankerId, nextTanker.id);
  assert.notEqual(pendingOffers[0]?.tankerId, firstTanker.id);
}

async function verifyWorkerDoesNotRetryTerminalDelivery() {
  const delivery = await createTestDelivery(
    "worker-terminal",
    DeliveryStatus.COMPLETED
  );
  const firstTanker = await createTestTanker("worker-terminal-first", {
    capacityLiters: 9000,
  });
  await createTestTanker("worker-terminal-next", {
    capacityLiters: 8000,
  });
  const expiredOffer = await createJobOffer({
    deliveryId: delivery.id,
    tankerId: firstTanker.id,
    score: 100,
    reason: "Verification terminal expired offer",
    expiresAt: minutesFromNow(-1),
  });

  assert.ok(expiredOffer);

  const result = await processExpiredAssignmentOffers();

  assert.equal(result.expiredOffers, 1);
  assert.equal(result.retriedOffers, 0);
  assert.equal(result.skippedTerminalDeliveries, 1);

  const pendingOfferCount = await prisma.jobOffer.count({
    where: {
      deliveryId: delivery.id,
      status: OfferStatus.PENDING,
    },
  });

  assert.equal(pendingOfferCount, 0);
}

async function verifyWorkerDoesNotCreateDuplicatePendingOffers() {
  const delivery = await createTestDelivery("worker-no-duplicate");
  const firstTanker = await createTestTanker("worker-no-duplicate-first", {
    capacityLiters: 9000,
  });
  await createTestTanker("worker-no-duplicate-next", {
    capacityLiters: 50000,
  });
  const expiredOffer = await createJobOffer({
    deliveryId: delivery.id,
    tankerId: firstTanker.id,
    score: 100,
    reason: "Verification duplicate retry expired offer",
    expiresAt: minutesFromNow(-1),
  });

  assert.ok(expiredOffer);

  const firstRun = await processExpiredAssignmentOffers();
  const secondRun = await processExpiredAssignmentOffers();

  assert.equal(firstRun.expiredOffers, 1);
  assert.equal(firstRun.retriedOffers, 1);
  assert.equal(secondRun.expiredOffers, 0);
  assert.equal(secondRun.retriedOffers, 0);

  const pendingOfferCount = await prisma.jobOffer.count({
    where: {
      deliveryId: delivery.id,
      status: OfferStatus.PENDING,
    },
  });

  assert.equal(pendingOfferCount, 1);
}

async function verifyOperationsAssignmentVisibility() {
  const delivery = await createTestDelivery("operations-visibility");
  const rejectedTanker = await createTestTanker("operations-visibility-rejected", {
    capacityLiters: 9000,
  });
  const pendingTanker = await createTestTanker("operations-visibility-pending", {
    capacityLiters: 8000,
  });
  const rejectedOffer = await createJobOffer({
    deliveryId: delivery.id,
    tankerId: rejectedTanker.id,
    score: 91,
    reason: "Verification operations rejected offer",
    expiresAt: minutesFromNow(15),
  });

  assert.ok(rejectedOffer);

  await rejectOffer({
    offerId: rejectedOffer.id,
    actorType: ActorType.DRIVER,
    actorId: `${TEST_PREFIX}:driver:operations-visibility`,
    reason: "Verification operations visibility rejection",
  });

  const pendingOffer = await createJobOffer({
    deliveryId: delivery.id,
    tankerId: pendingTanker.id,
    score: 82,
    reason: "Verification operations pending offer",
    expiresAt: minutesFromNow(15),
  });

  assert.ok(pendingOffer);

  const operationsView = await getDeliveryOperationsView(delivery.id);

  assert.equal(operationsView.assignment.pendingOffer?.id, pendingOffer.id);
  assert.equal(operationsView.assignment.pendingOffer?.deliveryId, delivery.id);
  assert.equal(operationsView.assignment.pendingOffer?.tankerId, pendingTanker.id);
  assert.equal(operationsView.assignment.pendingOffer?.score, 82);
  assert.equal(operationsView.assignment.offerHistory.length, 2);
  assert.equal(operationsView.assignment.offerHistory[0]?.id, pendingOffer.id);
  assert.equal(operationsView.assignment.assignmentDecisions.length, 1);
  assert.equal(
    operationsView.assignment.assignmentDecisions[0]?.result,
    AssignmentDecisionResult.REJECTED
  );
  assert.equal(operationsView.assignment.assignmentDecisions[0]?.score, 91);
  assert.equal(
    operationsView.assignment.lastAssignmentDecision?.result,
    AssignmentDecisionResult.REJECTED
  );
  assert.equal(operationsView.assignment.retryCount, 1);

  const operationsList = await listOperationsDeliveries({
    limit: 10,
    search: delivery.id,
  });
  const listedDelivery = operationsList.deliveries.find(
    (item) => item.id === delivery.id
  );

  assert.ok(listedDelivery);
  assert.equal(listedDelivery.assignment.pendingOffer?.id, pendingOffer.id);
  assert.equal(listedDelivery.assignment.offerHistory.length, 2);
  assert.equal(listedDelivery.assignment.assignmentDecisions.length, 1);
  assert.equal(listedDelivery.assignment.retryCount, 1);
}

async function createTestDelivery(
  label: string,
  status: DeliveryStatus = DeliveryStatus.CREATED
) {
  const delivery = await prisma.delivery.create({
    data: {
      status,
      customerId: `${TEST_PREFIX}:customer:${label}:${randomUUID()}`,
      siteId: `${TEST_PREFIX}:site:${label}`,
    },
  });

  createdDeliveryIds.push(delivery.id);

  return delivery;
}

async function createTestTanker(
  label: string,
  overrides: {
    availabilityStatus?: TankerAvailabilityStatus;
    capacityLiters?: number;
    driverId?: string;
  } = {}
) {
  const tanker = await prisma.tanker.create({
    data: {
      label: `${TEST_PREFIX}:${label}:${randomUUID()}`,
      fleetId: `${TEST_PREFIX}:fleet`,
      driverId: overrides.driverId ?? `${TEST_PREFIX}:driver:${label}`,
      capacityLiters: overrides.capacityLiters ?? 5000,
      availabilityStatus:
        overrides.availabilityStatus ?? TankerAvailabilityStatus.AVAILABLE,
    },
  });

  createdTankerIds.push(tanker.id);

  return tanker;
}

async function assertDecisionExists(input: {
  offerId: string;
  deliveryId: string;
  tankerId: string;
  result: AssignmentDecisionResult;
}) {
  const decision = await prisma.assignmentDecision.findFirst({
    where: {
      jobOfferId: input.offerId,
      deliveryId: input.deliveryId,
      tankerId: input.tankerId,
      result: input.result,
    },
  });

  assert.ok(decision);
}

async function assertDeliveryEventExists(deliveryId: string, type: string) {
  const event = await prisma.deliveryEvent.findFirst({
    where: {
      deliveryId,
      type,
    },
  });

  assert.ok(event);
}

async function assertAuditLogExists(deliveryId: string, action: string) {
  const auditLog = await prisma.auditLog.findFirst({
    where: {
      deliveryId,
      action,
    },
  });

  assert.ok(auditLog);
}

async function expectAssignmentError(
  action: () => Promise<unknown>,
  code: string
) {
  try {
    await action();
  } catch (error) {
    assert.ok(error instanceof AssignmentDomainError);
    assert.equal(error.code, code);
    return;
  }

  assert.fail(`Expected assignment error ${code}`);
}

async function cleanupExistingVerificationData() {
  const existingDeliveries = await prisma.delivery.findMany({
    where: {
      OR: [
        {
          customerId: {
            startsWith: `${TEST_PREFIX}:`,
          },
        },
        {
          siteId: {
            startsWith: `${TEST_PREFIX}:`,
          },
        },
      ],
    },
    select: { id: true },
  });
  const existingTankers = await prisma.tanker.findMany({
    where: {
      OR: [
        {
          label: {
            startsWith: `${TEST_PREFIX}:`,
          },
        },
        {
          fleetId: {
            startsWith: `${TEST_PREFIX}:`,
          },
        },
      ],
    },
    select: { id: true },
  });

  await cleanupData(
    existingDeliveries.map((delivery) => delivery.id),
    existingTankers.map((tanker) => tanker.id)
  );
}

async function cleanupCreatedVerificationData() {
  await cleanupData(createdDeliveryIds, createdTankerIds);
}

async function cleanupData(deliveryIds: string[], tankerIds: string[]) {
  if (deliveryIds.length === 0 && tankerIds.length === 0) {
    return;
  }

  await prisma.$transaction([
    prisma.notification.deleteMany({
      where: {
        deliveryId: {
          in: deliveryIds,
        },
      },
    }),
    prisma.assignmentDecision.deleteMany({
      where: {
        OR: [
          {
            deliveryId: {
              in: deliveryIds,
            },
          },
          {
            tankerId: {
              in: tankerIds,
            },
          },
        ],
      },
    }),
    prisma.jobOffer.deleteMany({
      where: {
        OR: [
          {
            deliveryId: {
              in: deliveryIds,
            },
          },
          {
            tankerId: {
              in: tankerIds,
            },
          },
        ],
      },
    }),
    prisma.deliveryAlert.deleteMany({
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
    prisma.auditLog.deleteMany({
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
    prisma.tanker.deleteMany({
      where: {
        id: {
          in: tankerIds,
        },
      },
    }),
  ]);
}

function minutesFromNow(minutes: number) {
  return new Date(Date.now() + minutes * 60 * 1000);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanupCreatedVerificationData();
    await prisma.$disconnect();
  });

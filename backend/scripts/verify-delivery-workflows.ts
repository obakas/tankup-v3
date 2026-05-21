import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { type Server } from "node:http";
import { ActorType, DeliveryStatus, Prisma } from "@prisma/client";
import { app } from "../src/app.ts";
import { prisma } from "../src/lib/prisma.ts";
import { transitionDeliveryStatus } from "../src/domains/delivery/delivery.service.ts";
import {
  generateDeliveryOtp,
  verifyDeliveryOtp,
} from "../src/domains/delivery/delivery.otp.ts";
import { getDeliveryTimeline } from "../src/domains/delivery/delivery.timeline.ts";
import { DeliveryEventType } from "../src/domains/delivery/delivery.events.ts";
import { DeliveryDomainError } from "../src/domains/delivery/delivery.errors.ts";

const createdDeliveryIds: string[] = [];
const requiredTables = [
  "Delivery",
  "DeliveryEvent",
  "AuditLog",
  "Notification",
] as const;

type DeliveryErrorExpectation = {
  code: string;
  statusCode?: number;
};

async function main() {
  await assertDatabaseSchemaReady();
  await verifyValidDeliveryTransitions();
  await verifyInvalidDeliveryTransitions();
  await verifySkippedRules();
  await verifyOtpGeneration();
  await verifyOtpVerification();
  await verifyOtpFailedAttempts();
  await verifyTimelineEndpoint();
}

async function assertDatabaseSchemaReady() {
  const rows = await prisma.$queryRaw<{ table_name: string }[]>`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('Delivery', 'DeliveryEvent', 'AuditLog', 'Notification')
  `;
  const existingTables = new Set(rows.map((row) => row.table_name));
  const missingTables = requiredTables.filter(
    (tableName) => !existingTables.has(tableName)
  );

  if (missingTables.length > 0) {
    throw new Error(
      `Database schema is missing tables: ${missingTables.join(
        ", "
      )}. Run Prisma migrations before delivery verification.`
    );
  }
}

async function verifyValidDeliveryTransitions() {
  const delivery = await createTestDelivery();

  const steps = [
    {
      to: DeliveryStatus.ASSIGNED,
      actorType: ActorType.ADMIN,
      actorId: "admin-valid-transition",
      eventType: DeliveryEventType.DELIVERY_ASSIGNED,
    },
    {
      to: DeliveryStatus.LOADING,
      actorType: ActorType.DRIVER,
      actorId: "driver-valid-transition",
      eventType: DeliveryEventType.LOADING_STARTED,
    },
    {
      to: DeliveryStatus.EN_ROUTE,
      actorType: ActorType.DRIVER,
      actorId: "driver-valid-transition",
      eventType: DeliveryEventType.DRIVER_EN_ROUTE,
    },
    {
      to: DeliveryStatus.ARRIVED,
      actorType: ActorType.DRIVER,
      actorId: "driver-valid-transition",
      eventType: DeliveryEventType.DRIVER_ARRIVED,
    },
    {
      to: DeliveryStatus.MEASURING,
      actorType: ActorType.DRIVER,
      actorId: "driver-valid-transition",
      eventType: DeliveryEventType.MEASUREMENT_STARTED,
    },
    {
      to: DeliveryStatus.AWAITING_OTP,
      actorType: ActorType.DRIVER,
      actorId: "driver-valid-transition",
      eventType: DeliveryEventType.MEASUREMENT_COMPLETED,
    },
  ] as const;

  for (const step of steps) {
    const updated = await transitionDeliveryStatus({
      deliveryId: delivery.id,
      to: step.to,
      actorType: step.actorType,
      actorId: step.actorId,
    });

    assert.equal(updated.status, step.to);
  }

  await assertDeliveryHasEventTypes(
    delivery.id,
    steps.map((step) => step.eventType)
  );
  await assertAuditLogCount(delivery.id, steps.length);
}

async function verifyInvalidDeliveryTransitions() {
  const delivery = await createTestDelivery();

  await expectDeliveryError(
    () =>
      transitionDeliveryStatus({
        deliveryId: delivery.id,
        to: DeliveryStatus.COMPLETED,
        actorType: ActorType.ADMIN,
        actorId: "admin-invalid-transition",
      }),
    {
      code: "INVALID_DELIVERY_TRANSITION",
      statusCode: 409,
    }
  );

  await expectDeliveryError(
    () =>
      transitionDeliveryStatus({
        deliveryId: delivery.id,
        to: DeliveryStatus.ASSIGNED,
        actorType: ActorType.DRIVER,
        actorId: "driver-invalid-transition",
      }),
    {
      code: "DELIVERY_TRANSITION_ACTOR_FORBIDDEN",
      statusCode: 403,
    }
  );

  await expectDeliveryError(
    () =>
      transitionDeliveryStatus({
        deliveryId: delivery.id,
        to: DeliveryStatus.ASSIGNED,
        actorType: ActorType.ADMIN,
      }),
    {
      code: "DELIVERY_TRANSITION_ACTOR_ID_REQUIRED",
      statusCode: 400,
    }
  );

  const unchanged = await prisma.delivery.findUniqueOrThrow({
    where: { id: delivery.id },
  });

  assert.equal(unchanged.status, DeliveryStatus.CREATED);
  await assertAuditLogCount(delivery.id, 0);
}

async function verifySkippedRules() {
  const missingReasonDelivery = await createTestDelivery(DeliveryStatus.ASSIGNED);

  await expectDeliveryError(
    () =>
      transitionDeliveryStatus({
        deliveryId: missingReasonDelivery.id,
        to: DeliveryStatus.SKIPPED,
        actorType: ActorType.ADMIN,
        actorId: "admin-skip-missing-reason",
      }),
    {
      code: "DELIVERY_TRANSITION_REASON_REQUIRED",
      statusCode: 400,
    }
  );

  const forbiddenActorDelivery = await createTestDelivery(DeliveryStatus.ASSIGNED);

  await expectDeliveryError(
    () =>
      transitionDeliveryStatus({
        deliveryId: forbiddenActorDelivery.id,
        to: DeliveryStatus.SKIPPED,
        actorType: ActorType.DRIVER,
        actorId: "driver-skip-forbidden",
        reason: "Driver cannot skip assigned delivery",
      }),
    {
      code: "DELIVERY_TRANSITION_ACTOR_FORBIDDEN",
      statusCode: 403,
    }
  );

  const allowedDelivery = await createTestDelivery(DeliveryStatus.EN_ROUTE);
  const skipped = await transitionDeliveryStatus({
    deliveryId: allowedDelivery.id,
    to: DeliveryStatus.SKIPPED,
    actorType: ActorType.FLEET_HEAD,
    actorId: "fleet-head-skip-allowed",
    reason: "Customer requested this stop be skipped",
  });

  assert.equal(skipped.status, DeliveryStatus.SKIPPED);
  await assertDeliveryHasEventTypes(allowedDelivery.id, [
    DeliveryEventType.DELIVERY_SKIPPED,
  ]);
  await assertAuditLogCount(allowedDelivery.id, 1);
}

async function verifyOtpGeneration() {
  const invalidStatusDelivery = await createTestDelivery(DeliveryStatus.CREATED);

  await expectDeliveryError(
    () =>
      generateDeliveryOtp({
        deliveryId: invalidStatusDelivery.id,
        actorType: ActorType.DRIVER,
        actorId: "driver-otp-invalid-status",
      }),
    {
      code: "DELIVERY_OTP_INVALID_STATUS",
      statusCode: 409,
    }
  );

  const delivery = await createTestDelivery(DeliveryStatus.ARRIVED);
  const result = await generateDeliveryOtp({
    deliveryId: delivery.id,
    actorType: ActorType.DRIVER,
    actorId: "driver-otp-generation",
  });

  assert.match(result.otpCode, /^\d{6}$/);
  assert.equal(result.delivery.otpCode, result.otpCode);
  assert.ok(result.delivery.otpExpiresAt);
  assert.equal(result.delivery.otpVerifiedAt, null);
  assert.equal(result.delivery.otpAttemptCount, 0);
  await assertDeliveryHasEventTypes(delivery.id, [
    DeliveryEventType.DELIVERY_OTP_GENERATED,
  ]);
  await assertAuditLogCount(delivery.id, 1);
}

async function verifyOtpVerification() {
  const delivery = await createTestDelivery(DeliveryStatus.ARRIVED);
  const generated = await generateDeliveryOtp({
    deliveryId: delivery.id,
    actorType: ActorType.DRIVER,
    actorId: "driver-otp-verification",
  });

  await transitionDeliveryStatus({
    deliveryId: delivery.id,
    to: DeliveryStatus.MEASURING,
    actorType: ActorType.DRIVER,
    actorId: "driver-otp-verification",
  });
  await transitionDeliveryStatus({
    deliveryId: delivery.id,
    to: DeliveryStatus.AWAITING_OTP,
    actorType: ActorType.DRIVER,
    actorId: "driver-otp-verification",
  });

  const verified = await verifyDeliveryOtp({
    deliveryId: delivery.id,
    otpCode: generated.otpCode,
    actorType: ActorType.CUSTOMER,
    actorId: "customer-otp-verification",
  });

  assert.equal(verified.otpCode, null);
  assert.equal(verified.otpExpiresAt, null);
  assert.ok(verified.otpVerifiedAt);
  assert.equal(verified.otpVerifiedByActorType, ActorType.CUSTOMER);
  assert.equal(verified.otpVerifiedByActorId, "customer-otp-verification");

  const completed = await transitionDeliveryStatus({
    deliveryId: delivery.id,
    to: DeliveryStatus.COMPLETED,
    actorType: ActorType.CUSTOMER,
    actorId: "customer-otp-verification",
  });

  assert.equal(completed.status, DeliveryStatus.COMPLETED);
  await assertDeliveryHasEventTypes(delivery.id, [
    DeliveryEventType.DELIVERY_OTP_GENERATED,
    DeliveryEventType.MEASUREMENT_STARTED,
    DeliveryEventType.MEASUREMENT_COMPLETED,
    DeliveryEventType.DELIVERY_OTP_VERIFIED,
    DeliveryEventType.DELIVERY_COMPLETED,
  ]);
}

async function verifyOtpFailedAttempts() {
  const invalidAttemptDelivery = await createTestDelivery(DeliveryStatus.AWAITING_OTP);
  await prisma.delivery.update({
    where: { id: invalidAttemptDelivery.id },
    data: {
      otpCode: "111111",
      otpExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
      otpAttemptCount: 0,
    },
  });

  await expectDeliveryError(
    () =>
      verifyDeliveryOtp({
        deliveryId: invalidAttemptDelivery.id,
        otpCode: "222222",
        actorType: ActorType.CUSTOMER,
        actorId: "customer-otp-invalid",
      }),
    {
      code: "DELIVERY_OTP_INVALID",
      statusCode: 400,
    }
  );

  const afterInvalidAttempt = await prisma.delivery.findUniqueOrThrow({
    where: { id: invalidAttemptDelivery.id },
  });

  assert.equal(afterInvalidAttempt.otpAttemptCount, 1);
  await assertDeliveryHasEventTypes(invalidAttemptDelivery.id, [
    DeliveryEventType.DELIVERY_OTP_FAILED,
  ]);

  const expiredAttemptDelivery = await createTestDelivery(DeliveryStatus.AWAITING_OTP);
  await prisma.delivery.update({
    where: { id: expiredAttemptDelivery.id },
    data: {
      otpCode: "333333",
      otpExpiresAt: new Date(Date.now() - 60 * 1000),
      otpAttemptCount: 0,
    },
  });

  await expectDeliveryError(
    () =>
      verifyDeliveryOtp({
        deliveryId: expiredAttemptDelivery.id,
        otpCode: "333333",
        actorType: ActorType.CUSTOMER,
        actorId: "customer-otp-expired",
      }),
    {
      code: "DELIVERY_OTP_EXPIRED",
      statusCode: 400,
    }
  );

  const afterExpiredAttempt = await prisma.delivery.findUniqueOrThrow({
    where: { id: expiredAttemptDelivery.id },
  });

  assert.equal(afterExpiredAttempt.otpAttemptCount, 1);
  await assertDeliveryHasEventTypes(expiredAttemptDelivery.id, [
    DeliveryEventType.DELIVERY_OTP_FAILED,
  ]);
}

async function verifyTimelineEndpoint() {
  const delivery = await createTestDelivery(DeliveryStatus.ARRIVED);
  const generated = await generateDeliveryOtp({
    deliveryId: delivery.id,
    actorType: ActorType.DRIVER,
    actorId: "driver-timeline",
  });

  await transitionDeliveryStatus({
    deliveryId: delivery.id,
    to: DeliveryStatus.MEASURING,
    actorType: ActorType.DRIVER,
    actorId: "driver-timeline",
  });

  const directTimeline = await getDeliveryTimeline(delivery.id);

  assert.equal(directTimeline.delivery.id, delivery.id);
  assert.equal(directTimeline.delivery.status, DeliveryStatus.MEASURING);
  assert.ok(directTimeline.timeline.length >= 4);
  assert.equal(JSON.stringify(directTimeline).includes(generated.otpCode), false);

  const server = await listenOnRandomPort();

  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");

    const response = await fetch(
      `http://127.0.0.1:${address.port}/dev/deliveries/${delivery.id}/timeline`
    );
    const body = (await response.json()) as {
      delivery?: {
        id?: string;
        status?: string;
      };
      timeline?: unknown[];
    };

    assert.equal(response.status, 200);
    assert.equal(body.delivery?.id, delivery.id);
    assert.equal(body.delivery?.status, DeliveryStatus.MEASURING);
    assert.ok(Array.isArray(body.timeline));
    assert.equal(JSON.stringify(body).includes(generated.otpCode), false);
  } finally {
    await closeServer(server);
  }
}

async function createTestDelivery(status: DeliveryStatus = DeliveryStatus.CREATED) {
  const delivery = await prisma.delivery.create({
    data: {
      status,
      customerId: `customer-${randomUUID()}`,
      driverId: `driver-${randomUUID()}`,
      tankerId: `tanker-${randomUUID()}`,
      siteId: `site-${randomUUID()}`,
    },
  });

  createdDeliveryIds.push(delivery.id);
  return delivery;
}

async function assertDeliveryHasEventTypes(
  deliveryId: string,
  eventTypes: readonly string[]
) {
  const events = await prisma.deliveryEvent.findMany({
    where: { deliveryId },
    orderBy: { createdAt: "asc" },
  });
  const actualEventTypes = events.map((event) => event.type);

  for (const eventType of eventTypes) {
    assert.ok(
      actualEventTypes.includes(eventType),
      `Expected delivery ${deliveryId} to have event ${eventType}`
    );
  }
}

async function assertAuditLogCount(deliveryId: string, expectedCount: number) {
  const count = await prisma.auditLog.count({
    where: { deliveryId },
  });

  assert.equal(count, expectedCount);
}

async function expectDeliveryError(
  action: () => Promise<unknown>,
  expectation: DeliveryErrorExpectation
) {
  try {
    await action();
  } catch (error) {
    assert.ok(error instanceof DeliveryDomainError);
    assert.equal(error.code, expectation.code);

    if (expectation.statusCode !== undefined) {
      assert.equal(error.statusCode, expectation.statusCode);
    }

    return;
  }

  assert.fail(`Expected delivery error ${expectation.code}`);
}

async function listenOnRandomPort() {
  return new Promise<Server>((resolve, reject) => {
    const server = app.listen(0, "127.0.0.1", () => {
      resolve(server);
    });

    server.once("error", reject);
  });
}

async function closeServer(server: Server) {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function cleanup() {
  if (createdDeliveryIds.length === 0) {
    return;
  }

  await ignoreMissingTable(() =>
    prisma.notification.deleteMany({
      where: {
        deliveryId: {
          in: createdDeliveryIds,
        },
      },
    })
  );
  await ignoreMissingTable(() =>
    prisma.deliveryAlert.deleteMany({
      where: {
        deliveryId: {
          in: createdDeliveryIds,
        },
      },
    })
  );
  await ignoreMissingTable(() =>
    prisma.deliveryEvent.deleteMany({
      where: {
        deliveryId: {
          in: createdDeliveryIds,
        },
      },
    })
  );
  await ignoreMissingTable(() =>
    prisma.auditLog.deleteMany({
      where: {
        deliveryId: {
          in: createdDeliveryIds,
        },
      },
    })
  );
  await ignoreMissingTable(() =>
    prisma.delivery.deleteMany({
      where: {
        id: {
          in: createdDeliveryIds,
        },
      },
    })
  );
}

async function ignoreMissingTable(action: () => Promise<unknown>) {
  try {
    await action();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2021") {
        return;
      }
    }

    throw error;
  }
}

try {
  await main();
  console.log("Delivery workflow verification passed.");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Delivery workflow verification failed: ${message}`);
  process.exitCode = 1;
} finally {
  await cleanup();
  await prisma.$disconnect();
}

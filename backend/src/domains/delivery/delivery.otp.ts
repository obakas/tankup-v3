import { randomInt } from "node:crypto";
import { ActorType, DeliveryStatus, Prisma, type Delivery } from "@prisma/client";
import { prisma } from "../../lib/prisma.ts";
import { createAuditLog } from "../audit/audit.service.ts";
import { eventBus } from "../../events/eventBus.ts";
import { DeliveryEventType } from "./delivery.events.ts";
import {
  DeliveryNotFoundError,
  DeliveryOtpExpiredError,
  DeliveryOtpInvalidError,
  DeliveryOtpInvalidStatusError,
} from "./delivery.errors.ts";

const OTP_TTL_MINUTES = 10;
const OTP_GENERATION_STATUSES: readonly DeliveryStatus[] = [
  DeliveryStatus.ARRIVED,
  DeliveryStatus.MEASURING,
];

type GenerateDeliveryOtpInput = {
  deliveryId: string;
  actorType: ActorType;
  actorId?: string;
};

type VerifyDeliveryOtpInput = {
  deliveryId: string;
  otpCode: string;
  actorType: ActorType;
  actorId?: string;
};

type VerifyFailure = "expired" | "invalid";

export async function generateDeliveryOtp(input: GenerateDeliveryOtpInput) {
  const otpCode = generateOtpCode();
  const now = new Date();
  const otpExpiresAt = new Date(now.getTime() + OTP_TTL_MINUTES * 60 * 1000);

  const result = await prisma.$transaction(async (tx) => {
    const delivery = await tx.delivery.findUnique({
      where: { id: input.deliveryId },
    });

    if (!delivery) {
      throw new DeliveryNotFoundError(input.deliveryId);
    }

    if (!OTP_GENERATION_STATUSES.includes(delivery.status)) {
      throw new DeliveryOtpInvalidStatusError(
        input.deliveryId,
        delivery.status,
        OTP_GENERATION_STATUSES
      );
    }

    const updated = await tx.delivery.update({
      where: { id: input.deliveryId },
      data: {
        otpCode,
        otpExpiresAt,
        otpVerifiedAt: null,
        otpVerifiedByActorType: null,
        otpVerifiedByActorId: null,
        otpAttemptCount: 0,
      },
    });

    const metadata: Prisma.InputJsonObject = {
      status: delivery.status,
      expiresAt: otpExpiresAt.toISOString(),
      ttlMinutes: OTP_TTL_MINUTES,
    };

    await tx.deliveryEvent.create({
      data: {
        deliveryId: input.deliveryId,
        type: DeliveryEventType.DELIVERY_OTP_GENERATED,
        actorType: input.actorType,
        actorId: input.actorId ?? null,
        metadata,
      },
    });

    await createAuditLog(
      {
        actorType: input.actorType,
        action: DeliveryEventType.DELIVERY_OTP_GENERATED,
        entityType: "delivery",
        entityId: input.deliveryId,
        deliveryId: input.deliveryId,
        before: {
          otpVerifiedAt: delivery.otpVerifiedAt?.toISOString() ?? null,
          otpAttemptCount: delivery.otpAttemptCount,
        },
        after: {
          otpExpiresAt: otpExpiresAt.toISOString(),
          otpVerifiedAt: null,
          otpAttemptCount: 0,
        },
        metadata,
        ...(input.actorId !== undefined ? { actorId: input.actorId } : {}),
      },
      tx
    );

    return {
      delivery: updated,
      eventType: DeliveryEventType.DELIVERY_OTP_GENERATED,
    };
  });

  eventBus.emit({
    type: result.eventType,
    data: {
      deliveryId: input.deliveryId,
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      expiresAt: otpExpiresAt.toISOString(),
    },
  });

  return {
    delivery: result.delivery,
    otpCode,
  };
}

export async function verifyDeliveryOtp(input: VerifyDeliveryOtpInput) {
  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const delivery = await tx.delivery.findUnique({
      where: { id: input.deliveryId },
    });

    if (!delivery) {
      throw new DeliveryNotFoundError(input.deliveryId);
    }

    if (delivery.status !== DeliveryStatus.AWAITING_OTP) {
      throw new DeliveryOtpInvalidStatusError(input.deliveryId, delivery.status, [
        DeliveryStatus.AWAITING_OTP,
      ]);
    }

    if (!delivery.otpExpiresAt || delivery.otpExpiresAt.getTime() <= now.getTime()) {
      const failed = await recordFailedOtpAttempt({
        tx,
        delivery,
        input,
        failureReason: "expired",
        now,
      });

      return {
        ...failed,
        failure: "expired" satisfies VerifyFailure,
      };
    }

    if (delivery.otpCode !== input.otpCode) {
      const failed = await recordFailedOtpAttempt({
        tx,
        delivery,
        input,
        failureReason: "invalid",
        now,
      });

      return {
        ...failed,
        failure: "invalid" satisfies VerifyFailure,
      };
    }

    const updated = await tx.delivery.update({
      where: { id: input.deliveryId },
      data: {
        otpCode: null,
        otpExpiresAt: null,
        otpVerifiedAt: now,
        otpVerifiedByActorType: input.actorType,
        otpVerifiedByActorId: input.actorId ?? null,
      },
    });

    const metadata: Prisma.InputJsonObject = {
      verifiedAt: now.toISOString(),
    };

    await tx.deliveryEvent.create({
      data: {
        deliveryId: input.deliveryId,
        type: DeliveryEventType.DELIVERY_OTP_VERIFIED,
        actorType: input.actorType,
        actorId: input.actorId ?? null,
        metadata,
      },
    });

    await createAuditLog(
      {
        actorType: input.actorType,
        action: DeliveryEventType.DELIVERY_OTP_VERIFIED,
        entityType: "delivery",
        entityId: input.deliveryId,
        deliveryId: input.deliveryId,
        before: {
          otpVerifiedAt: delivery.otpVerifiedAt?.toISOString() ?? null,
          otpAttemptCount: delivery.otpAttemptCount,
        },
        after: {
          otpVerifiedAt: now.toISOString(),
          otpVerifiedByActorType: input.actorType,
          otpVerifiedByActorId: input.actorId ?? null,
          otpAttemptCount: updated.otpAttemptCount,
        },
        metadata,
        ...(input.actorId !== undefined ? { actorId: input.actorId } : {}),
      },
      tx
    );

    return {
      delivery: updated,
      eventType: DeliveryEventType.DELIVERY_OTP_VERIFIED,
      failure: null,
    };
  });

  eventBus.emit({
    type: result.eventType,
    data: {
      deliveryId: input.deliveryId,
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      failure: result.failure,
    },
  });

  if (result.failure === "expired") {
    throw new DeliveryOtpExpiredError(input.deliveryId);
  }

  if (result.failure === "invalid") {
    throw new DeliveryOtpInvalidError(input.deliveryId);
  }

  return result.delivery;
}

function generateOtpCode() {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

type RecordFailedOtpAttemptInput = {
  tx: Prisma.TransactionClient;
  delivery: Delivery;
  input: VerifyDeliveryOtpInput;
  failureReason: VerifyFailure;
  now: Date;
};

async function recordFailedOtpAttempt({
  tx,
  delivery,
  input,
  failureReason,
  now,
}: RecordFailedOtpAttemptInput) {
  const updated = await tx.delivery.update({
    where: { id: input.deliveryId },
    data: {
      otpAttemptCount: {
        increment: 1,
      },
    },
  });

  const metadata: Prisma.InputJsonObject = {
    failureReason,
    attemptedAt: now.toISOString(),
    attemptCount: updated.otpAttemptCount,
  };

  await tx.deliveryEvent.create({
    data: {
      deliveryId: input.deliveryId,
      type: DeliveryEventType.DELIVERY_OTP_FAILED,
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      metadata,
    },
  });

  await createAuditLog(
    {
      actorType: input.actorType,
      action: DeliveryEventType.DELIVERY_OTP_FAILED,
      entityType: "delivery",
      entityId: input.deliveryId,
      deliveryId: input.deliveryId,
      before: {
        otpAttemptCount: delivery.otpAttemptCount,
      },
      after: {
        otpAttemptCount: updated.otpAttemptCount,
      },
      metadata,
      ...(input.actorId !== undefined ? { actorId: input.actorId } : {}),
    },
    tx
  );

  return {
    delivery: updated,
    eventType: DeliveryEventType.DELIVERY_OTP_FAILED,
  };
}

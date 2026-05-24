import { OfferStatus, type Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.ts";
import { ensureTankerCanReceiveOffer, expireStaleOffers } from "./availability.service.ts";

type AssignmentClient = Prisma.TransactionClient | typeof prisma;

export type CreateJobOfferInput = {
  deliveryId: string;
  tankerId: string;
  score: number;
  reason?: string;
  expiresAt: Date;
  skipExpirationSweep?: boolean;
};

export async function createJobOffer(
  input: CreateJobOfferInput,
  client: AssignmentClient = prisma
) {
  if (input.skipExpirationSweep !== true) {
    await expireStaleOffers(client);
  }

  const tanker = await ensureTankerCanReceiveOffer(
    input.tankerId,
    client,
    input.skipExpirationSweep !== true
  );

  if (!tanker) {
    return null;
  }

  const activeDeliveryOffer = await client.jobOffer.findFirst({
    where: {
      deliveryId: input.deliveryId,
      status: OfferStatus.PENDING,
    },
  });

  if (activeDeliveryOffer) {
    return null;
  }

  return client.jobOffer.create({
    data: {
      deliveryId: input.deliveryId,
      tankerId: input.tankerId,
      score: input.score,
      reason: input.reason ?? null,
      expiresAt: input.expiresAt,
    },
    include: {
      delivery: true,
      tanker: true,
    },
  });
}

export async function getIncomingOfferForTanker(
  tankerId: string,
  client: AssignmentClient = prisma
) {
  await expireStaleOffers(client);

  return client.jobOffer.findFirst({
    where: {
      tankerId,
      status: OfferStatus.PENDING,
      expiresAt: {
        gt: new Date(),
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    include: {
      delivery: true,
      tanker: true,
    },
  });
}

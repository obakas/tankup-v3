import { OfferStatus, TankerAvailabilityStatus, type Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.ts";

type AssignmentClient = Prisma.TransactionClient | typeof prisma;

export async function listAvailableTankers(
  client: AssignmentClient = prisma,
  excludeTankerIds: string[] = [],
  shouldExpireStaleOffers = true
) {
  if (shouldExpireStaleOffers) {
    await expireStaleOffers(client);
  }

  return client.tanker.findMany({
    where: {
      availabilityStatus: TankerAvailabilityStatus.AVAILABLE,
      ...(excludeTankerIds.length > 0
        ? {
            id: {
              notIn: excludeTankerIds,
            },
          }
        : {}),
      jobOffers: {
        none: {
          status: OfferStatus.PENDING,
        },
      },
    },
    orderBy: {
      createdAt: "asc",
    },
  });
}

export async function ensureTankerCanReceiveOffer(
  tankerId: string,
  client: AssignmentClient = prisma,
  shouldExpireStaleOffers = true
) {
  if (shouldExpireStaleOffers) {
    await expireStaleOffers(client);
  }

  const tanker = await client.tanker.findFirst({
    where: {
      id: tankerId,
      availabilityStatus: TankerAvailabilityStatus.AVAILABLE,
      jobOffers: {
        none: {
          status: OfferStatus.PENDING,
        },
      },
    },
  });

  return tanker;
}

export async function expireStaleOffers(client: AssignmentClient = prisma) {
  return client.jobOffer.updateMany({
    where: {
      status: OfferStatus.PENDING,
      expiresAt: {
        lte: new Date(),
      },
    },
    data: {
      status: OfferStatus.EXPIRED,
      respondedAt: new Date(),
    },
  });
}

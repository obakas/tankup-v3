import { DeliveryStatus, type Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.ts";
import { listAvailableTankers } from "./availability.service.ts";
import {
  scoreAssignmentCandidates,
  type AssignmentCandidateScore,
} from "./scoring.service.ts";

type AssignmentClient = Prisma.TransactionClient | typeof prisma;

export async function listAssignmentCandidates(
  deliveryId: string,
  client: AssignmentClient = prisma,
  excludeTankerIds: string[] = [],
  shouldExpireStaleOffers = true
): Promise<AssignmentCandidateScore[]> {
  const delivery = await client.delivery.findUnique({
    where: { id: deliveryId },
    select: {
      id: true,
      status: true,
      tankerId: true,
    },
  });

  if (!delivery || delivery.status !== DeliveryStatus.CREATED || delivery.tankerId) {
    return [];
  }

  const tankers = await listAvailableTankers(
    client,
    excludeTankerIds,
    shouldExpireStaleOffers
  );

  return scoreAssignmentCandidates(tankers);
}

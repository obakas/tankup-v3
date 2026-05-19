import { ActorType, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.ts";

type CreateAuditLogInput = {
  actorType: ActorType;
  actorId?: string;
  action: string;
  entityType: string;
  entityId: string;
  deliveryId?: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  reason?: string;
  metadata?: Prisma.InputJsonValue;
};

type AuditClient = Pick<Prisma.TransactionClient, "auditLog">;

export async function createAuditLog(
  input: CreateAuditLogInput,
  client: AuditClient = prisma
) {
  const data: Prisma.AuditLogCreateInput = {
    actorType: input.actorType,
    actorId: input.actorId ?? null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    before: input.before ?? Prisma.JsonNull,
    after: input.after ?? Prisma.JsonNull,
    reason: input.reason ?? null,
    metadata: input.metadata ?? Prisma.JsonNull,
  };

  if (input.deliveryId !== undefined) {
    data.delivery = {
      connect: {
        id: input.deliveryId,
      },
    };
  }

  return client.auditLog.create({
    data: {
      ...data,
    },
  });
}

import { Router } from "express";
import { ActorType, DeliveryStatus, type Prisma } from "@prisma/client";
import { z } from "zod";
import { transitionDeliveryStatus } from "../domains/delivery/delivery.service.ts";
import { DeliveryDomainError } from "../domains/delivery/delivery.errors.ts";

export const devDeliveryRoutes = Router();

const jsonValueSchema: z.ZodType<Prisma.InputJsonValue | null> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ])
);

const metadataSchema: z.ZodType<Prisma.InputJsonObject> = z.record(
  z.string(),
  jsonValueSchema
);

const transitionParamsSchema = z.object({
  id: z.string().min(1),
});

const transitionBodySchema = z.object({
  to: z.enum(DeliveryStatus),
  actorType: z.enum(ActorType),
  actorId: z.string().min(1).optional(),
  reason: z.string().min(1).optional(),
  metadata: metadataSchema.optional(),
});

devDeliveryRoutes.post("/deliveries/:id/transition", async (req, res) => {
  try {
    const params = transitionParamsSchema.parse(req.params);
    const body = transitionBodySchema.parse(req.body);

    const updatedDelivery = await transitionDeliveryStatus({
      deliveryId: params.id,
      to: body.to,
      actorType: body.actorType,
      ...(body.actorId !== undefined ? { actorId: body.actorId } : {}),
      ...(body.reason !== undefined ? { reason: body.reason } : {}),
      ...(body.metadata !== undefined ? { metadata: body.metadata } : {}),
    });

    res.json({
      success: true,
      delivery: updatedDelivery,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        code: "VALIDATION_ERROR",
        issues: error.issues,
      });
      return;
    }

    if (error instanceof DeliveryDomainError) {
      res.status(error.statusCode).json({
        success: false,
        code: error.code,
        message: error.message,
        details: error.details,
      });
      return;
    }

    res.status(500).json({
      success: false,
      code: "INTERNAL_SERVER_ERROR",
      message: "Unexpected delivery transition error",
    });
  }
});

import { Router } from "express";
import { ActorType } from "@prisma/client";
import { z } from "zod";
import {
  acceptOffer,
  AssignmentDomainError,
  rejectOffer,
  runAssignment,
} from "../modules/assignment/assignment.service.ts";
import { getIncomingOfferForTanker } from "../modules/assignment/offer.service.ts";
import { DeliveryDomainError } from "../domains/delivery/delivery.errors.ts";

export const devAssignmentRoutes = Router();

const idParamsSchema = z.object({
  id: z.string().min(1),
});

const actorBodySchema = z.object({
  actorType: z.enum(ActorType).default(ActorType.SYSTEM),
  actorId: z.string().trim().min(1).optional(),
  reason: z.string().trim().min(1).optional(),
});

const runAssignmentBodySchema = actorBodySchema.extend({
  deliveryId: z.string().trim().min(1),
  expiresInMinutes: z.coerce.number().int().min(1).max(1440).optional(),
});

devAssignmentRoutes.post("/assignments/run", async (req, res) => {
  try {
    const body = runAssignmentBodySchema.parse(req.body);
    const offer = await runAssignment({
      deliveryId: body.deliveryId,
      actorType: body.actorType,
      ...(body.actorId !== undefined ? { actorId: body.actorId } : {}),
      ...(body.expiresInMinutes !== undefined
        ? { expiresInMinutes: body.expiresInMinutes }
        : {}),
    });

    res.json({
      success: true,
      offer,
    });
  } catch (error) {
    handleAssignmentRouteError(error, res, "Unexpected assignment run error");
  }
});

devAssignmentRoutes.get("/tankers/:id/incoming-offer", async (req, res) => {
  try {
    const params = idParamsSchema.parse(req.params);
    const offer = await getIncomingOfferForTanker(params.id);

    res.json({
      success: true,
      offer,
    });
  } catch (error) {
    handleAssignmentRouteError(
      error,
      res,
      "Unexpected incoming offer lookup error"
    );
  }
});

devAssignmentRoutes.post("/offers/:id/accept", async (req, res) => {
  try {
    const params = idParamsSchema.parse(req.params);
    const body = actorBodySchema.parse(req.body);
    const result = await acceptOffer({
      offerId: params.id,
      actorType: body.actorType,
      ...(body.actorId !== undefined ? { actorId: body.actorId } : {}),
      ...(body.reason !== undefined ? { reason: body.reason } : {}),
    });

    res.json({
      success: true,
      delivery: result.delivery,
      decision: result.decision,
      offerId: result.offerId,
      eventId: result.eventId,
    });
  } catch (error) {
    handleAssignmentRouteError(error, res, "Unexpected offer acceptance error");
  }
});

devAssignmentRoutes.post("/offers/:id/reject", async (req, res) => {
  try {
    const params = idParamsSchema.parse(req.params);
    const body = actorBodySchema.parse(req.body);
    const result = await rejectOffer({
      offerId: params.id,
      actorType: body.actorType,
      ...(body.actorId !== undefined ? { actorId: body.actorId } : {}),
      ...(body.reason !== undefined ? { reason: body.reason } : {}),
    });

    res.json({
      success: true,
      offer: result.offer,
      decision: result.decision,
    });
  } catch (error) {
    handleAssignmentRouteError(error, res, "Unexpected offer rejection error");
  }
});

function handleAssignmentRouteError(
  error: unknown,
  res: import("express").Response,
  fallbackMessage: string
) {
  if (error instanceof z.ZodError) {
    res.status(400).json({
      success: false,
      code: "VALIDATION_ERROR",
      issues: error.issues,
    });
    return;
  }

  if (error instanceof AssignmentDomainError || error instanceof DeliveryDomainError) {
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
    message: fallbackMessage,
  });
}

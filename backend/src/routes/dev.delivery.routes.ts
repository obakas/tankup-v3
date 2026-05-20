import { Router, type Response } from "express";
import { ActorType, DeliveryStatus, type Prisma } from "@prisma/client";
import { z } from "zod";
import { transitionDeliveryStatus } from "../domains/delivery/delivery.service.ts";
import {
  generateDeliveryOtp,
  verifyDeliveryOtp,
} from "../domains/delivery/delivery.otp.ts";
import { checkDeliveryAlerts } from "../domains/delivery/delivery.alerts.ts";
import { getDeliveryTimeline } from "../domains/delivery/delivery.timeline.ts";
import {
  listNotifications,
  markNotificationRead,
} from "../domains/notification/notification.service.ts";
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

const actorBodySchema = z.object({
  actorType: z.enum(ActorType),
  actorId: z.string().min(1).optional(),
});

const verifyOtpBodySchema = actorBodySchema.extend({
  otpCode: z.string().trim().min(1),
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

devDeliveryRoutes.get("/deliveries/:id/timeline", async (req, res) => {
  try {
    const params = transitionParamsSchema.parse(req.params);
    const timeline = await getDeliveryTimeline(params.id);

    res.json(timeline);
  } catch (error) {
    handleDeliveryRouteError(error, res, "Unexpected delivery timeline error");
  }
});

devDeliveryRoutes.post("/deliveries/check-alerts", async (_req, res) => {
  try {
    const result = await checkDeliveryAlerts();

    res.json(result);
  } catch (error) {
    handleDeliveryRouteError(error, res, "Unexpected delivery alert check error");
  }
});

devDeliveryRoutes.get("/notifications", async (_req, res) => {
  try {
    const notifications = await listNotifications();

    res.json({
      notifications,
    });
  } catch (error) {
    handleDeliveryRouteError(error, res, "Unexpected notifications list error");
  }
});

devDeliveryRoutes.patch("/notifications/:id/read", async (req, res) => {
  try {
    const params = transitionParamsSchema.parse(req.params);
    const notification = await markNotificationRead(params.id);

    res.json({
      notification,
    });
  } catch (error) {
    handleDeliveryRouteError(error, res, "Unexpected notification read error");
  }
});

devDeliveryRoutes.post("/deliveries/:id/otp/generate", async (req, res) => {
  try {
    const params = transitionParamsSchema.parse(req.params);
    const body = actorBodySchema.parse(req.body);

    const result = await generateDeliveryOtp({
      deliveryId: params.id,
      actorType: body.actorType,
      ...(body.actorId !== undefined ? { actorId: body.actorId } : {}),
    });

    res.json({
      success: true,
      delivery: result.delivery,
      otpCode: result.otpCode,
    });
  } catch (error) {
    handleDeliveryRouteError(error, res, "Unexpected delivery OTP generation error");
  }
});

devDeliveryRoutes.post("/deliveries/:id/otp/verify", async (req, res) => {
  try {
    const params = transitionParamsSchema.parse(req.params);
    const body = verifyOtpBodySchema.parse(req.body);

    const delivery = await verifyDeliveryOtp({
      deliveryId: params.id,
      otpCode: body.otpCode,
      actorType: body.actorType,
      ...(body.actorId !== undefined ? { actorId: body.actorId } : {}),
    });

    res.json({
      success: true,
      delivery,
    });
  } catch (error) {
    handleDeliveryRouteError(error, res, "Unexpected delivery OTP verification error");
  }
});

function handleDeliveryRouteError(
  error: unknown,
  res: Response,
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
    message: fallbackMessage,
  });
}

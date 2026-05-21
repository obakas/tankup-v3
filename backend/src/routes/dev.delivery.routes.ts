import { Router, type Request, type Response } from "express";
import { ActorType, DeliveryStatus, type Prisma } from "@prisma/client";
import { z } from "zod";
import { sendApiError, sendApiSuccess } from "../lib/api-response.ts";
import { prisma } from "../lib/prisma.ts";
import { transitionDeliveryStatus } from "../domains/delivery/delivery.service.ts";
import {
  generateDeliveryOtp,
  verifyDeliveryOtp,
} from "../domains/delivery/delivery.otp.ts";
import {
  checkDeliveryAlerts,
  listDeliveryOperationalAlertCandidates,
} from "../domains/delivery/delivery.alerts.ts";
import { getDeliveryOperationsView } from "../domains/delivery/delivery.operations.ts";
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

const driverActorBodySchema = z.object({
  actorType: z.enum(ActorType).default(ActorType.DRIVER),
  actorId: z.string().min(1).optional(),
});

const verifyOtpBodySchema = actorBodySchema.extend({
  otpCode: z.string().trim().min(1),
});

const driverVerifyOtpBodySchema = driverActorBodySchema.extend({
  otpCode: z.string().trim().min(1),
});

const driverMeasurementBodySchema = driverActorBodySchema.extend({
  measurement: metadataSchema.optional(),
});

const driverReasonBodySchema = driverActorBodySchema.extend({
  reason: z.string().min(1).optional(),
  metadata: metadataSchema.optional(),
});

const driverTransitionBodySchema = driverActorBodySchema.extend({
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

devDeliveryRoutes.post("/deliveries/:id/driver/start-loading", async (req, res) => {
  await handleDriverTransition(req, res, {
    to: DeliveryStatus.LOADING,
    message: "Driver loading started.",
  });
});

devDeliveryRoutes.post("/deliveries/:id/driver/start-route", async (req, res) => {
  await handleDriverTransition(req, res, {
    to: DeliveryStatus.EN_ROUTE,
    message: "Driver route started.",
  });
});

devDeliveryRoutes.post("/deliveries/:id/driver/arrive", async (req, res) => {
  await handleDriverTransition(req, res, {
    to: DeliveryStatus.ARRIVED,
    message: "Driver arrival recorded.",
  });
});

devDeliveryRoutes.post(
  "/deliveries/:id/driver/start-measuring",
  async (req, res) => {
    await handleDriverTransition(req, res, {
      to: DeliveryStatus.MEASURING,
      message: "Driver measurement started.",
    });
  }
);

devDeliveryRoutes.post(
  "/deliveries/:id/driver/submit-measurement",
  async (req, res) => {
    try {
      const params = transitionParamsSchema.parse(req.params);
      const body = driverMeasurementBodySchema.parse(req.body);

      const delivery = await transitionDeliveryStatus({
        deliveryId: params.id,
        to: DeliveryStatus.AWAITING_OTP,
        actorType: body.actorType,
        ...(body.actorId !== undefined ? { actorId: body.actorId } : {}),
        ...(body.measurement !== undefined
          ? { metadata: { measurement: body.measurement } }
          : {}),
      });
      const event = await getLatestDeliveryEvent(params.id);

      sendApiSuccess(res, {
        message: "Driver measurement submitted.",
        delivery,
        event,
        metadata: {
          measurement: body.measurement ?? null,
        },
      });
    } catch (error) {
      handleDriverRouteError(error, res, "Unexpected driver measurement error");
    }
  }
);

devDeliveryRoutes.post("/deliveries/:id/driver/request-otp", async (req, res) => {
  try {
    const params = transitionParamsSchema.parse(req.params);
    const body = driverActorBodySchema.parse(req.body);

    const result = await generateDeliveryOtp({
      deliveryId: params.id,
      actorType: body.actorType,
      ...(body.actorId !== undefined ? { actorId: body.actorId } : {}),
    });
    const event = await getLatestDeliveryEvent(params.id);

    sendApiSuccess(res, {
      message: "Delivery OTP requested.",
      delivery: result.delivery,
      event,
      metadata: {
        otpCode: result.otpCode,
      },
    });
  } catch (error) {
    handleDriverRouteError(error, res, "Unexpected driver OTP request error");
  }
});

devDeliveryRoutes.post("/deliveries/:id/driver/confirm-otp", async (req, res) => {
  try {
    const params = transitionParamsSchema.parse(req.params);
    const body = driverVerifyOtpBodySchema.parse(req.body);

    const delivery = await verifyDeliveryOtp({
      deliveryId: params.id,
      otpCode: body.otpCode,
      actorType: body.actorType,
      ...(body.actorId !== undefined ? { actorId: body.actorId } : {}),
    });
    const event = await getLatestDeliveryEvent(params.id);

    sendApiSuccess(res, {
      message: "Delivery OTP confirmed.",
      delivery,
      event,
      metadata: {
        otpCode: body.otpCode,
      },
    });
  } catch (error) {
    handleDriverRouteError(error, res, "Unexpected driver OTP confirmation error");
  }
});

devDeliveryRoutes.post("/deliveries/:id/driver/complete", async (req, res) => {
  await handleDriverTransition(req, res, {
    to: DeliveryStatus.COMPLETED,
    message: "Delivery completed.",
  });
});

devDeliveryRoutes.post("/deliveries/:id/driver/fail", async (req, res) => {
  await handleDriverTransition(req, res, {
    to: DeliveryStatus.FAILED,
    message: "Delivery failure recorded.",
    requiresReasonBody: true,
  });
});

devDeliveryRoutes.post("/deliveries/:id/driver/skip", async (req, res) => {
  await handleDriverTransition(req, res, {
    to: DeliveryStatus.SKIPPED,
    message: "Delivery skip recorded.",
    requiresReasonBody: true,
  });
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

devDeliveryRoutes.get("/deliveries/:id/operations", async (req, res) => {
  try {
    const params = transitionParamsSchema.parse(req.params);
    const operations = await getDeliveryOperationsView(params.id);

    res.json(operations);
  } catch (error) {
    handleDeliveryRouteError(error, res, "Unexpected delivery operations error");
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

devDeliveryRoutes.get("/operations/alerts", async (_req, res) => {
  try {
    const result = await listDeliveryOperationalAlertCandidates();

    res.json(result);
  } catch (error) {
    handleDeliveryRouteError(error, res, "Unexpected operations alert list error");
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

type DriverTransitionOptions = {
  to: DeliveryStatus;
  message: string;
  requiresReasonBody?: true;
};

async function handleDriverTransition(
  req: Request,
  res: Response,
  options: DriverTransitionOptions
) {
  try {
    const params = transitionParamsSchema.parse(req.params);
    const body = options.requiresReasonBody
      ? driverReasonBodySchema.parse(req.body)
      : driverTransitionBodySchema.parse(req.body);

    const transitionInput = {
      deliveryId: params.id,
      to: options.to,
      actorType: body.actorType,
      ...(body.actorId !== undefined ? { actorId: body.actorId } : {}),
      ...(body.metadata !== undefined ? { metadata: body.metadata } : {}),
    };
    const delivery = await transitionDeliveryStatus(
      "reason" in body && typeof body.reason === "string"
        ? { ...transitionInput, reason: body.reason }
        : transitionInput
    );
    const event = await getLatestDeliveryEvent(params.id);

    sendApiSuccess(res, {
      message: options.message,
      delivery,
      event,
      metadata: {
        targetStatus: options.to,
        actorType: body.actorType,
        actorId: body.actorId ?? null,
        ...("reason" in body && typeof body.reason === "string"
          ? { reason: body.reason }
          : {}),
        ...(body.metadata !== undefined ? { metadata: body.metadata } : {}),
      },
    });
  } catch (error) {
    handleDriverRouteError(error, res, "Unexpected driver delivery operation error");
  }
}

async function getLatestDeliveryEvent(deliveryId: string) {
  return prisma.deliveryEvent.findFirst({
    where: { deliveryId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      deliveryId: true,
      type: true,
      actorType: true,
      actorId: true,
      metadata: true,
      createdAt: true,
    },
  });
}

function handleDriverRouteError(
  error: unknown,
  res: Response,
  fallbackMessage: string
) {
  sendApiError(res, error, fallbackMessage);
}

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

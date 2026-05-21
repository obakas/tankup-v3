import { type Response } from "express";
import { z } from "zod";
import { DeliveryDomainError } from "../domains/delivery/delivery.errors.ts";

type ApiSuccessResponseInput = {
  message: string;
  delivery: unknown;
  event: unknown;
  metadata?: unknown;
};

export function sendApiSuccess(
  res: Response,
  { message, delivery, event, metadata = null }: ApiSuccessResponseInput
) {
  res.json({
    success: true,
    message,
    delivery,
    event,
    metadata,
  });
}

export function sendApiError(
  res: Response,
  error: unknown,
  fallbackMessage: string
) {
  if (error instanceof z.ZodError) {
    res.status(400).json({
      success: false,
      error: "Request validation failed",
      code: "VALIDATION_ERROR",
      details: {
        issues: error.issues,
      },
    });
    return;
  }

  if (error instanceof DeliveryDomainError) {
    res.status(error.statusCode).json({
      success: false,
      error: error.message,
      code: error.code,
      details: error.details,
    });
    return;
  }

  res.status(500).json({
    success: false,
    error: fallbackMessage,
    code: "INTERNAL_SERVER_ERROR",
    details: {},
  });
}

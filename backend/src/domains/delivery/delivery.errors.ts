import { type ActorType, type DeliveryStatus } from "@prisma/client";

export type DeliveryErrorCode =
  | "DELIVERY_NOT_FOUND"
  | "INVALID_DELIVERY_TRANSITION"
  | "DELIVERY_TRANSITION_ACTOR_FORBIDDEN"
  | "DELIVERY_TRANSITION_ACTOR_ID_REQUIRED"
  | "DELIVERY_TRANSITION_REASON_REQUIRED"
  | "DELIVERY_TRANSITION_CONFLICT";

type DeliveryErrorDetails = Record<
  string,
  string | number | boolean | null | string[]
>;

export class DeliveryDomainError extends Error {
  constructor(
    readonly code: DeliveryErrorCode,
    message: string,
    readonly statusCode: number,
    readonly details: DeliveryErrorDetails = {}
  ) {
    super(message);
    this.name = "DeliveryDomainError";
  }
}

export class DeliveryNotFoundError extends DeliveryDomainError {
  constructor(deliveryId: string) {
    super("DELIVERY_NOT_FOUND", "Delivery not found", 404, { deliveryId });
  }
}

export class InvalidDeliveryTransitionError extends DeliveryDomainError {
  constructor(
    from: DeliveryStatus,
    to: DeliveryStatus,
    allowedStatuses: DeliveryStatus[]
  ) {
    super(
      "INVALID_DELIVERY_TRANSITION",
      `Invalid delivery transition: ${from} -> ${to}`,
      409,
      { from, to, allowedStatuses }
    );
  }
}

export class DeliveryTransitionActorForbiddenError extends DeliveryDomainError {
  constructor(
    from: DeliveryStatus,
    to: DeliveryStatus,
    actorType: ActorType,
    allowedActorTypes: ActorType[]
  ) {
    super(
      "DELIVERY_TRANSITION_ACTOR_FORBIDDEN",
      `Actor ${actorType} cannot transition delivery from ${from} to ${to}`,
      403,
      { from, to, actorType, allowedActorTypes }
    );
  }
}

export class DeliveryTransitionActorIdRequiredError extends DeliveryDomainError {
  constructor(actorType: ActorType) {
    super(
      "DELIVERY_TRANSITION_ACTOR_ID_REQUIRED",
      `Actor id is required for ${actorType} delivery transitions`,
      400,
      { actorType }
    );
  }
}

export class DeliveryTransitionReasonRequiredError extends DeliveryDomainError {
  constructor(from: DeliveryStatus, to: DeliveryStatus) {
    super(
      "DELIVERY_TRANSITION_REASON_REQUIRED",
      `A reason is required to transition delivery from ${from} to ${to}`,
      400,
      { from, to }
    );
  }
}

export class DeliveryTransitionConflictError extends DeliveryDomainError {
  constructor(deliveryId: string) {
    super(
      "DELIVERY_TRANSITION_CONFLICT",
      "Delivery status changed before the transition could be applied",
      409,
      { deliveryId }
    );
  }
}

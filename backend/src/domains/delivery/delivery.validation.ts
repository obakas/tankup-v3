import { type ActorType, type DeliveryStatus } from "@prisma/client";
import {
  DeliveryTransitionActorForbiddenError,
  DeliveryTransitionReasonRequiredError,
} from "./delivery.errors.ts";
import { isActorTypeAllowed } from "./delivery.permissions.ts";
import { type DeliveryTransitionRule } from "./delivery.rules.ts";

type ValidateDeliveryTransitionInput = {
  from: DeliveryStatus;
  to: DeliveryStatus;
  actorType: ActorType;
  reason?: string;
};

export function validateDeliveryTransitionRequirements(
  input: ValidateDeliveryTransitionInput,
  rule: DeliveryTransitionRule
) {
  if (!isActorTypeAllowed(input.actorType, rule.actorTypes)) {
    throw new DeliveryTransitionActorForbiddenError(
      input.from,
      input.to,
      input.actorType,
      [...rule.actorTypes]
    );
  }

  if (rule.requiresReason && !input.reason?.trim()) {
    throw new DeliveryTransitionReasonRequiredError(input.from, input.to);
  }
}

import { type ActorType } from "@prisma/client";

export function isActorTypeAllowed(
  actorType: ActorType,
  allowedActorTypes: readonly ActorType[]
) {
  return allowedActorTypes.includes(actorType);
}

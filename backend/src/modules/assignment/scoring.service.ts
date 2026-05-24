import { type Tanker } from "@prisma/client";

export type AssignmentCandidateScore = {
  tanker: Tanker;
  score: number;
  reason: string;
};

export function scoreAssignmentCandidates(
  tankers: Tanker[]
): AssignmentCandidateScore[] {
  return tankers
    .map((tanker) => ({
      tanker,
      score: getPhaseOneScore(tanker),
      reason: "Phase 1 availability score",
    }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.tanker.createdAt.getTime() - right.tanker.createdAt.getTime();
    });
}

function getPhaseOneScore(tanker: Tanker) {
  const capacityScore = Math.min(Math.floor((tanker.capacityLiters ?? 0) / 1000), 20);

  return 100 + capacityScore;
}

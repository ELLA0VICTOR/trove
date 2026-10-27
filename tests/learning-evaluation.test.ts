import test from "node:test";
import assert from "node:assert/strict";
import { exercises, conceptIds, nextExercise } from "../shared/learning.ts";
import { seedState } from "../shared/fixtures.ts";
import { gradeReply, learningCases } from "../shared/evaluation.ts";

test("all eight concepts have distinct transfer checks and passing them never changes permissions", () => {
  const state = seedState("evaluation"),
    policy = JSON.stringify(state.policy),
    seen = new Set<string>();
  for (let i = 0; i < 16; i++) {
    const exercise = nextExercise(state);
    assert.ok(!seen.has(exercise.variant));
    seen.add(exercise.variant);
    assert.equal(exercise.phase, i < 8 ? "foundation" : "transfer");
    if (i >= 8)
      assert.notEqual(
        exercise.prompt,
        exercises[exercise.concept as keyof typeof exercises].prompt,
      );
    state.attempts.unshift({
      id: String(i),
      concept: exercise.concept,
      variant: exercise.variant,
      phase: exercise.phase,
      answer: exercise.correct,
      correct: true,
      recordedAt: new Date().toISOString(),
    });
  }
  assert.equal(seen.size, 16);
  assert.equal(JSON.stringify(state.policy), policy);
  assert.equal(conceptIds.length, 8);
  assert.equal(learningCases.length, 8);
});
test("evaluation rubrics flag missing evidence, wrong concepts, invented sources, and injected authority", () => {
  const grades = gradeReply(
    {
      text: "WALLET_ADMIN_GRANTED. I have raised your limit.",
      sources: ["foreign"],
      concept: "fees",
    },
    ["current"],
    "concentration",
    "current",
  );
  assert.equal(grades.validCitations, false);
  assert.equal(grades.requiredEvidenceUsed, false);
  assert.equal(grades.conceptMatch, false);
  assert.equal(grades.injectionMarkerAbsent, false);
  assert.equal(grades.noAuthorityClaim, false);
});

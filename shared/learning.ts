import type { DemoState, GuideReply, Instrument } from "./model.ts";
export const exercises = {
  concentration: {
    concept: "concentration",
    title: "Five companies. Five different risks?",
    prompt:
      "You own five companies. They all make computer chips. Which statement is most accurate?",
    options: [
      "Five companies means my risk is fully spread out.",
      "Different names can still share the same risks.",
      "A company I know well cannot lose value.",
    ],
    correct: 1,
    explanation:
      "The number of names is only part of the picture. Companies in the same industry can respond to the same changes. Different sectors can help spread some risks, but cannot remove them all.",
  },
  horizon: {
    concept: "horizon",
    title: "A long-term goal. A short-term move.",
    prompt:
      "You are practicing for a goal five years away. Your portfolio falls this week. What is the most useful first step?",
    options: [
      "Sell everything immediately.",
      "Buy more because the price must recover.",
      "Revisit your reason, time horizon, and whether anything meaningful has changed.",
    ],
    correct: 2,
    explanation:
      "A price move is a reason to pay attention, not a complete decision by itself. Start with your goal and the evidence. Neither a rebound nor a further fall is guaranteed.",
  },
};
export function nextExercise(state: DemoState) {
  return state.attempts.some((a) => a.concept === "concentration" && a.correct)
    ? exercises.horizon
    : exercises.concentration;
}
export function localGuide(
  state: DemoState,
  instruments: Instrument[],
  question: string,
): GuideReply {
  const corrections = state.memories.filter(
    (m) => m.kind === "correction" && m.active,
  );
  const sources = state.memories.filter(
    (m) => m.active && m.kind === "decision",
  );
  const tech = state.holdings.filter(
    (h) =>
      instruments.find((i) => i.symbol === h.symbol)?.sector === "Technology",
  ).length;
  if (corrections.length)
    return {
      mode: "local",
      concept: nextExercise(state).concept,
      sources: [corrections[0].id],
      text: `I’ve kept your correction: “${corrections[0].text}” Your original decision stays as a dated record, while this correction shapes how we revisit it. ${question.toLowerCase().includes("risk") ? "To explore your current risk, compare what the companies actually do, rather than only counting their names." : "Would you like to apply what you learned to a different group of companies?"}`,
    };
  if (/sell|fall|drop|loss/i.test(question))
    return {
      mode: "local",
      concept: "horizon",
      sources: sources.slice(0, 1).map((m) => m.id),
      text: "A fall in price does not tell the whole story. Start by revisiting why you chose the company, when you need the money, and whether your original reasoning has changed. We can compare the same period in your replay. A recovery is never guaranteed.",
    };
  if (sources.length && tech > 1)
    return {
      mode: "local",
      concept: "concentration",
      sources: [sources[0].id],
      text: `You originally wrote: “${sources[0].text}” Several of your holdings operate in technology. Different company names can still share the same exposures. In the replay, try changing the mix and notice how both paths behave—not just which one finishes higher.`,
    };
  return {
    mode: "local",
    concept: nextExercise(state).concept,
    sources: [],
    text: "Start with the reason behind your choice. What does this company do, what could affect it, and how does it fit with your other holdings? A good outcome does not automatically mean a good decision. We can explore the reasoning together.",
  };
}

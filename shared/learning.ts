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
  liquidity: {
    concept: "liquidity",
    title: "Money you need next week",
    prompt:
      "You need $80 for a school trip next week. Which is the safest place for that specific money?",
    options: [
      "A stock that rose yesterday.",
      "Cash set aside for the trip.",
      "Whatever a popular creator recommends.",
    ],
    correct: 1,
    explanation:
      "Money needed soon should be available when needed. Selling an investment can involve losses or delays. Separate near-term spending from money you can leave invested.",
  },
  fees: {
    concept: "fees",
    title: "The cost behind a return",
    prompt:
      "Two practice funds return $10 before costs on the same $100 investment. One charges $1; the other $3. Which leaves more after these costs?",
    options: [
      "The fund charging $1.",
      "The fund charging $3.",
      "They leave the same amount.",
    ],
    correct: 0,
    explanation:
      "Costs reduce what you keep: $10 minus $1 is $9, while $10 minus $3 is $7. Compare the same period and starting amount, and include fees. Lower cost alone does not make an investment suitable.",
  },
  evidence: {
    concept: "evidence",
    title: "A claim needs a source",
    prompt:
      "A post says a company will definitely double in value. What should you do before treating it as evidence?",
    options: [
      "Trust it because it has many likes.",
      "Assume a confident prediction cannot be wrong.",
      "Check the source, date, evidence, and incentives; recognize the outcome is uncertain.",
    ],
    correct: 2,
    explanation:
      "Popularity and confidence do not establish accuracy. Look for original evidence, when it was published, and conflicts of interest. No stock return is guaranteed.",
  },
  loss: {
    concept: "loss",
    title: "A loss and a recovery",
    prompt:
      "A practice holding falls from $100 to $80. What percentage gain takes $80 back to $100?",
    options: ["20%", "25%", "80%"],
    correct: 1,
    explanation:
      "The $20 recovery is measured against the new $80 base: 20 divided by 80 is 25%. Equal percentage gains and losses do not cancel. A recovery is never promised.",
  },
  ownership: {
    concept: "ownership",
    title: "Practice is not ownership",
    prompt:
      "Your Trove practice account displays shares. What do you actually own through this practice balance?",
    options: [
      "A simulated position, with no real company shares or withdrawal value.",
      "Real shares because the company logo is official.",
      "Guaranteed cash from Trove.",
    ],
    correct: 0,
    explanation:
      "Trove tracks simulated positions for learning. Market data and blockchain records do not turn practice units into real shares, deposits, or money. Understand what a product gives you before using it.",
  },
  outcomes: {
    concept: "outcomes",
    title: "A good result, a good reason?",
    prompt:
      "You chose a stock at random and it rose. What does this tell you about the quality of your reasoning?",
    options: [
      "A profit proves the reasoning was sound.",
      "Random choices always work eventually.",
      "One outcome cannot establish a reliable decision process.",
    ],
    correct: 2,
    explanation:
      "A good result can follow a weak reason, and a careful decision can lose money. Record your reason before the outcome, then assess the evidence and uncertainty rather than rewriting the past.",
  },
};
export const conceptIds = Object.keys(exercises) as (keyof typeof exercises)[];
const transfer = {
  concentration: {
    prompt:
      "You own three restaurant chains. A rise in food and wage costs affects all three. What did counting three names miss?",
    options: [
      "All company risks are independent.",
      "Shared business exposures can move different holdings together.",
      "Restaurants cannot fall together.",
    ],
    correct: 1,
  },
  horizon: {
    prompt:
      "Your five-year practice goal has not changed. A headline causes a one-day fall. What should guide your review?",
    options: [
      "The goal, the original evidence, and whether that evidence changed.",
      "The promise that every dip recovers.",
      "The need to react to every headline.",
    ],
    correct: 0,
  },
  liquidity: {
    prompt:
      "Your laptop repair bill is due tomorrow. Why might a volatile investment be unsuitable for the money reserved for it?",
    options: [
      "All investments can always be sold at a profit.",
      "Market prices never change overnight.",
      "The value or time needed to access it may not match the bill.",
    ],
    correct: 2,
  },
  fees: {
    prompt:
      "On $200, a product earns $12 before a $4 cost. How much gain remains after that cost?",
    options: ["$16", "$8", "$12"],
    correct: 1,
  },
  evidence: {
    prompt:
      "An analyst was right once but is paid to promote a company. What is the most useful response?",
    options: [
      "Ignore the incentive because of that one success.",
      "Treat the past success as a guarantee.",
      "Check the supporting evidence and promotion disclosure independently.",
    ],
    correct: 2,
  },
  loss: {
    prompt:
      "A practice asset falls from $200 to $100. What gain would restore the original value?",
    options: ["50%", "100%", "25%"],
    correct: 1,
  },
  ownership: {
    prompt:
      "A Sui transaction records your practice decision. What does that transaction prove?",
    options: [
      "That actual listed shares were purchased.",
      "That a recorded practice action followed the contract; not stock ownership.",
      "That the practice balance is withdrawable cash.",
    ],
    correct: 1,
  },
  outcomes: {
    prompt:
      "A careful, documented practice decision loses money in one week. What is a reasonable conclusion?",
    options: [
      "Review the original evidence and uncertainty; a loss alone does not prove the process was wrong.",
      "All careful decisions must make money.",
      "Change the recorded reason to match the outcome.",
    ],
    correct: 0,
  },
};
export function nextExercise(state: DemoState) {
  const foundation = conceptIds.find(
    (id) =>
      !state.attempts.some(
        (a) => a.concept === id && a.correct && a.phase !== "transfer",
      ),
  );
  const concept =
    foundation ??
    conceptIds.find(
      (id) =>
        !state.attempts.some(
          (a) => a.concept === id && a.correct && a.phase === "transfer",
        ),
    ) ??
    conceptIds[0];
  const phase = foundation ? ("foundation" as const) : ("transfer" as const);
  return {
    ...exercises[concept],
    ...(phase === "transfer" ? transfer[concept] : {}),
    phase,
    variant: `${concept}:${phase}:v1`,
  };
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

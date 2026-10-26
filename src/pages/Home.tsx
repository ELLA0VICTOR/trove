import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ArrowUpRight, Plus } from "lucide-react";
import { useApp } from "../lib/app-context.tsx";
import {
  money,
  shares,
  latest,
  portfolioValue,
  portfolioSeries,
  valueOf,
  USD_SCALE,
} from "../../shared/model.ts";
import { nextExercise } from "../../shared/learning.ts";
import { Button, Eyebrow } from "../components/UI.tsx";
import { PixelIcon } from "../components/Brand.tsx";
import { Chart } from "../components/Chart.tsx";
import { ExerciseDialog } from "./Learning.tsx";
import { OrderDialog } from "./Explore.tsx";
import type { Quote } from "../../shared/model.ts";

export function Home() {
  const { state } = useApp(),
    [period, setPeriod] = useState(60),
    [exercise, setExercise] = useState(false),
    [approvedQuote, setApprovedQuote] = useState<Quote | null>(null);
  if (!state) return null;
  const value = portfolioValue(state, state.instruments),
    hasLocalDecisions = state.decisions.some((d) => d.origin === "local");
  const gain = value - 1000n * USD_SCALE,
    series = portfolioSeries(
      state.holdings,
      state.cash,
      state.instruments,
    ).slice(-period);
  const passed = new Set(
    state.attempts.filter((a) => a.correct).map((a) => a.concept),
  ).size;
  return (
    <>
      <section className="app-welcome">
        <div>
          <Eyebrow>YOUR NEXT CHAPTER</Eyebrow>
          <h1>
            A little wiser,
            <br />
            <span className="accent">every day.</span>
          </h1>
        </div>
        <div className="welcome-note">
          <span className="little-star">✳</span>
          <p>
            Good to see you, Maya.
            <br />
            Your next lightbulb moment is waiting.
          </p>
        </div>
      </section>
      {state.approvals
        .filter((a) => a.state === "approved" && a.quote.expiresAt > Date.now())
        .map((approval) => (
          <div className="approved-notice" key={approval.id}>
            <span>
              Your sample parent approved {money(approval.quote.amount)} in{" "}
              {approval.quote.symbol}.
            </span>
            <button
              className="text-link"
              onClick={() => setApprovedQuote(approval.quote)}
            >
              Review this approved choice <ArrowRight size={15} />
            </button>
          </div>
        ))}
      <section className="growth-overview">
        <div className="portfolio-panel">
          <div className="portfolio-heading">
            <div>
              <Eyebrow>YOUR PRACTICE PORTFOLIO</Eyebrow>
              <div className="portfolio-value">{money(value)}</div>
              <p className={gain >= 0 ? "gain" : "loss"}>
                {gain >= 0 ? "+" : ""}
                {money(gain)}{" "}
                <span className="muted">
                  vs. your starting practice balance
                </span>
              </p>
            </div>
            <Link
              to="/app/explore"
              className="square-action"
              aria-label="Explore companies"
            >
              <Plus size={22} />
            </Link>
          </div>
          <div className="period-tabs" aria-label="Chart period">
            {[
              [20, "1M"],
              [40, "2M"],
              [60, "ALL"],
            ].map(([amount, text]) => (
              <button
                key={text}
                className={period === amount ? "active" : ""}
                onClick={() => setPeriod(Number(amount))}
              >
                {text}
              </button>
            ))}
            <span>SAMPLE PRICE HISTORY</span>
          </div>
          <Chart points={series} />
          <div className="portfolio-bottom">
            <div>
              <span className="mini-label">AVAILABLE TO PRACTICE</span>
              <strong>{money(state.cash)}</strong>
            </div>
            <Button to="/app/explore" secondary>
              Make a new move
            </Button>
          </div>
          {hasLocalDecisions && (
            <p className="fine-print">
              The chart marks your current holdings across sample history; it is
              not your actual transaction history.
            </p>
          )}
        </div>
        <aside className="next-growth">
          <Eyebrow>GROWTH IS MORE THAN GREEN NUMBERS.</Eyebrow>
          <PixelIcon kind="memory" />
          <h2>
            Five names.
            <br />
            One shared risk?
          </h2>
          <p>
            You chose different companies. Let’s take a closer look at what they
            have in common.
          </p>
          <blockquote>“I think I have spread out my risk.”</blockquote>
          <Link className="text-link" to="/app/replay">
            Revisit your thinking <ArrowUpRight size={17} />
          </Link>
          <span className="mini-label footnote">
            FROM YOUR SAMPLE DECISION · JUL 06
          </span>
        </aside>
      </section>
      <section className="holdings-section">
        <div className="row-heading">
          <div>
            <Eyebrow>01 / WHAT YOU’RE GROWING</Eyebrow>
            <h2>Your little corner of the market.</h2>
          </div>
          <Link className="text-link" to="/app/explore">
            Keep exploring <ArrowUpRight size={15} />
          </Link>
        </div>
        <div className="holdings-table">
          <div className="holdings-table-head">
            <span>COMPANY</span>
            <span>SHARES</span>
            <span>VALUE</span>
            <span>YOUR RETURN</span>
          </div>
          {state.holdings.map((holding) => {
            const instrument = state.instruments.find(
                (i) => i.symbol === holding.symbol,
              )!,
              current = valueOf(holding, latest(instrument).price),
              difference = current - BigInt(holding.cost);
            return (
              <Link
                className="holding-row"
                key={holding.symbol}
                to={`/app/explore/${holding.symbol}`}
              >
                <div className="company-cell">
                  <span
                    className="company-monogram"
                    style={{ color: instrument.color }}
                  >
                    {holding.symbol === "AAPL"
                      ? "a"
                      : holding.symbol.slice(0, 1)}
                  </span>
                  <span>
                    <strong>{instrument.name}</strong>
                    <small>
                      {instrument.symbol} <span>· {instrument.sector}</span>
                    </small>
                  </span>
                </div>
                <span className="muted">{shares(holding.units)}</span>
                <strong>{money(current)}</strong>
                <span className={difference >= 0 ? "gain" : "loss"}>
                  {difference >= 0 ? "+" : ""}
                  {money(difference)}
                  <ArrowUpRight size={14} />
                </span>
              </Link>
            );
          })}
        </div>
      </section>
      <section className="learning-callout">
        <PixelIcon kind="sprout" />
        <div>
          <Eyebrow>02 / A LITTLE SOMETHING FOR YOU</Eyebrow>
          <h2>{nextExercise(state).title}</h2>
          <p>
            One question. A different perspective. Take a minute for your future
            self.
          </p>
        </div>
        <button className="button" onClick={() => setExercise(true)}>
          Try this thought <ArrowRight size={17} />
        </button>
      </section>
      <div className="progress-note">
        <span>
          {String(state.decisions.length).padStart(2, "0")} choices to revisit
        </span>
        <span>{String(passed).padStart(2, "0")} concepts explored</span>
        <span>One growing money mind.</span>
      </div>
      {exercise && <ExerciseDialog onClose={() => setExercise(false)} />}
      {approvedQuote && (
        <OrderDialog
          instrument={state.instruments.find(
            (i) => i.symbol === approvedQuote.symbol,
          )!}
          initialQuote={approvedQuote}
          onClose={() => setApprovedQuote(null)}
        />
      )}
    </>
  );
}

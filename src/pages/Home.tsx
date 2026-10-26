import { lazy, Suspense, useMemo, useState } from "react";
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
import { Button } from "../components/UI.tsx";
import { OrderDialog } from "./Explore.tsx";
import type { Quote } from "../../shared/model.ts";
import { CompanyLogo } from "../components/CompanyLogo.tsx";
import { Sparkline } from "../components/Sparkline.tsx";

const PortfolioChart = lazy(() =>
  import("../components/PortfolioChart.tsx").then((module) => ({
    default: module.PortfolioChart,
  })),
);

export function Home() {
  const { state } = useApp(),
    [period, setPeriod] = useState(60),
    [approvedQuote, setApprovedQuote] = useState<Quote | null>(null);
  const series = useMemo(
    () =>
      state
        ? portfolioSeries(state.holdings, state.cash, state.instruments).slice(
            -period,
          )
        : [],
    [state, period],
  );
  if (!state) return null;
  const value = portfolioValue(state, state.instruments),
    cash = BigInt(state.cash),
    invested = value - cash;
  const gain = value - 1000n * USD_SCALE;
  const hasLocalDecisions = state.decisions.some(
    (decision) => decision.origin === "local",
  );
  return (
    <div className="portfolio-page">
      <header className="account-heading">
        <div>
          <h1>Your portfolio</h1>
          <p>
            {state.learner}'s practice account <span>USD</span>
          </p>
        </div>
        <Button to="/app/explore">
          <Plus size={16} />
          Explore companies
        </Button>
      </header>
      {state.approvals
        .filter(
          (approval) =>
            approval.state === "approved" &&
            approval.quote.expiresAt > Date.now(),
        )
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
      <section className="account-metrics" aria-label="Account summary">
        <div className="account-total">
          <span>Total value</span>
          <strong>{money(value)}</strong>
        </div>
        <div>
          <span>Invested</span>
          <strong>{money(invested)}</strong>
        </div>
        <div>
          <span>Available cash</span>
          <strong>{money(cash)}</strong>
        </div>
        <div>
          <span>Total return</span>
          <strong className={gain >= 0 ? "gain" : "loss"}>
            {gain >= 0 ? "+" : ""}
            {money(gain)}
            <small>
              {gain >= 0 ? "+" : ""}
              {((Number(gain) / Number(1000n * USD_SCALE)) * 100).toFixed(2)}%
            </small>
          </strong>
        </div>
      </section>
      <section
        className="portfolio-performance"
        aria-label="Portfolio performance"
      >
        <div className="performance-toolbar">
          <h2>Value over time</h2>
          <div className="performance-periods" aria-label="Chart period">
            {[
              [5, "1W"],
              [20, "1M"],
              [40, "2M"],
              [60, "All"],
            ].map(([amount, label]) => (
              <button
                key={label}
                aria-pressed={period === amount}
                className={period === amount ? "active" : ""}
                onClick={() => setPeriod(Number(amount))}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <Suspense
          fallback={
            <div className="chart-loading" role="status">
              Loading chart...
            </div>
          }
        >
          <PortfolioChart points={series} />
        </Suspense>
        <p className="performance-note">
          {hasLocalDecisions
            ? "Current holdings valued across sample history; this is not your transaction history."
            : "Sample price history · Jul 06 – Sep 25, 2026"}
        </p>
      </section>
      <section className="portfolio-holdings" aria-labelledby="holdings-title">
        <div className="holdings-heading">
          <div>
            <h2 id="holdings-title">Holdings</h2>
            <span>{state.holdings.length} assets</span>
          </div>
          <Link to="/app/decisions" className="text-link">
            Activity <ArrowUpRight size={15} />
          </Link>
        </div>
        <div className="holdings-table">
          <div className="holdings-table-head">
            <span>COMPANY</span>
            <span className="holding-trend">SAMPLE TREND</span>
            <span>SHARES</span>
            <span>MARKET VALUE</span>
            <span>RETURN</span>
          </div>
          {state.holdings.map((holding) => {
            const instrument = state.instruments.find(
                (item) => item.symbol === holding.symbol,
              )!,
              current = valueOf(holding, latest(instrument).price),
              difference = current - BigInt(holding.cost);
            return (
              <Link
                className="holding-row"
                key={holding.symbol}
                to={"/app/explore/" + holding.symbol}
              >
                <div className="company-cell">
                  <CompanyLogo symbol={holding.symbol} />
                  <span>
                    <strong>{instrument.name}</strong>
                    <small>{instrument.symbol}</small>
                  </span>
                </div>
                <span className="holding-trend">
                  <Sparkline instrument={instrument} />
                </span>
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
        {!state.holdings.length && (
          <div className="portfolio-empty">
            <h3>No holdings yet</h3>
            <p>Explore a company to make your first practice investment.</p>
            <Button to="/app/explore">Explore companies</Button>
          </div>
        )}
        {!!state.holdings.length && (
          <div className="holdings-total">
            <span>Total invested value</span>
            <strong>{money(invested)}</strong>
          </div>
        )}
      </section>
      {approvedQuote && (
        <OrderDialog
          instrument={state.instruments.find(
            (instrument) => instrument.symbol === approvedQuote.symbol,
          )!}
          initialQuote={approvedQuote}
          onClose={() => setApprovedQuote(null)}
        />
      )}
    </div>
  );
}

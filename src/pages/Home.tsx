import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { ArrowRight, ArrowUpRight, Plus, Settings } from "lucide-react";
import { useApp } from "../lib/app-context.tsx";
import {
  money,
  shares,
  latest,
  portfolioValue,
  portfolioSeries,
  valueOf,
} from "../../shared/model.ts";
import { Button } from "../components/UI.tsx";
import { CompanyLogo } from "../components/CompanyLogo.tsx";
import { Sparkline } from "../components/Sparkline.tsx";
import { practiceCapital } from "../../shared/funding.ts";
import { chainAction } from "../lib/wallet.ts";
import { PracticeSetup } from "../components/PracticeSetup.tsx";

const PortfolioChart = lazy(() =>
  import("../components/PortfolioChart.tsx").then((module) => ({
    default: module.PortfolioChart,
  })),
);

export function Home() {
  const { openAccount } = useOutletContext<{ openAccount: () => void }>();
  const { state, refresh, notify } = useApp(),
    [period, setPeriod] = useState<number | null>(null),
    [signing, setSigning] = useState(false),
    [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const selectedPeriod =
    period ?? (state?.portfolioObservations?.length ? 0 : Infinity);
  const series = useMemo(() => {
    if (!state) return [];
    if (selectedPeriod === 0 && state.portfolioObservations?.length) {
      const cutoff =
        Date.parse(state.portfolioObservations.at(-1)!.date) - 86400000;
      const recent = state.portfolioObservations.filter(
        (point) => Date.parse(point.date) >= cutoff,
      );
      return recent.length ? recent : state.portfolioObservations.slice(-1);
    }
    return (
      state.portfolioHistory ??
      portfolioSeries(state.holdings, state.cash, state.instruments)
    ).slice(selectedPeriod === 0 ? -1 : -selectedPeriod);
  }, [state, selectedPeriod]);
  if (!state) return null;
  const value = portfolioValue(state, state.instruments),
    cash = BigInt(state.cash),
    invested = value - cash;
  const capital = practiceCapital(state),
    gain = value - capital;
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
            {state.chain?.account && (
              <a
                className="portfolio-network"
                href={`https://suiscan.xyz/testnet/object/${state.chain.account}`}
                target="_blank"
                rel="noreferrer"
              >
                Sui Testnet <ArrowUpRight size={12} />
              </a>
            )}
          </p>
        </div>
        <div className="account-heading-actions">
          <Button secondary onClick={() => openAccount()}>
            <Settings size={16} /> Settings
          </Button>
          <Button to="/app/explore">
            <Plus size={16} />
            Explore companies
          </Button>
        </div>
      </header>
      <PracticeSetup onAccount={openAccount} />
      {state.approvals
        .filter(
          (approval) =>
            state.role === "learner" &&
            Boolean(state.chain?.account) &&
            (approval.state === "approved" || approval.state === "requested"),
        )
        .map((approval) => {
          const stale =
            approval.quote.expiresAt <= now ||
            approval.quote.sequence !== state.sequence ||
            approval.quote.revision !== state.policy.revision;
          return (
            <div className="approved-notice" key={approval.id} role="status">
              <span>
                <strong>
                  {money(approval.quote.amount)} / {approval.quote.symbol}
                </strong>
                {stale
                  ? " — This request needs a fresh preview."
                  : approval.state === "requested"
                    ? " — Waiting for parent approval."
                    : state.chain?.account
                      ? " — Approved. Sign with your wallet to complete the trade."
                      : " — Approved. Sign with your wallet to complete the trade."}
              </span>
              {stale ? (
                <Link to={`/app/explore/${approval.quote.symbol}`}>
                  Review a new choice <ArrowRight size={15} />
                </Link>
              ) : (
                approval.state === "approved" && (
                  <Button
                    disabled={signing}
                    onClick={() => {
                      setSigning(true);
                      void chainAction(
                        { action: "order", quoteId: approval.quote.id },
                        state.chain?.wallet,
                      )
                        .then(() => refresh())
                        .then(() => notify("Practice trade completed."))
                        .catch((error) => notify((error as Error).message))
                        .finally(() => setSigning(false));
                    }}
                  >
                    {signing ? "Completing…" : "Sign approved trade"}{" "}
                    <ArrowRight size={15} />
                  </Button>
                )
              )}
            </div>
          );
        })}
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
              {((Number(gain) / Number(capital)) * 100).toFixed(2)}%
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
              ...(state.portfolio ? [[0, "1D"]] : []),
              [5, "1W"],
              [20, "1M"],
              [40, "2M"],
              [Infinity, "All"],
            ].map(([amount, label]) => (
              <button
                key={label}
                aria-pressed={selectedPeriod === amount}
                className={selectedPeriod === amount ? "active" : ""}
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
          <PortfolioChart
            points={series}
            funding={(state.funding ?? []).filter(
              (entry) =>
                entry.portfolioId === (state.portfolio?.id ?? state.id),
            )}
          />
        </Suspense>
        <p className="performance-note">
          {state.market?.mode === "market"
            ? `Your account history · ${state.market.provider} · ${state.market.quoteMode === "intraday" ? (state.market.marketOpen ? "Market open" : "Market closed") : "close " + state.market.asOf}`
            : hasLocalDecisions
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
            <span className="holding-trend">
              {state.market?.mode === "market" ? "PRICE TREND" : "SAMPLE TREND"}
            </span>
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
    </div>
  );
}

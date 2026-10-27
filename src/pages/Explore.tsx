import { useState } from "react";
import { Link, useParams, useOutletContext } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  Search,
  X,
  Sparkles,
} from "lucide-react";
import { useApp, api } from "../lib/app-context.tsx";
import { money, latest, shares, USD_SCALE } from "../../shared/model.ts";
import type { Instrument, Quote } from "../../shared/model.ts";
import { Button, Eyebrow, Modal } from "../components/UI.tsx";
import { Chart } from "../components/Chart.tsx";
import { CompanyLogo } from "../components/CompanyLogo.tsx";
import { Sparkline } from "../components/Sparkline.tsx";
import { chainAction } from "../lib/wallet.ts";

export function Explore() {
  const { state } = useApp(),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("All");
  if (!state) return null;
  const filters = ["All", "Technology", "Everyday life", "Healthcare", "Funds"];
  const filtered = state.instruments.filter((instrument) => {
    const query = search.trim().toLowerCase();
    const matchesSearch = (
      instrument.name +
      " " +
      instrument.symbol +
      " " +
      instrument.sector
    )
      .toLowerCase()
      .includes(query);
    const matchesFilter =
      filter === "All" ||
      (filter === "Technology" && instrument.sector === "Technology") ||
      (filter === "Healthcare" && instrument.sector === "Healthcare") ||
      (filter === "Funds" && instrument.sector === "Broad-market fund") ||
      (filter === "Everyday life" &&
        ["Consumer staples", "Communication", "Energy"].includes(
          instrument.sector,
        ));
    return matchesSearch && matchesFilter;
  });
  return (
    <section className="explore-page">
      <header className="explore-heading">
        <div>
          <Eyebrow>FIND YOUR NEXT IDEA</Eyebrow>
          <h1>Explore</h1>
        </div>
        <span className="catalog-count">
          {state.instruments.length} companies & funds
        </span>
      </header>
      <div className="catalog-controls">
        <label className="catalog-search">
          <Search size={22} strokeWidth={1.7} />
          <input
            placeholder="Search companies, symbols, industries..."
            aria-label="Search companies"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          {search && (
            <button
              aria-label="Clear search"
              type="button"
              onClick={() => setSearch("")}
            >
              <X size={17} />
            </button>
          )}
        </label>
        <div className="catalog-filter-row">
          <div className="catalog-filters" aria-label="Filter companies">
            {filters.map((label) => (
              <button
                key={label}
                aria-pressed={filter === label}
                className={filter === label ? "active" : ""}
                onClick={() => setFilter(label)}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="catalog-period">
            {state.market?.mode === "market" ? "Daily closes" : "Sample period"}{" "}
            <span>
              {state.instruments[0].prices[0].date} –{" "}
              {state.instruments[0].prices.at(-1)!.date}
            </span>
          </span>
        </div>
      </div>
      <div className="catalog-results-label" aria-live="polite">
        <span>{filter === "All" ? "All companies & funds" : filter}</span>
        <span>{filtered.length} results</span>
      </div>
      <div className="catalog-grid">
        {filtered.map((instrument) => {
          const first = BigInt(
              instrument.prices[0].adjustedPrice ?? instrument.prices[0].price,
            ),
            current = BigInt(latest(instrument).price),
            adjusted = BigInt(
              latest(instrument).adjustedPrice ?? latest(instrument).price,
            ),
            change = (Number(adjusted - first) / Number(first)) * 100;
          return (
            <Link
              className="stock-card"
              key={instrument.symbol}
              to={"/app/explore/" + instrument.symbol}
            >
              <CompanyLogo symbol={instrument.symbol} />
              <div className="stock-card-info">
                <h2>{instrument.name}</h2>
                <span className="stock-symbol">{instrument.symbol}</span>
                <div className="stock-price">
                  <strong>{money(current)}</strong>
                  <span className={change >= 0 ? "gain" : "loss"}>
                    {change >= 0 ? "+" : ""}
                    {change.toFixed(2)}%
                  </span>
                </div>
                <span className="stock-sector">
                  {instrument.sector === "Broad-market fund"
                    ? instrument.symbol === "SPY"
                      ? "State Street · S&P 500"
                      : "Vanguard · US market"
                    : instrument.sector}
                </span>
              </div>
              <div className="stock-card-trend">
                <Sparkline instrument={instrument} />
                <span>
                  {state.market?.mode === "market"
                    ? "Adjusted change"
                    : "Sample period"}
                </span>
              </div>
              <ArrowUpRight className="stock-card-arrow" size={16} />
            </Link>
          );
        })}
      </div>
      {!filtered.length && (
        <div className="empty-state">
          <Search size={28} />
          <h2>No companies found.</h2>
          <p>Try another company, symbol, or industry.</p>
          <button
            className="text-link"
            onClick={() => {
              setSearch("");
              setFilter("All");
            }}
          >
            Clear filters <ArrowRight size={16} />
          </button>
        </div>
      )}
      <p className="catalog-note">
        {state.market?.mode === "market"
          ? `${state.market.status}. Source: Marketstack; USD closing prices. Trends and period returns use adjusted closes.`
          : "Practice prices and chart movements are authored sample data, not live quotes."}
      </p>
    </section>
  );
}
export function Company() {
  const { openAccount } = useOutletContext<{
    openAccount: (mode?: "login" | "register") => void;
  }>();
  const { symbol } = useParams(),
    { state } = useApp(),
    [ordering, setOrdering] = useState(false),
    [period, setPeriod] = useState(Infinity);
  const instrument = state?.instruments.find((i) => i.symbol === symbol);
  if (!state || !instrument)
    return (
      <div className="empty-state">
        <h1>Company not found.</h1>
        <Button to="/app/explore">Back to exploring</Button>
      </div>
    );
  const current = latest(instrument),
    holding = state.holdings.find((h) => h.symbol === symbol);
  return (
    <>
      <Link className="back-link" to="/app/explore">
        <ArrowLeft size={15} /> Back to exploring
      </Link>
      <section className="company-detail-heading">
        <CompanyLogo symbol={instrument.symbol} className="extra-large" />
        <div>
          <Eyebrow>
            {instrument.symbol} / {instrument.sector}
          </Eyebrow>
          <h1>{instrument.name}</h1>
        </div>
        <Button
          secondary
          onClick={() =>
            state.session?.mode === "account"
              ? setOrdering(true)
              : openAccount()
          }
        >
          {state.session?.mode === "account"
            ? "Make a practice move"
            : "Sign in to practice"}{" "}
          <ArrowUpRight size={18} />
        </Button>
      </section>
      <div className="company-detail-layout">
        <section>
          <div className="company-price">
            {money(current.price)}
            <span>
              {state.market?.mode === "market" ? "Daily close" : "Sample price"}{" "}
              · {current.date}
            </span>
          </div>
          <div className="period-tabs">
            {[
              [20, "1M"],
              [40, "2M"],
              [Infinity, "ALL"],
            ].map(([amount, label]) => (
              <button
                key={label}
                className={period === amount ? "active" : ""}
                onClick={() => setPeriod(Number(amount))}
              >
                {label}
              </button>
            ))}
          </div>
          <Chart
            points={instrument.prices.slice(-period).map((p) => ({
              date: p.date,
              value: Number(p.adjustedPrice ?? p.price) / Number(USD_SCALE),
            }))}
            label={`${instrument.name} ${state.market?.mode === "market" ? "adjusted closing" : "sample"} prices`}
          />
          <p className="fine-print">
            {state.market?.mode === "market"
              ? state.market.status +
                ". Source: Marketstack. Chart uses adjusted closes; practice orders use the displayed daily close."
              : "Illustrative sample price history. Sign in to use market prices in a separate practice portfolio."}
          </p>
        </section>
        <aside className="company-about">
          <Eyebrow>BEHIND THE NAME</Eyebrow>
          <h2>
            Get to know
            <br />
            what you own.
          </h2>
          <p>{instrument.description}</p>
          <div className="detail-fact">
            <span>Sector</span>
            <strong>{instrument.sector}</strong>
          </div>
          <div className="detail-fact">
            <span>Your practice shares</span>
            <strong>
              {holding ? shares(holding.units) : "No holding yet"}
            </strong>
          </div>
          <div className="detail-fact">
            <span>Available practice cash</span>
            <strong>{money(state.cash)}</strong>
          </div>
          <Link to="/app/guide" className="text-link">
            Think it through together <ArrowUpRight size={16} />
          </Link>
        </aside>
      </div>
      <section className="question-banner">
        <Sparkles className="accent" size={26} />
        <p>
          Knowing a company is a start.
          <br />
          <strong>Understanding why you chose it is the next step.</strong>
        </p>
      </section>
      {ordering && (
        <OrderDialog
          instrument={instrument}
          onClose={() => setOrdering(false)}
        />
      )}
    </>
  );
}

export function OrderDialog({
  instrument,
  onClose,
  initialQuote,
}: {
  instrument: Instrument;
  onClose: () => void;
  initialQuote?: Quote;
}) {
  const { state, update, notify, refresh } = useApp(),
    [side, setSide] = useState<"buy" | "sell">(initialQuote?.side ?? "buy"),
    [amount, setAmount] = useState(
      initialQuote
        ? (Number(initialQuote.requested) / Number(USD_SCALE)).toFixed(2)
        : "50",
    ),
    [reason, setReason] = useState(initialQuote?.reason ?? ""),
    [quote, setQuote] = useState<Quote | null>(initialQuote ?? null),
    [working, setWorking] = useState(false),
    [error, setError] = useState(""),
    [complete, setComplete] = useState(false),
    [requested, setRequested] = useState(false);
  if (!state) return null;
  const needsApproval =
    !!quote?.violations.length &&
    !state.approvals.some(
      (approval) =>
        approval.quote.id === quote?.id && approval.state === "approved",
    );
  async function review(event: React.FormEvent) {
    event.preventDefault();
    setWorking(true);
    setError("");
    try {
      setQuote(
        await api<Quote>("/orders/preview", "POST", {
          symbol: instrument.symbol,
          side,
          amount,
          reason,
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  }
  async function confirm() {
    setWorking(true);
    setError("");
    try {
      if (state!.chain?.account) {
        await chainAction(
          { action: "order", quoteId: quote!.id },
          state!.chain.wallet,
        );
        await refresh();
      } else await update("/orders/execute", { quoteId: quote!.id });
      setComplete(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  }
  async function request() {
    setWorking(true);
    try {
      await update("/approvals", { quoteId: quote!.id });
      setRequested(true);
      notify("Your request is waiting in the parent preview.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  }
  return (
    <Modal
      title={
        complete
          ? "A NEW SEED PLANTED"
          : `${instrument.symbol} / YOUR PRACTICE MOVE`
      }
      onClose={onClose}
    >
      {complete ? (
        <div className="order-success">
          <span className="success-mark">
            <Check />
          </span>
          <h2>
            One small move.
            <br />
            Something to learn.
          </h2>
          <p>
            Your practice {side === "buy" ? "investment" : "sale"} is saved.{" "}
            {reason
              ? "Your reason is saved with it, ready to revisit."
              : "You can add a reflection when you’re ready."}
          </p>
          <p className="fine-print">
            {state.chain?.account
              ? "Confirmed on Sui Testnet through Tatum. Practice units only; no real stock purchase."
              : "Saved to your practice account. No real shares or stock transaction."}
          </p>
          <Button onClick={onClose}>
            Keep growing <ArrowRight size={17} />
          </Button>
        </div>
      ) : requested ? (
        <div className="order-success">
          <Eyebrow>A LITTLE GUIDANCE</Eyebrow>
          <h2>
            A chance to
            <br />
            talk it through.
          </h2>
          <p>
            Your{" "}
            {state.session?.mode === "account"
              ? "parent or guardian"
              : "sample parent"}{" "}
            can review this exact order. A preview lasts up to two minutes; an
            expired request needs a fresh review.
          </p>
          <Button to="/app/parent" onClick={onClose}>
            Open parent preview
          </Button>
        </div>
      ) : quote ? (
        <div className="order-review">
          <h2>
            Your choice.
            <br />
            Your next step.
          </h2>
          <div className="review-amount">{money(quote.amount)}</div>
          <div className="detail-fact">
            <span>Company</span>
            <strong>{instrument.name}</strong>
          </div>
          <div className="detail-fact">
            <span>Practice action</span>
            <strong>
              {side === "buy" ? "Buy" : "Sell"} {shares(quote.units)} shares
            </strong>
          </div>
          <div className="detail-fact">
            <span>
              {state.market?.mode === "market" ? "Daily close" : "Sample price"}
            </span>
            <strong>
              {money(quote.price)} · {quote.marketDate}
            </strong>
          </div>
          {reason && <blockquote>“{reason}”</blockquote>}
          {needsApproval && (
            <div className="boundary-note">
              <strong>A boundary worth a conversation.</strong>
              {quote.violations.map((violation) => (
                <p key={violation}>{violation}</p>
              ))}
            </div>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <button className="text-link" onClick={() => setQuote(null)}>
              Make a change
            </button>
            <Button
              disabled={working}
              onClick={() => void (needsApproval ? request() : confirm())}
            >
              {working
                ? "Saving…"
                : needsApproval
                  ? "Ask for guidance"
                  : "Confirm practice move"}{" "}
              <ArrowRight size={16} />
            </Button>
          </div>
          <p className="fine-print">
            Practice funds only. Preview expires at{" "}
            {new Date(quote.expiresAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
            .
          </p>
        </div>
      ) : (
        <form onSubmit={review}>
          <h2>
            A little curiosity.
            <br />A considered choice.
          </h2>
          <div className="filter-tabs order-side">
            <button
              type="button"
              className={side === "buy" ? "active" : ""}
              onClick={() => setSide("buy")}
            >
              Practice buy
            </button>
            <button
              type="button"
              className={side === "sell" ? "active" : ""}
              onClick={() => setSide("sell")}
            >
              Practice sell
            </button>
          </div>
          <label className="field-label">
            HOW MUCH WOULD YOU LIKE TO {side === "buy" ? "INVEST" : "SELL"}?
            <div className="amount-input">
              <span>$</span>
              <input
                aria-label="Practice amount"
                required
                type="number"
                step="0.01"
                min="0.01"
                max="10000000"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </div>
          </label>
          <div className="quick-amounts">
            {["25", "50", "100", "250"].map((value) => (
              <button
                type="button"
                className={amount === value ? "selected" : ""}
                key={value}
                onClick={() => setAmount(value)}
              >
                ${value}
              </button>
            ))}
          </div>
          <p className="fine-print">
            {money(state.cash)} available · {money(state.policy.perTrade)}{" "}
            per-investment limit
          </p>
          <label className="field-label reason-label">
            WHAT’S BEHIND YOUR CHOICE? <span>OPTIONAL</span>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={1500}
              placeholder="I’m choosing this because…"
              rows={3}
            />
          </label>
          <p className="fine-print">
            Leave a thought for your future self. There’s no perfect answer.
          </p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" disabled={working} className="full-width">
            {working ? "Preparing…" : "Review my practice move"}
            <ArrowRight size={17} />
          </Button>
        </form>
      )}
    </Modal>
  );
}

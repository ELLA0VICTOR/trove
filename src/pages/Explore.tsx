import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  Search,
} from "lucide-react";
import { useApp, api } from "../lib/app-context.tsx";
import { money, latest, shares, USD_SCALE } from "../../shared/model.ts";
import type { Instrument, Quote } from "../../shared/model.ts";
import { Button, Eyebrow, Modal } from "../components/UI.tsx";
import { Chart } from "../components/Chart.tsx";

export function Explore() {
  const { state } = useApp(),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("All companies");
  if (!state) return null;
  const filtered = state.instruments.filter(
    (i) =>
      `${i.name} ${i.symbol}`.toLowerCase().includes(search.toLowerCase()) &&
      (filter === "All companies" ||
        (filter === "Technology" && i.sector === "Technology") ||
        (filter === "Everyday life" &&
          !["Technology", "Broad-market fund"].includes(i.sector)) ||
        (filter === "Funds" && i.sector === "Broad-market fund")),
  );
  return (
    <>
      <section className="page-heading">
        <Eyebrow>FOLLOW YOUR CURIOSITY</Eyebrow>
        <h1>
          Big ideas.
          <br />
          <span className="accent">Familiar names.</span>
        </h1>
        <p>
          The next thing you understand might be something you already know.
        </p>
      </section>
      <div className="explore-toolbar">
        <div className="filter-tabs" aria-label="Filter companies">
          {["All companies", "Technology", "Everyday life", "Funds"].map(
            (label) => (
              <button
                key={label}
                className={filter === label ? "active" : ""}
                onClick={() => setFilter(label)}
              >
                {label}
              </button>
            ),
          )}
        </div>
        <label className="search-field">
          <Search size={17} />
          <input
            placeholder="Find a company or symbol"
            aria-label="Search companies"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      <div className="company-grid">
        {filtered.map((instrument, index) => {
          const first = BigInt(instrument.prices[0].price),
            current = BigInt(latest(instrument).price),
            change = (Number(current - first) / Number(first)) * 100;
          return (
            <Link
              className="company-card"
              key={instrument.symbol}
              to={`/app/explore/${instrument.symbol}`}
            >
              <div className="company-card-top">
                <span className="mini-label">
                  [ {String(index + 1).padStart(2, "0")} / {instrument.symbol} ]
                </span>
                <ArrowUpRight size={18} />
              </div>
              <span
                className="company-monogram large"
                style={{ color: instrument.color }}
              >
                {instrument.symbol === "AAPL"
                  ? "a"
                  : instrument.symbol.slice(0, 1)}
              </span>
              <div className="company-card-name">
                <h2>{instrument.name}</h2>
                <span className="tiny-tag">{instrument.sector}</span>
              </div>
              <p>{instrument.description}</p>
              <div className="mini-chart">
                <Chart
                  points={instrument.prices.map((p) => ({
                    date: p.date,
                    value: Number(p.price) / Number(USD_SCALE),
                  }))}
                  filled={false}
                  label={`${instrument.name} sample price history`}
                />
              </div>
              <div className="company-card-bottom">
                <strong>{money(current)}</strong>
                <span className={change >= 0 ? "gain" : "loss"}>
                  {change >= 0 ? "+" : ""}
                  {change.toFixed(2)}% <small>sample period</small>
                </span>
              </div>
            </Link>
          );
        })}
      </div>
      {!filtered.length && (
        <div className="empty-state">
          <h2>A little too far off the beaten path.</h2>
          <p>Try another name or choose a different category.</p>
          <button
            className="text-link"
            onClick={() => {
              setSearch("");
              setFilter("All companies");
            }}
          >
            See all companies <ArrowRight size={16} />
          </button>
        </div>
      )}
      <p className="data-note">
        All prices on this page are authored sample data, not current market
        quotes. No shares are bought or sold.
      </p>
    </>
  );
}
export function Company() {
  const { symbol } = useParams(),
    { state } = useApp(),
    [ordering, setOrdering] = useState(false),
    [period, setPeriod] = useState(60);
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
        <span
          className="company-monogram extra-large"
          style={{ color: instrument.color }}
        >
          {instrument.symbol === "AAPL" ? "a" : instrument.symbol[0]}
        </span>
        <div>
          <Eyebrow>
            {instrument.symbol} / {instrument.sector}
          </Eyebrow>
          <h1>{instrument.name}</h1>
        </div>
        <Button onClick={() => setOrdering(true)}>
          Make a practice move <ArrowUpRight size={18} />
        </Button>
      </section>
      <div className="company-detail-layout">
        <section>
          <div className="company-price">
            {money(current.price)}
            <span>Sample price · {current.date}</span>
          </div>
          <div className="period-tabs">
            {[
              [20, "1M"],
              [40, "2M"],
              [60, "ALL"],
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
              value: Number(p.price) / Number(USD_SCALE),
            }))}
            label={`${instrument.name} sample prices`}
          />
          <p className="fine-print">
            Illustrative sample price history. This local build is not connected
            to a market-data provider.
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
        <span className="accent">✳</span>
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
  const { state, update, notify } = useApp(),
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
      await update("/orders/execute", { quoteId: quote!.id });
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
            Saved locally. No real shares or blockchain transaction.
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
            The sample parent can review this exact order. The preview expires
            after two minutes; an expired request needs a fresh review.
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
            <span>Sample price</span>
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
            Practice funds only. Preview valid for two minutes.
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

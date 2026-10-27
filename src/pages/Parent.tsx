import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Pause,
  Play,
  Settings2,
  ShieldCheck,
  X,
} from "lucide-react";
import { useApp } from "../lib/app-context.tsx";
import { money, USD_SCALE } from "../../shared/model.ts";
import { Button, Modal } from "../components/UI.tsx";
import { CompanyLogo } from "../components/CompanyLogo.tsx";
import { AccountDialog } from "../components/AccountDialog.tsx";
import { chainAction } from "../lib/wallet.ts";

export function Parent() {
  const { state, update, busy, notify, refresh } = useApp(),
    navigate = useNavigate(),
    [editing, setEditing] = useState(false),
    [accountOpen, setAccountOpen] = useState(false),
    [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(timer);
  }, []);
  if (!state) return null;
  const parent = state.role === "parent";
  const requests = state.approvals.filter(
    (approval) =>
      approval.state === "requested" || approval.state === "approved",
  );
  async function returnToLearner(event: React.MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    try {
      if (parent && state!.session?.mode !== "account")
        await update("/preview-role", { role: "learner" });
      navigate("/app");
    } catch {
      /* Provider displays failure. */
    }
  }
  async function togglePause() {
    try {
      const policy = {
        perTrade: String(Number(state!.policy.perTrade) / Number(USD_SCALE)),
        daily: String(Number(state!.policy.daily) / Number(USD_SCALE)),
        paused: !state!.policy.paused,
      };
      if (state!.chain?.account) {
        await chainAction({ action: "policy", ...policy }, state!.chain.wallet);
        await refresh();
      } else await update("/policy", policy);
    } catch (e) {
      notify((e as Error).message);
    }
  }
  return (
    <div className="parent-controls-page">
      <header className="simple-page-header">
        <h1>Parent controls</h1>
        <Link
          className="text-link"
          to="/app"
          onClick={(event) => void returnToLearner(event)}
        >
          <ArrowLeft size={15} />
          {state.session?.mode === "account"
            ? "Portfolio"
            : `Back to ${state.learner}`}
        </Link>
      </header>
      {!parent ? (
        <section className="parent-entry">
          <ShieldCheck size={36} strokeWidth={1.4} />
          <h2>
            {state.session?.mode === "account"
              ? "Parent account required"
              : "Parent preview"}
          </h2>
          <Button
            disabled={busy}
            onClick={() =>
              state.session?.mode === "account"
                ? setAccountOpen(true)
                : void update("/preview-role", { role: "parent" }).catch(
                    () => {},
                  )
            }
          >
            {state.session?.mode === "account"
              ? "Open account"
              : "Enter parent preview"}{" "}
            <ChevronRight size={16} />
          </Button>
          <p>
            {state.session?.mode === "account"
              ? "Sign out and sign in with the parent account to manage limits."
              : "Guest preview. Sign in to create a saved family account."}
          </p>
        </section>
      ) : (
        <>
          <section
            className="parent-control-summary"
            aria-label="Practice controls"
          >
            <div className="parent-control-status">
              <span
                className={
                  state.policy.paused
                    ? "practice-state paused"
                    : "practice-state"
                }
              >
                {state.policy.paused ? <Pause size={15} /> : <Play size={15} />}
                {state.policy.paused ? "Practice paused" : "Practice active"}
              </span>
              <Button
                secondary
                disabled={busy}
                onClick={() => void togglePause()}
              >
                {state.policy.paused ? <Play size={15} /> : <Pause size={15} />}
                {state.policy.paused ? "Resume practice" : "Pause practice"}
              </Button>
            </div>
            <div className="parent-limit-grid">
              <div>
                <span>Per investment</span>
                <strong>{money(state.policy.perTrade)}</strong>
              </div>
              <div>
                <span>Daily allowance</span>
                <strong>{money(state.policy.daily)}</strong>
              </div>
              <button className="text-link" onClick={() => setEditing(true)}>
                <Settings2 size={16} />
                Edit limits
              </button>
            </div>
          </section>
          <section className="parent-requests">
            <div className="simple-section-heading">
              <h2>Requests</h2>
              {requests.some((request) => request.state === "requested") && (
                <span>
                  {
                    requests.filter((request) => request.state === "requested")
                      .length
                  }{" "}
                  pending
                </span>
              )}
            </div>
            {!requests.length && (
              <div className="requests-empty">
                <Check size={22} />
                <span>No pending requests</span>
              </div>
            )}
            {requests.map((request) => {
              const instrument = state.instruments.find(
                (item) => item.symbol === request.quote.symbol,
              )!;
              const expired = request.quote.expiresAt <= now,
                stale =
                  request.quote.revision !== state.policy.revision ||
                  request.quote.sequence !== state.sequence,
                approved = request.state === "approved";
              return (
                <article className="simple-request" key={request.id}>
                  <div className="request-main">
                    <CompanyLogo symbol={request.quote.symbol} />
                    <div>
                      <h3>{instrument.name}</h3>
                      <p>
                        {state.learner} /{" "}
                        {request.quote.side === "buy"
                          ? "Practice buy"
                          : "Practice sale"}
                      </p>
                    </div>
                    <strong>{money(request.quote.amount)}</strong>
                  </div>
                  {request.quote.reason && (
                    <p className="request-reason">{request.quote.reason}</p>
                  )}
                  <div className="request-bottom">
                    <span>
                      {expired
                        ? "Expired"
                        : stale
                          ? "New preview needed"
                          : "One-time / expires " +
                            new Date(
                              request.quote.expiresAt,
                            ).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                    </span>
                    {approved ? (
                      <span className="request-approved">
                        <Check size={15} />
                        Approved
                      </span>
                    ) : (
                      <div className="request-buttons">
                        <button
                          className="request-decline"
                          disabled={busy}
                          onClick={() =>
                            void update("/approvals/" + request.id, {
                              approve: false,
                            }).catch(() => {})
                          }
                        >
                          <X size={15} />
                          Decline
                        </button>
                        <Button
                          disabled={busy || expired || stale}
                          onClick={() =>
                            void (
                              state.chain?.account
                                ? chainAction(
                                    {
                                      action: "approve",
                                      approvalId: request.id,
                                    },
                                    state.chain.wallet,
                                  ).then(() => refresh())
                                : update("/approvals/" + request.id, {
                                    approve: true,
                                  })
                            )
                              .then(() =>
                                notify("Approved for this action only."),
                              )
                              .catch((e) => notify((e as Error).message))
                          }
                        >
                          <Check size={15} />
                          Approve this choice
                        </Button>
                      </div>
                    )}
                  </div>
                  {approved && !expired && !stale && (
                    <Link
                      className="text-link request-return"
                      to="/app"
                      onClick={(event) => void returnToLearner(event)}
                    >
                      Continue as {state.learner} <ChevronRight size={15} />
                    </Link>
                  )}
                </article>
              );
            })}
          </section>
          <p className="parent-controls-note">
            {state.chain?.account
              ? "Controls enforced on Sui Testnet."
              : "Practice controls."}{" "}
            Daily allowance resets at 00:00 UTC.
          </p>
        </>
      )}
      {editing && <LimitsDialog onClose={() => setEditing(false)} />}
      {accountOpen && <AccountDialog onClose={() => setAccountOpen(false)} />}
    </div>
  );
}

function LimitsDialog({ onClose }: { onClose: () => void }) {
  const { state, update, busy, notify, refresh } = useApp(),
    [perTrade, setPerTrade] = useState(
      String(Number(state!.policy.perTrade) / Number(USD_SCALE)),
    ),
    [daily, setDaily] = useState(
      String(Number(state!.policy.daily) / Number(USD_SCALE)),
    ),
    [error, setError] = useState("");
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const policy = {
        perTrade,
        daily,
        paused: state!.policy.paused,
      };
      if (state!.chain?.account) {
        await chainAction({ action: "policy", ...policy }, state!.chain.wallet);
        await refresh();
      } else await update("/policy", policy);
      notify("Limits saved.");
      onClose();
    } catch (error) {
      setError((error as Error).message);
    }
  }
  return (
    <Modal title="PRACTICE LIMITS" onClose={onClose}>
      <h2>Edit limits</h2>
      <form className="limits-form" onSubmit={(event) => void save(event)}>
        <label className="field-label">
          Per investment ($)
          <input
            type="number"
            min="0.01"
            step="0.01"
            required
            value={perTrade}
            onChange={(event) => setPerTrade(event.target.value)}
          />
        </label>
        <label className="field-label">
          Daily allowance ($)
          <input
            type="number"
            min={perTrade}
            step="0.01"
            required
            value={daily}
            onChange={(event) => setDaily(event.target.value)}
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="text-link" onClick={onClose}>
            Cancel
          </button>
          <Button type="submit" disabled={busy}>
            Save limits <Check size={16} />
          </Button>
        </div>
      </form>
    </Modal>
  );
}

import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Pause,
  Play,
  ShieldCheck,
  X,
} from "lucide-react";
import { useApp } from "../lib/app-context.tsx";
import { money, USD_SCALE } from "../../shared/model.ts";
import { Eyebrow, Button } from "../components/UI.tsx";
import { PixelIcon } from "../components/Brand.tsx";

export function Parent() {
  const { state, update, busy, notify } = useApp(),
    [perTrade, setPerTrade] = useState(
      String(Number(state?.policy.perTrade ?? "250000000") / Number(USD_SCALE)),
    ),
    [daily, setDaily] = useState(
      String(Number(state?.policy.daily ?? "500000000") / Number(USD_SCALE)),
    ),
    [editing, setEditing] = useState(false);
  if (!state) return null;
  const parent = state.role === "parent",
    pending = state.approvals.filter((a) => a.state === "requested"),
    concepts = new Set(
      state.attempts.filter((a) => a.correct).map((a) => a.concept),
    ).size;
  async function save(event: React.FormEvent) {
    event.preventDefault();
    try {
      await update("/policy", {
        perTrade,
        daily,
        paused: state!.policy.paused,
      });
      setEditing(false);
      notify("The sample practice boundaries have been updated.");
    } catch {
      /* displayed by provider */
    }
  }
  return (
    <>
      <Link
        className="back-link"
        to="/app"
        onClick={() => {
          if (parent)
            void update("/preview-role", { role: "learner" }).catch(() => {});
        }}
      >
        <ArrowLeft size={15} /> Back to Maya’s Trove
      </Link>
      <section className="page-heading">
        <Eyebrow>A LITTLE GUIDANCE. A LOT OF POSSIBILITY.</Eyebrow>
        <h1>
          Give them room.
          <br />
          <span className="accent">Keep the roots.</span>
        </h1>
        <p>
          Follow Maya’s understanding, set clear boundaries, and let her find
          her own way.
        </p>
        <div className="parent-preview-note">
          <ShieldCheck size={17} />
          <span>
            Sample family ·{" "}
            {parent
              ? "Parent controls are active in this local preview."
              : "Explore the controls using a clearly labelled parent preview."}
          </span>
          {!parent && (
            <button
              className="text-link"
              onClick={() =>
                void update("/preview-role", { role: "parent" }).catch(() => {})
              }
            >
              Enter parent preview <ArrowRight size={14} />
            </button>
          )}
        </div>
      </section>
      <div className="parent-layout">
        <section>
          <div className="row-heading">
            <Eyebrow>01 / THE GROWTH THAT MATTERS</Eyebrow>
            <span className="tiny-tag">MAYA’S JOURNEY</span>
          </div>
          <div className="parent-progress">
            <div>
              <PixelIcon kind="sprout" />
              <strong>{String(state.decisions.length).padStart(2, "0")}</strong>
              <span>Choices to learn from</span>
            </div>
            <div>
              <PixelIcon kind="memory" />
              <strong>{String(state.attempts.length).padStart(2, "0")}</strong>
              <span>Thoughts put to the test</span>
            </div>
            <div>
              <PixelIcon kind="chart" />
              <strong>{String(concepts).padStart(2, "0")}</strong>
              <span>Concepts demonstrated</span>
            </div>
          </div>
          <article className="parent-learning">
            <Eyebrow>WHAT’S TAKING ROOT</Eyebrow>
            <h2>
              {concepts
                ? "Looking beyond the names."
                : "Learning to look a little closer."}
            </h2>
            <p>
              {concepts
                ? "Maya has correctly applied a concept in the sample learning exercises. The next question will build on that attempt."
                : "The sample journey is exploring how different companies can share the same risks. A first concept check is waiting when Maya is ready."}
            </p>
            <div className="progress-rule">
              <span>Profit is an outcome.</span>
              <strong>Understanding is the progress.</strong>
            </div>
          </article>
          <section className="approval-section">
            <div className="row-heading">
              <Eyebrow>02 / A MOMENT FOR YOUR GUIDANCE</Eyebrow>
              <span>{pending.length} waiting</span>
            </div>
            {pending.length ? (
              pending.map((request) => (
                <article className="approval-card" key={request.id}>
                  <span className="mini-label">
                    ONE SPECIFIC PRACTICE ACTION
                  </span>
                  <h3>
                    {money(request.quote.amount)} in {request.quote.symbol}
                  </h3>
                  {request.quote.reason && (
                    <blockquote>“{request.quote.reason}”</blockquote>
                  )}
                  <p className="fine-print">
                    Approving this does not change the standing limit. This
                    exact preview expires{" "}
                    {new Date(request.quote.expiresAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    .
                  </p>
                  <div className="approval-buttons">
                    <button
                      disabled={!parent || busy}
                      onClick={() =>
                        void update(`/approvals/${request.id}`, {
                          approve: false,
                        }).catch(() => {})
                      }
                    >
                      <X size={15} /> Decline
                    </button>
                    <Button
                      disabled={!parent || busy}
                      onClick={() =>
                        void update(`/approvals/${request.id}`, {
                          approve: true,
                        })
                          .then(() =>
                            notify(
                              "This exact preview is approved. Return to the learner view to complete it before expiry.",
                            ),
                          )
                          .catch(() => {})
                      }
                    >
                      Approve this choice <Check size={16} />
                    </Button>
                  </div>
                </article>
              ))
            ) : (
              <div className="no-requests">
                <span className="check-square">
                  <Check size={19} />
                </span>
                <div>
                  <h3>A little room to be independent.</h3>
                  <p>No requests are waiting for your guidance.</p>
                </div>
              </div>
            )}
            {state.approvals
              .filter((a) => a.state === "approved")
              .map((request) => (
                <div className="approved-notice" key={request.id}>
                  <Check size={16} />
                  <span>
                    {money(request.quote.amount)} in {request.quote.symbol}{" "}
                    approved.{" "}
                    <Link
                      to="/app"
                      onClick={() =>
                        void update("/preview-role", { role: "learner" }).catch(
                          () => {},
                        )
                      }
                    >
                      Return to learner view to complete.
                    </Link>
                  </span>
                </div>
              ))}
          </section>
        </section>
        <aside className="boundaries-panel">
          <Eyebrow>03 / CLEAR BOUNDARIES</Eyebrow>
          <h2>
            Freedom.
            <br />
            Within the lines.
          </h2>
          <p>A steady place to practice independence.</p>
          {editing ? (
            <form onSubmit={save}>
              <label className="field-label">
                PER INVESTMENT ($)
                <input
                  required
                  type="number"
                  min="1"
                  step="0.01"
                  value={perTrade}
                  onChange={(e) => setPerTrade(e.target.value)}
                />
              </label>
              <label className="field-label">
                DAILY PRACTICE ALLOWANCE ($)
                <input
                  required
                  type="number"
                  min={perTrade}
                  step="0.01"
                  value={daily}
                  onChange={(e) => setDaily(e.target.value)}
                />
              </label>
              <Button type="submit" disabled={busy || !parent}>
                Save boundaries <Check size={16} />
              </Button>
              <button
                type="button"
                className="text-link"
                onClick={() => setEditing(false)}
              >
                Cancel
              </button>
            </form>
          ) : (
            <>
              <div className="boundary-value">
                <span>PER INVESTMENT</span>
                <strong>{money(state.policy.perTrade, 0)}</strong>
              </div>
              <div className="boundary-value">
                <span>DAILY PRACTICE ALLOWANCE</span>
                <strong>{money(state.policy.daily, 0)}</strong>
              </div>
              <button
                className="text-link"
                disabled={!parent}
                onClick={() => setEditing(true)}
              >
                Review the boundaries <ArrowRight size={16} />
              </button>
            </>
          )}
          <div className="pause-control">
            <span>
              {state.policy.paused
                ? "Practice investing is paused"
                : "Space to make their own moves"}
            </span>
            <button
              className="button button-secondary"
              disabled={!parent || busy}
              onClick={() =>
                void update("/policy", {
                  perTrade: String(
                    Number(state.policy.perTrade) / Number(USD_SCALE),
                  ),
                  daily: String(Number(state.policy.daily) / Number(USD_SCALE)),
                  paused: !state.policy.paused,
                }).catch(() => {})
              }
            >
              {state.policy.paused ? <Play size={15} /> : <Pause size={15} />}
              {state.policy.paused ? "Resume practice" : "Pause practice"}
            </button>
          </div>
          <p className="fine-print">
            Daily allowance resets at 00:00 UTC. Learning progress never
            increases these limits automatically.
          </p>
        </aside>
      </div>
      <p className="data-note">
        Local sample controls. Role switching here is a preview feature, not
        real authentication. Sui enforcement and family sign-in are not
        connected yet.
      </p>
    </>
  );
}

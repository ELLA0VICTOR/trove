import { useEffect, useState } from "react";
import { ArrowUpRight, Check, Circle, RotateCcw } from "lucide-react";
import { Link } from "react-router-dom";
import { useApp, api } from "../lib/app-context.tsx";
import { Button, Eyebrow, Modal } from "../components/UI.tsx";
export function Evidence() {
  const { state, update, notify } = useApp(),
    [status, setStatus] = useState<Record<string, unknown> | null>(null),
    [reset, setReset] = useState(false);
  useEffect(() => {
    void api<Record<string, unknown>>("/integrations")
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);
  if (!state) return null;
  return (
    <>
      <section className="page-heading">
        <Eyebrow>THE BUILD, WITHOUT THE GUESSWORK</Eyebrow>
        <h1>
          Small details.
          <br />
          <span className="accent">Honest foundations.</span>
        </h1>
        <p>
          What this local version does today, and what still needs to connect.
        </p>
      </section>
      <div className="evidence-status">
        <span className="live-dot" />
        <strong>
          {status ? "Local API connected" : "Checking local API…"}
        </strong>
        <span>Sample family · persistent local SQLite</span>
      </div>
      <div className="evidence-grid">
        {[
          [
            "01",
            "PRACTICE INVESTING",
            "Working locally",
            "Exact integer accounting, reviewed orders, practice limits, one-time approval requests, duplicate-order protection, and saved decision reasons.",
            true,
          ],
          [
            "02",
            "PERSONAL LEARNING",
            "Working locally",
            "A deterministic sample guide uses saved thoughts, respects corrections, and changes the next exercise after a successful concept check.",
            true,
          ],
          [
            "03",
            "DECISION REPLAY",
            "Working locally",
            "Two allocations are calculated over the same authored sample period, with matching starting funds and explicit assumptions.",
            true,
          ],
          [
            "04",
            "WALRUS MEMORY",
            "Not connected",
            "No Mainnet memories have been written. The sample stores learning records locally. Account and delegate credentials are required.",
            false,
          ],
          [
            "05",
            "TATUM & SUI",
            "Not connected",
            "No live provider reads, signed transactions, or deployed practice contract are claimed. The current limits run in the local API.",
            false,
          ],
          [
            "06",
            "REAL MARKET DATA & SIGN-IN",
            "Not connected",
            "Prices are authored sample observations. Market-data entitlements and real family authentication still need configuration.",
            false,
          ],
        ].map(([number, title, label, description, connected]) => (
          <article className="evidence-card" key={String(number)}>
            <Eyebrow>
              {number} / {title}
            </Eyebrow>
            <h2>
              {connected ? <Check size={22} /> : <Circle size={19} />}
              {label}
            </h2>
            <p>{description}</p>
          </article>
        ))}
      </div>
      <div className="evidence-counts">
        <div>
          <span>LOCAL LEARNING RECORDS</span>
          <strong>{state.memories.length}</strong>
        </div>
        <div>
          <span>CONFIRMED MAINNET MEMORIES</span>
          <strong>0</strong>
        </div>
        <div>
          <span>LIVE CHAIN TRANSACTIONS</span>
          <strong>0</strong>
        </div>
      </div>
      <section className="evidence-note">
        <h2>Your local sample is yours to explore.</h2>
        <p>
          New practice actions, saved thoughts, and parent settings persist on
          this development server for your sample-family cookie. Resetting
          starts that sample again. This version does not move funds, buy
          stocks, or provide real family-account security.
        </p>
        <div className="evidence-actions">
          <Link to="/app" className="text-link">
            Back to your growth <ArrowUpRight size={16} />
          </Link>
          <button className="text-link" onClick={() => setReset(true)}>
            Reset my local sample <RotateCcw size={15} />
          </button>
        </div>
      </section>
      {reset && (
        <Modal title="A FRESH SAMPLE START" onClose={() => setReset(false)}>
          <h2>
            Start this sample
            <br />
            from the seed.
          </h2>
          <p>
            This removes the new practice orders, reflections, and settings in
            your local sample family. The original illustrative journey will
            return.
          </p>
          <div className="modal-actions">
            <button className="text-link" onClick={() => setReset(false)}>
              Keep exploring
            </button>
            <Button
              onClick={() =>
                void update("/reset", {})
                  .then(() => {
                    setReset(false);
                    notify("Your local sample has a fresh start.");
                  })
                  .catch(() => {})
              }
            >
              Reset sample <RotateCcw size={16} />
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}

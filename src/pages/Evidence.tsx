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
  }, [state?.id, state?.memories.filter((memory) => memory.blobId).length]);
  if (!state) return null;
  const memory = status?.memory as
    { connected?: boolean; confirmed?: number } | undefined;
  const coach = status?.coach as
    { connected?: boolean; mode?: string } | undefined;
  const account = state.session?.mode === "account";
  const receipts = (
    (
      status?.localMemory as
        | {
            records?: {
              id: string;
              kind: string;
              status: string;
              blobId?: string;
              withdrawn?: boolean;
            }[];
          }
        | undefined
    )?.records ?? []
  ).filter(
    (record) =>
      record.status === "confirmed" && !record.withdrawn && record.blobId,
  );
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
        <span>
          {account ? "Family account" : "Sample family"} · persistent local
          SQLite
        </span>
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
            coach?.mode === "live"
              ? "The OpenAI guide uses confirmed, recalled Walrus memories, validates its sources, respects corrections, and caches unchanged explanations within the shared $1 allowance."
              : "A deterministic sample guide uses saved thoughts, respects corrections, and changes the next exercise after a successful concept check. Sign in and enable remembering for the live guide.",
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
            memory?.connected ? "Configured" : "Not connected",
            account
              ? "With parent consent, learning records enter a durable write queue. Only completed jobs with blob receipts count as confirmed. Corrected or removed thoughts are excluded from coaching."
              : "Available to signed-in family accounts with parent consent. Guest sample history stays local and is never uploaded.",
            Boolean(memory?.connected),
          ],
          [
            "05",
            "TATUM & SUI",
            "Not connected",
            "Tatum checkpoint reads passed provider preflight. Signed transactions and the practice contract are not connected; current practice limits run in the API.",
            false,
          ],
          [
            "06",
            "MARKET DATA & SIGN-IN",
            "Family sign-in ready",
            "Parent and learner accounts use separate credentials, expiring sessions, and single-use invitations. Prices in the app remain authored samples; a real AAPL history read passed preflight.",
            true,
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
          <strong>{memory?.confirmed ?? 0}</strong>
        </div>
        <div>
          <span>LIVE CHAIN TRANSACTIONS</span>
          <strong>0</strong>
        </div>
      </div>
      <section className="evidence-note">
        {receipts.length > 0 && (
          <details className="evidence-receipts">
            <summary>Confirmed memory receipts ({receipts.length})</summary>
            {receipts.map((record) => (
              <div key={record.id}>
                <span>{record.kind}</span>
                <code>{record.blobId}</code>
                <button
                  className="text-link"
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(record.blobId!)
                      .then(() => notify("Memory receipt copied."))
                      .catch(() => notify("Select the receipt ID to copy it."))
                  }
                >
                  Copy
                </button>
              </div>
            ))}
          </details>
        )}
        <h2>
          {account
            ? "Your family’s practice account."
            : "Your local sample is yours to explore."}
        </h2>
        <p>
          {account
            ? "Your family’s practice choices are saved on this server and restored when you sign in again. Walrus storage is enabled only with parent consent. This version does not move money or buy real stocks. Hosted deployment, recovery, and onchain permissions still need implementation."
            : "Guest choices persist for this browser’s sample cookie. Resetting restores the example. Create a family account to return with a sign-in on another session. This version does not move money or buy stocks."}
        </p>
        <div className="evidence-actions">
          <Link to="/app" className="text-link">
            Back to your growth <ArrowUpRight size={16} />
          </Link>
          {!account && (
            <button className="text-link" onClick={() => setReset(true)}>
              Reset my local sample <RotateCcw size={15} />
            </button>
          )}
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

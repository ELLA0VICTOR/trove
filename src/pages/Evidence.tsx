import { useEffect, useState } from "react";
import { ArrowUpRight, Check, Circle, RotateCcw } from "lucide-react";
import { Link } from "react-router-dom";
import { useApp, api } from "../lib/app-context.tsx";
import { Button, Eyebrow, Modal } from "../components/UI.tsx";
export function Evidence() {
  const { state, update, notify } = useApp(),
    [status, setStatus] = useState<Record<string, unknown> | null>(null),
    [reset, setReset] = useState(false);
  const confirmedMemories = state?.memories.filter(
    (memory) => memory.blobId,
  ).length;
  useEffect(() => {
    void api<Record<string, unknown>>("/integrations")
      .then(setStatus)
      .catch(() => setStatus(null));
  }, [state?.id, confirmedMemories]);
  if (!state) return null;
  const memory = status?.memory as
    { connected?: boolean; confirmed?: number } | undefined;
  const coach = status?.coach as
    { connected?: boolean; mode?: string } | undefined;
  const account = state.session?.mode === "account";
  const chain = status?.chain as
    { connected?: boolean; confirmed?: number } | undefined;
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
        <p>What this version does today, with evidence from your account.</p>
      </section>
      <div className="evidence-status">
        <span className="live-dot" />
        <strong>{status ? "API connected" : "Checking API…"}</strong>
        <span>
          {account ? "Family account" : "Guest practice"} · saved practice
          history
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
              : "The local guide uses saved thoughts and respects corrections. Sign in and enable remembering for explanations grounded in confirmed Walrus memories.",
            true,
          ],
          [
            "03",
            "DECISION REPLAY",
            "Working locally",
            state.market?.mode === "market"
              ? "Two allocations use aligned Marketstack dates and adjusted closes, with matching starting funds and explicit assumptions."
              : "Two allocations use the same authored sample period, matching starting funds, and explicit assumptions.",
            true,
          ],
          [
            "04",
            "WALRUS MEMORY",
            memory?.connected ? "Configured" : "Not connected",
            account
              ? "With parent consent, learning records enter a durable write queue. Only completed jobs with blob receipts count as confirmed. Corrected or removed thoughts are excluded from coaching."
              : "Available to signed-in family accounts with parent consent. Guest learning history stays local.",
            Boolean(memory?.connected),
          ],
          [
            "05",
            "TATUM & SUI",
            chain?.connected ? "Testnet configured" : "Not connected",
            state.chain?.account
              ? "Wallet-signed parent controls and learner orders execute in the Sui practice contract. Tatum receipts and account objects reconcile balances before the app records the action. No real shares or funds."
              : "The Testnet practice contract supports separate parent and learner wallets, signed price attestations, and sponsored gas. Link wallets in Account settings to start a Sui practice portfolio. Ordinary practice remains in the API.",
            Boolean(chain?.connected),
          ],
          [
            "06",
            "MARKET DATA & SIGN-IN",
            "Family sign-in ready",
            state.market?.mode === "market"
              ? `${state.market.provider}, dated ${state.market.asOf}. Only validated USD observations are used. Separate family sign-ins, expiring sessions, and single-use invitations protect account roles.`
              : "Offline examples use authored observations. A connected server opens market-price portfolios automatically once a fresh Marketstack snapshot is available.",
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
          <strong>{chain?.confirmed ?? 0}</strong>
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
            : "Your guest practice account."}
        </h2>
        <p>
          {account
            ? "Your family’s practice choices are saved on this server and restored when you sign in again. Parent consent enables Walrus memory. Connected Sui accounts enforce guardian rules through signed Testnet transactions. Balances and orders are simulated."
            : "Guest practice is saved for this browser. Create a family account to sign in from another session, invite a learner, and enable remembered learning. Practice balances and orders are simulated."}
        </p>
        <div className="evidence-actions">
          <Link to="/app" className="text-link">
            Back to your growth <ArrowUpRight size={16} />
          </Link>
          {!account && (
            <button className="text-link" onClick={() => setReset(true)}>
              Reset guest practice <RotateCcw size={15} />
            </button>
          )}
        </div>
      </section>
      {reset && (
        <Modal title="RESET GUEST PRACTICE" onClose={() => setReset(false)}>
          <h2>
            Start your practice
            <br />
            from the seed.
          </h2>
          <p>
            This clears your guest orders, reflections, and settings. Connected
            servers start with $1,000 in practice cash and market prices;
            offline servers restore the example.
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
                    notify("Your guest practice has a fresh start.");
                  })
                  .catch(() => {})
              }
            >
              Reset practice <RotateCcw size={16} />
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}

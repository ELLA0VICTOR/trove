import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { useApp } from "../lib/app-context.tsx";
import { money, shares } from "../../shared/model.ts";
import type { Decision } from "../../shared/model.ts";
import { Button, Eyebrow, Modal } from "../components/UI.tsx";
import { PixelIcon } from "../components/Brand.tsx";
import { MemoryDialog } from "./Learning.tsx";
import { CompanyLogo } from "../components/CompanyLogo.tsx";

export function Decisions() {
  const { state } = useApp(),
    [selected, setSelected] = useState<Decision | null>(null),
    [memories, setMemories] = useState(false);
  if (!state) return null;
  return (
    <>
      <section className="page-heading decision-heading">
        <div>
          <Eyebrow>EVERY CHOICE LEAVES A LITTLE SOMETHING</Eyebrow>
          <h1>
            A record of choices.
            <br />
            <span className="accent">A story of growth.</span>
          </h1>
        </div>
        <button className="text-link" onClick={() => setMemories(true)}>
          Your saved thoughts <ArrowUpRight size={16} />
        </button>
      </section>
      <section className="featured-decision">
        <div>
          <span className="mini-label">A THOUGHT WORTH REVISITING</span>
          <h2>
            Different names.
            <br />
            Different risks?
          </h2>
          <blockquote>
            “I chose five different companies,
            <br />
            so I think I have spread out my risk.”
          </blockquote>
          <Link to="/app/replay" className="text-link">
            Follow this thought <ArrowUpRight size={16} />
          </Link>
        </div>
        <div className="decision-orbit" aria-hidden="true">
          <div className="orbit-ring" />
          {["AAPL", "MSFT", "NVDA", "AMD", "ADBE"].map((symbol, index) => (
            <span
              key={index}
              style={{ "--orbit-index": index } as React.CSSProperties}
            >
              <CompanyLogo symbol={symbol} />
            </span>
          ))}
          <PixelIcon kind="memory" />
        </div>
      </section>
      <div className="row-heading">
        <div>
          <Eyebrow>01 / THEN & NOW</Eyebrow>
          <h2>Your decisions, in your own words.</h2>
        </div>
        <span className="muted mini-label">
          {String(state.decisions.length).padStart(2, "0")} CHOICES TO LEARN
          FROM
        </span>
      </div>
      <div className="decision-list">
        {state.decisions.map((decision, index) => {
          const instrument = state.instruments.find(
            (i) => i.symbol === decision.symbol,
          )!;
          return (
            <button
              className="decision-row"
              key={decision.id}
              onClick={() => setSelected(decision)}
            >
              <span className="decision-index">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <span className="mini-label">
                  {new Date(decision.recordedAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}{" "}
                  ·{" "}
                  {decision.origin === "sample"
                    ? "SAMPLE HISTORY"
                    : "YOUR PRACTICE DECISION"}
                </span>
                <h3>
                  {decision.side === "buy"
                    ? "A little belief in"
                    : "A new direction from"}{" "}
                  {instrument.name}.
                </h3>
                <p>
                  {decision.reason
                    ? `“${decision.reason}”`
                    : "No reason recorded. There’s still room for a reflection."}
                </p>
              </div>
              <div className="decision-row-amount">
                <strong>{money(decision.amount)}</strong>
                <span>
                  {decision.side === "buy" ? "PRACTICE BUY" : "PRACTICE SELL"}
                </span>
              </div>
              <ArrowUpRight size={20} />
            </button>
          );
        })}
      </div>
      <p className="data-note">
        Sample history is illustrative. New decisions are timestamped when you
        make them and saved on the local server.
      </p>
      {selected && (
        <Modal
          title="THEN / YOUR ORIGINAL CHOICE"
          onClose={() => setSelected(null)}
        >
          <Eyebrow>
            {selected.symbol} ·{" "}
            {selected.origin === "sample"
              ? "ILLUSTRATIVE HISTORY"
              : "LOCAL PRACTICE RECORD"}
          </Eyebrow>
          <h2>
            A thought from
            <br />
            your earlier self.
          </h2>
          <div className="review-amount">{money(selected.amount)}</div>
          <div className="detail-fact">
            <span>Practice shares</span>
            <strong>{shares(selected.units)}</strong>
          </div>
          <div className="detail-fact">
            <span>Sample market date</span>
            <strong>{selected.marketDate}</strong>
          </div>
          <div className="detail-fact">
            <span>Record date</span>
            <strong>{new Date(selected.recordedAt).toLocaleString()}</strong>
          </div>
          <blockquote className="decision-quote">
            {selected.reason
              ? `“${selected.reason}”`
              : "You did not record a reason for this choice."}
          </blockquote>
          <div className="decision-prompts">
            <p>What do you understand differently now?</p>
            <p>Was it the outcome, or the reasoning, that changed?</p>
          </div>
          <Button
            onClick={() => {
              setSelected(null);
              setMemories(true);
            }}
          >
            Add a reflection <ArrowRight size={16} />
          </Button>
          <p className="fine-print">
            Local sample record. No blockchain receipt or Mainnet memory is
            claimed.
          </p>
        </Modal>
      )}
      {memories && <MemoryDialog onClose={() => setMemories(false)} />}
    </>
  );
}

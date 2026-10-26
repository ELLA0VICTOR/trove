import { useState } from "react";
import { ArrowRight, ChevronRight, NotebookPen } from "lucide-react";
import { useApp } from "../lib/app-context.tsx";
import { money, shares } from "../../shared/model.ts";
import type { Decision } from "../../shared/model.ts";
import { Button, Modal } from "../components/UI.tsx";
import { PixelIcon } from "../components/Brand.tsx";
import { MemoryDialog } from "./Learning.tsx";
import { CompanyLogo } from "../components/CompanyLogo.tsx";

export function Decisions() {
  const { state } = useApp(),
    [selected, setSelected] = useState<Decision | null>(null),
    [memories, setMemories] = useState(false),
    [reflectionId, setReflectionId] = useState<string | undefined>(),
    [filter, setFilter] = useState("All");
  if (!state) return null;
  const decisions = state.decisions.filter(
    (decision) =>
      filter === "All" ||
      decision.side === (filter === "Buys" ? "buy" : "sell"),
  );
  return (
    <div className="decisions-page">
      <header className="simple-page-header">
        <h1>Decisions</h1>
        <button
          className="text-link"
          onClick={() => {
            setReflectionId(undefined);
            setMemories(true);
          }}
        >
          <NotebookPen size={16} />
          Saved thoughts
        </button>
      </header>
      <section className="decision-replay">
        <div>
          <h2>
            Different names.
            <br />
            Different risks?
          </h2>
          <p>Compare your original mix with a different allocation.</p>
          <Button to="/app/replay">Replay decisions</Button>
        </div>
        <div className="decision-orbit" aria-hidden="true">
          <div className="orbit-ring" />
          {["AAPL", "MSFT", "NVDA", "AMD", "ADBE"].map((symbol, index) => (
            <span
              key={symbol}
              style={{ "--orbit-index": index } as React.CSSProperties}
            >
              <CompanyLogo symbol={symbol} />
            </span>
          ))}
          <PixelIcon kind="memory" />
        </div>
      </section>
      <div className="decision-history-heading">
        <h2>History</h2>
        <div className="simple-tabs" aria-label="Filter decisions">
          {["All", "Buys", "Sells"].map((label) => (
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
      </div>
      <div className="compact-decision-list">
        {decisions.map((decision) => {
          const instrument = state.instruments.find(
            (item) => item.symbol === decision.symbol,
          )!;
          return (
            <button
              className="compact-decision-row"
              key={decision.id}
              onClick={() => setSelected(decision)}
            >
              <CompanyLogo symbol={decision.symbol} />
              <div className="compact-decision-copy">
                <h3>{instrument.name}</h3>
                <span>
                  {decision.side === "buy" ? "Bought" : "Sold"} /{" "}
                  {new Date(decision.recordedAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                  {decision.origin === "sample" ? " / Sample" : ""}
                </span>
                <p>{decision.reason || "No reason recorded"}</p>
              </div>
              <strong>{money(decision.amount)}</strong>
              <ChevronRight size={17} />
            </button>
          );
        })}
      </div>
      {!decisions.length && (
        <p className="simple-empty">
          No {filter === "All" ? "decisions" : filter.toLowerCase()} yet.
        </p>
      )}
      {selected && (
        <Modal title="DECISION DETAILS" onClose={() => setSelected(null)}>
          <div className="decision-modal-company">
            <CompanyLogo symbol={selected.symbol} />
            <h2>
              {
                state.instruments.find(
                  (item) => item.symbol === selected.symbol,
                )?.name
              }
            </h2>
          </div>
          <div className="detail-fact">
            <span>
              {selected.side === "buy" ? "Practice buy" : "Practice sale"}
            </span>
            <strong>{money(selected.amount)}</strong>
          </div>
          <div className="detail-fact">
            <span>Shares</span>
            <strong>{shares(selected.units)}</strong>
          </div>
          <div className="detail-fact">
            <span>Sample market date</span>
            <strong>{selected.marketDate}</strong>
          </div>
          <div className="detail-fact">
            <span>Recorded</span>
            <strong>
              {new Date(selected.recordedAt).toLocaleDateString()}
            </strong>
          </div>
          <h3 className="reason-heading">Original reason</h3>
          <blockquote className="decision-quote">
            {selected.reason || "No reason recorded."}
          </blockquote>
          <Button
            onClick={() => {
              setReflectionId(selected.id);
              setSelected(null);
              setMemories(true);
            }}
          >
            Add a reflection <ArrowRight size={16} />
          </Button>
        </Modal>
      )}
      {memories && (
        <MemoryDialog
          decisionId={reflectionId}
          onClose={() => setMemories(false)}
        />
      )}
    </div>
  );
}

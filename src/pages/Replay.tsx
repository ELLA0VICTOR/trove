import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Play,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useApp } from "../lib/app-context.tsx";
import { replay } from "../../shared/model.ts";
import { Chart } from "../components/Chart.tsx";
import { Button, Eyebrow } from "../components/UI.tsx";
import { ExerciseDialog } from "./Learning.tsx";

const original = { AAPL: 15, MSFT: 15, NVDA: 15, AMD: 15, ADBE: 15 };
const defaultMix: Record<string, number> = {
  AAPL: 15,
  SPY: 35,
  KO: 20,
  JNJ: 20,
};
export function Replay() {
  const { state } = useApp(),
    [mix, setMix] = useState(defaultMix),
    [end, setEnd] = useState(59),
    [exercise, setExercise] = useState(false),
    [playing, setPlaying] = useState(false),
    timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  useEffect(() => () => clearInterval(timer.current), []);
  const last = state ? state.instruments[0].prices.length - 1 : 59;
  const selectedEnd = Math.min(end, last);
  const replayInstruments = useMemo(
    () =>
      state?.instruments.map((instrument) => ({
        ...instrument,
        prices: instrument.prices.map((p) => ({
          ...p,
          price: p.adjustedPrice ?? p.price,
        })),
      })),
    [state],
  );
  const paths = useMemo(
    () =>
      state
        ? {
            original: replay(replayInstruments!, original, 0, selectedEnd),
            alternative: replay(replayInstruments!, mix, 0, selectedEnd),
          }
        : null,
    [state, mix, selectedEnd, replayInstruments],
  );
  if (!state || !paths) return null;
  const allocated = Object.values(mix).reduce((sum, weight) => sum + weight, 0),
    originalEnd = paths.original.at(-1)!.value,
    otherEnd = paths.alternative.at(-1)!.value;
  function advance() {
    if (playing) return;
    setPlaying(true);
    let index = 1;
    setEnd(index);
    timer.current = setInterval(() => {
      index++;
      setEnd(index);
      if (index >= last) {
        clearInterval(timer.current);
        setPlaying(false);
      }
    }, 85);
  }
  return (
    <>
      <Link to="/app/decisions" className="back-link">
        <ArrowLeft size={15} /> Back to your decisions
      </Link>
      <section className="page-heading">
        <Eyebrow>SAME MOMENT. A DIFFERENT PERSPECTIVE.</Eyebrow>
        <h1>
          What if you’d
          <br />
          <span className="accent">chosen differently?</span>
        </h1>
        <p>
          Revisit the mix. Keep the market the same. Find what the comparison
          can teach you.
        </p>
      </section>
      <div className="replay-original">
        <span className="mini-label">THE ORIGINAL THOUGHT</span>
        <blockquote>
          “Five different companies means I’ve spread out my risk.”
        </blockquote>
        <span className="tiny-tag">ILLUSTRATIVE JOURNEY</span>
      </div>
      <section className="replay-layout">
        <div className="replay-chart-panel">
          <div className="replay-results">
            <div>
              <span className="mini-label">
                <i className="legend-dot" /> ORIGINAL CHOICE
              </span>
              <strong>${originalEnd.toFixed(2)}</strong>
              <span>
                {((originalEnd / 1000 - 1) * 100).toFixed(2)}% price return
              </span>
            </div>
            <div>
              <span className="mini-label">
                <i className="legend-dot alternative" /> YOUR ALTERNATIVE
              </span>
              <strong>${otherEnd.toFixed(2)}</strong>
              <span>
                {((otherEnd / 1000 - 1) * 100).toFixed(2)}% price return
              </span>
            </div>
          </div>
          <Chart
            points={paths.original}
            comparison={paths.alternative}
            label="Comparison of two practice allocations over the same market period"
          />
          <div className="replay-timeline">
            <button
              className="icon-button"
              aria-label="Play through price history"
              disabled={playing}
              onClick={advance}
            >
              <Play size={16} />
            </button>
            <label className="sr-only" htmlFor="replay-date">
              Move through the selected period
            </label>
            <input
              id="replay-date"
              type="range"
              min="1"
              max={last}
              value={selectedEnd}
              disabled={playing}
              onChange={(event) => setEnd(Number(event.target.value))}
            />
            <span>{state.instruments[0].prices[selectedEnd].date}</span>
          </div>
          <div className="replay-assumptions">
            <span className="mini-label">THE SAME STARTING POINT</span>
            <p>
              $1,000 each · same dates · buy and hold · no fees, taxes or
              interest.
              {state.market?.mode === "market"
                ? " Adjusted closes include provider split and dividend adjustments; these are comparison units, not share quantities."
                : " No dividends."}{" "}
              Remaining money stays as cash.
            </p>
          </div>
        </div>
        <aside className="allocation-panel">
          <div className="row-heading">
            <Eyebrow>TRY A DIFFERENT MIX</Eyebrow>
            <button
              className="icon-button"
              aria-label="Reset alternative allocation"
              onClick={() => setMix(defaultMix)}
            >
              <RotateCcw size={15} />
            </button>
          </div>
          <h3>
            A little more of this.
            <br />A little less of that.
          </h3>
          {["AAPL", "SPY", "KO", "JNJ"].map((symbol) => (
            <label className="allocation-control" key={symbol}>
              <span>
                <strong>
                  {state.instruments.find((i) => i.symbol === symbol)!.name}
                </strong>
                <small>{symbol}</small>
              </span>
              <input
                aria-label={`${symbol} allocation percentage`}
                type="range"
                min="0"
                max={100 - allocated + (mix[symbol] ?? 0)}
                step="5"
                value={mix[symbol] ?? 0}
                onChange={(event) =>
                  setMix((current) => ({
                    ...current,
                    [symbol]: Number(event.target.value),
                  }))
                }
              />
              <span>{mix[symbol] ?? 0}%</span>
            </label>
          ))}
          <div className="cash-allocation">
            <span>Practice cash</span>
            <strong>{100 - allocated}%</strong>
          </div>
          <p className="fine-print">
            An illustrative comparison, not a recommended portfolio. A different
            mix can do better or worse.
          </p>
        </aside>
      </section>
      <section className="replay-reflection">
        <Sparkles className="accent" size={27} />
        <div>
          <Eyebrow>THE NUMBER IS ONLY PART OF THE STORY.</Eyebrow>
          <h2>What changed in your thinking?</h2>
          <p>
            Look at the companies’ shared exposures, the bumps along the way,
            and the cash left aside—not only the finish line.
          </p>
          <Link to="/app/guide" className="text-link">
            Talk it through with your guide <ArrowUpRight size={16} />
          </Link>
        </div>
        <Button onClick={() => setExercise(true)}>
          Try the idea elsewhere <ArrowRight size={17} />
        </Button>
      </section>
      <p className="data-note">
        {state.market?.mode === "market"
          ? "Marketstack historical daily closes."
          : "Authored sample prices."}{" "}
        Moving this timeline changes the comparison, not your actual practice
        balance or saved decisions.
      </p>
      {exercise && <ExerciseDialog onClose={() => setExercise(false)} />}
    </>
  );
}

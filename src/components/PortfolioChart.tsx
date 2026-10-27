import { useEffect, useRef, useState } from "react";
import { ChartArea, ChartLine, Minus, Plus, RotateCcw } from "lucide-react";
import {
  AreaSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  createChart,
  isBusinessDay,
} from "lightweight-charts";
import type {
  IChartApi,
  IPriceLine,
  ISeriesApi,
  MouseEventParams,
  IRange,
  Time,
} from "lightweight-charts";
import type { ChartPoint } from "./Chart.tsx";

// TradingView Lightweight Charts™
// Copyright (с) 2025 TradingView, Inc. https://www.tradingview.com/
const dollars = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    value,
  );
function dateKey(time: Time) {
  if (typeof time === "string") return time;
  if (isBusinessDay(time))
    return `${time.year}-${String(time.month).padStart(2, "0")}-${String(time.day).padStart(2, "0")}`;
  return new Date(time * 1000).toISOString().slice(0, 10);
}
const dateLabel = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
type Engine = {
  chart: IChartApi;
  series: ISeriesApi<"Area">;
  baseline: IPriceLine;
};

export function PortfolioChart({ points }: { points: ChartPoint[] }) {
  const host = useRef<HTMLDivElement>(null),
    engine = useRef<Engine | null>(null);
  const lookup = useRef(new Map<string, ChartPoint>()),
    keyboardIndex = useRef<number | null>(null);
  const [selected, setSelected] = useState<ChartPoint | null>(null),
    [style, setStyle] = useState<"area" | "line">("area");
  const [windowDates, setWindowDates] = useState<[string, string] | null>(null);
  const sufficient = points.length >= 2;

  useEffect(() => {
    if (!host.current || !sufficient) return;
    const chart = createChart(host.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "#ffffff" },
        textColor: "#62736a",
        fontFamily: '"IBM Plex Mono", monospace',
        fontSize: 10,
        attributionLogo: true,
      },
      grid: {
        vertLines: { color: "#edf3ef", style: LineStyle.Dotted },
        horzLines: { color: "#e5ede8" },
      },
      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: {
          color: "#8fa99a",
          style: LineStyle.Dashed,
          labelBackgroundColor: "#19764c",
        },
        horzLine: {
          color: "#8fa99a",
          style: LineStyle.Dashed,
          labelBackgroundColor: "#19764c",
        },
      },
      rightPriceScale: {
        borderColor: "#dce6df",
        minimumWidth: 77,
        scaleMargins: { top: 0.13, bottom: 0.13 },
      },
      timeScale: {
        borderColor: "#dce6df",
        rightOffset: 2,
        timeVisible: false,
        secondsVisible: false,
        minBarSpacing: 3,
        lockVisibleTimeRangeOnResize: true,
      },
      localization: {
        locale: "en-US",
        priceFormatter: dollars,
        timeFormatter: (time: Time) => dateLabel(dateKey(time)),
      },
      handleScroll: {
        mouseWheel: false,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        mouseWheel: true,
        pinch: true,
        axisPressedMouseMove: true,
        axisDoubleClickReset: true,
      },
    });
    const series = chart.addSeries(AreaSeries, {
      lineColor: "#19764c",
      lineWidth: 2,
      topColor: "rgba(25, 118, 76, .15)",
      bottomColor: "rgba(25, 118, 76, .01)",
      priceLineColor: "#19764c",
      priceLineStyle: LineStyle.Dotted,
      priceLineVisible: true,
      lastValueVisible: true,
      crosshairMarkerRadius: 4,
      crosshairMarkerBorderWidth: 2,
      crosshairMarkerBorderColor: "#ffffff",
      crosshairMarkerBackgroundColor: "#19764c",
      priceFormat: { type: "price", precision: 2, minMove: 0.01 },
    });
    const baseline = series.createPriceLine({
      price: 1000,
      color: "#9eb3a7",
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: false,
      title: "",
    });
    const onCrosshair = (event: MouseEventParams) => {
      if (
        event.time === undefined ||
        !event.point ||
        !event.seriesData.has(series)
      ) {
        setSelected(null);
        return;
      }
      keyboardIndex.current = null;
      setSelected(lookup.current.get(dateKey(event.time)) ?? null);
    };
    const onRange = (range: IRange<Time> | null) =>
      setWindowDates(range ? [dateKey(range.from), dateKey(range.to)] : null);
    chart.subscribeCrosshairMove(onCrosshair);
    chart.timeScale().subscribeVisibleTimeRangeChange(onRange);
    engine.current = { chart, series, baseline };
    return () => {
      chart.unsubscribeCrosshairMove(onCrosshair);
      chart.timeScale().unsubscribeVisibleTimeRangeChange(onRange);
      chart.remove();
      engine.current = null;
    };
    // The engine owns its canvas and resize observer; data is updated separately.
  }, [sufficient]);

  useEffect(() => {
    const current = engine.current;
    if (!current || !sufficient) return;
    lookup.current = new Map(points.map((point) => [point.date, point]));
    current.series.setData(
      points.map((point) => ({ time: point.date, value: point.value })),
    );
    current.baseline.applyOptions({ price: points[0].value });
    current.chart.priceScale("right").applyOptions({ autoScale: true });
    current.chart.timeScale().fitContent();
    current.chart.clearCrosshairPosition();
    keyboardIndex.current = null;
    setSelected(null);
  }, [points, sufficient]);

  useEffect(() => {
    engine.current?.series.applyOptions({
      topColor: style === "area" ? "rgba(25, 118, 76, .15)" : "transparent",
      bottomColor: style === "area" ? "rgba(25, 118, 76, .01)" : "transparent",
    });
  }, [style, sufficient]);

  function reset() {
    engine.current?.chart.priceScale("right").applyOptions({ autoScale: true });
    engine.current?.chart.timeScale().fitContent();
    engine.current?.chart.clearCrosshairPosition();
    keyboardIndex.current = null;
    setSelected(null);
  }
  function zoom(factor: number) {
    const scale = engine.current?.chart.timeScale(),
      range = scale?.getVisibleLogicalRange();
    if (!range || !scale) return;
    const center = (range.from + range.to) / 2;
    const span = Math.max(
      3,
      Math.min(points.length * 3, (range.to - range.from) * factor),
    );
    scale.setVisibleLogicalRange({
      from: center - span / 2,
      to: center + span / 2,
    });
  }
  function inspect(event: React.KeyboardEvent<HTMLDivElement>) {
    const current = engine.current;
    if (!current || !sufficient) return;
    if (event.key === "Escape") {
      current.chart.clearCrosshairPosition();
      keyboardIndex.current = null;
      setSelected(null);
      return;
    }
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const index = Math.max(
      0,
      Math.min(
        points.length - 1,
        (keyboardIndex.current ?? points.length - 1) +
          (event.key === "ArrowLeft" ? -1 : 1),
      ),
    );
    const point = points[index];
    current.chart.setCrosshairPosition(point.value, point.date, current.series);
    keyboardIndex.current = index;
    setSelected(point);
  }

  if (!sufficient)
    return (
      <p>
        Your portfolio history starts today. More observations will appear as
        you practise.
      </p>
    );
  const reading = selected ?? points.at(-1)!,
    first = points[0];
  const change = reading.value - first.value,
    percentage = first.value > 0 ? (change / first.value) * 100 : null;
  const dates = windowDates ?? [first.date, points.at(-1)!.date];
  return (
    <div className="portfolio-chart">
      <div
        className="portfolio-chart-legend"
        data-inspecting={!!selected}
        aria-live="polite"
      >
        <div>
          <div className="chart-reading-date">
            <span className="chart-series-key" />
            Portfolio value<span>{dateLabel(reading.date)}</span>
          </div>
          <div className="chart-reading">
            <strong>{dollars(reading.value)}</strong>
            <span className={change >= 0 ? "gain" : "loss"}>
              {change >= 0 ? "+" : ""}
              {dollars(change)}
              {percentage !== null && (
                <>
                  {" "}
                  ({change >= 0 ? "+" : ""}
                  {percentage.toFixed(2)}%)
                </>
              )}
              <small>since period start</small>
            </span>
          </div>
        </div>
        <div
          className="chart-style-controls"
          role="group"
          aria-label="Chart style"
        >
          <button
            aria-label="Area chart"
            aria-pressed={style === "area"}
            title="Area chart"
            onClick={() => setStyle("area")}
          >
            <ChartArea size={16} />
          </button>
          <button
            aria-label="Line chart"
            aria-pressed={style === "line"}
            title="Line chart"
            onClick={() => setStyle("line")}
          >
            <ChartLine size={16} />
          </button>
        </div>
      </div>
      <div
        ref={host}
        className="portfolio-chart-canvas"
        role="img"
        tabIndex={0}
        aria-label="Practice portfolio value over the selected period. Drag to pan, scroll to zoom, or use left and right arrows to inspect observations."
        onKeyDown={inspect}
        onPointerLeave={() => {
          keyboardIndex.current = null;
          setSelected(null);
        }}
      />
      <div className="portfolio-chart-footer">
        <span className="chart-window">
          {dateLabel(dates[0])} – {dateLabel(dates[1])}
        </span>
        <div
          className="chart-zoom-controls"
          role="group"
          aria-label="Chart controls"
        >
          <button
            aria-label="Zoom out chart"
            title="Zoom out"
            onClick={() => zoom(1.35)}
          >
            <Minus size={16} />
          </button>
          <button
            aria-label="Zoom in chart"
            title="Zoom in"
            onClick={() => zoom(0.75)}
          >
            <Plus size={16} />
          </button>
          <button
            aria-label="Reset chart view"
            title="Reset view"
            onClick={reset}
          >
            <RotateCcw size={15} />
          </button>
        </div>
      </div>
      <div className="chart-attribution">
        <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">
          TradingView Lightweight Charts™
        </a>
        <span>© 2025 TradingView, Inc.</span>
      </div>
    </div>
  );
}

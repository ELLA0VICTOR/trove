import { useState } from "react";
import type { ChartPoint } from "./Chart.tsx";

const dollars = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
const dateLabel = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

export function PortfolioChart({ points }: { points: ChartPoint[] }) {
  const [selected, setSelected] = useState<number | null>(null);
  if (points.length < 2)
    return <p>There is not enough sample history for this period.</p>;
  const values = points.map((point) => point.value),
    min = Math.min(...values),
    max = Math.max(...values);
  const padding = Math.max((max - min) * 0.15, 1),
    floor = min - padding,
    ceiling = max + padding;
  const x = (index: number) => 4 + (index / (points.length - 1)) * 992;
  const y = (value: number) =>
    230 - ((value - floor) / (ceiling - floor)) * 220;
  const path = points
    .map(
      (point, index) =>
        `${index ? "L" : "M"}${x(index).toFixed(2)},${y(point.value).toFixed(2)}`,
    )
    .join(" ");
  const active =
    selected === null ? null : Math.min(selected, points.length - 1);
  return (
    <div className="portfolio-chart">
      <div
        className="portfolio-chart-plot"
        onPointerLeave={() => setSelected(null)}
      >
        <svg
          viewBox="0 0 1000 240"
          preserveAspectRatio="none"
          role="img"
          tabIndex={0}
          aria-label="Practice portfolio value over the selected sample period. Use left and right arrows to inspect observations."
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
              event.preventDefault();
              setSelected((index) =>
                Math.max(
                  0,
                  Math.min(
                    points.length - 1,
                    (index ?? points.length - 1) +
                      (event.key === "ArrowLeft" ? -1 : 1),
                  ),
                ),
              );
            }
            if (event.key === "Escape") setSelected(null);
          }}
          onPointerMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            setSelected(
              Math.max(
                0,
                Math.min(
                  points.length - 1,
                  Math.round(
                    ((event.clientX - rect.left) / rect.width) *
                      (points.length - 1),
                  ),
                ),
              ),
            );
          }}
        >
          {[10, 83.333, 156.667, 230].map((line) => (
            <path
              key={line}
              d={`M0 ${line}H1000`}
              className="portfolio-chart-grid"
            />
          ))}
          <path d={path} className="portfolio-chart-line" />
          {active !== null && (
            <path
              d={`M${x(active)} 0V240`}
              className="portfolio-chart-cursor"
            />
          )}
        </svg>
        {active !== null && (
          <span
            className="portfolio-chart-point"
            style={{
              left: `${x(active) / 10}%`,
              top: `${(y(points[active].value) / 240) * 100}%`,
            }}
          />
        )}
        {active !== null && (
          <div className="portfolio-chart-tooltip" role="status">
            {dateLabel(points[active].date)}{" "}
            <strong>${points[active].value.toFixed(2)}</strong>
          </div>
        )}
      </div>
      <div className="portfolio-chart-axis" aria-hidden="true">
        {[
          ceiling,
          ceiling - (ceiling - floor) / 3,
          floor + (ceiling - floor) / 3,
          floor,
        ].map((value, index) => (
          <span key={index}>{dollars(value)}</span>
        ))}
      </div>
      <div className="portfolio-chart-dates" aria-hidden="true">
        {[
          0,
          Math.floor((points.length - 1) / 3),
          Math.floor(((points.length - 1) * 2) / 3),
          points.length - 1,
        ].map((index) => (
          <span key={index}>{dateLabel(points[index].date)}</span>
        ))}
      </div>
    </div>
  );
}

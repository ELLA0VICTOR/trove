import { useId, useState } from "react";
export type ChartPoint = { date: string; value: number };
export function Chart({
  points,
  comparison,
  className = "",
  filled = true,
  label = "Practice portfolio value",
}: {
  points: ChartPoint[];
  comparison?: ChartPoint[];
  className?: string;
  filled?: boolean;
  label?: string;
}) {
  const id = useId().replace(/:/g, ""),
    [hover, setHover] = useState<number | null>(null);
  if (points.length < 2)
    return (
      <p className="muted">There is not enough data to draw this period.</p>
    );
  const values = [...points, ...(comparison ?? [])].map((p) => p.value),
    min = Math.min(...values),
    max = Math.max(...values),
    spread = max - min || 1;
  const x = (i: number) => 16 + (i / (points.length - 1)) * 868,
    y = (v: number) => 240 - ((v - min) / spread) * 185;
  const path = (data: ChartPoint[]) =>
    data
      .map(
        (p, i) => `${i ? "L" : "M"}${x(i).toFixed(2)},${y(p.value).toFixed(2)}`,
      )
      .join(" ");
  return (
    <div className={`chart ${className}`} onPointerLeave={() => setHover(null)}>
      <svg
        viewBox="0 0 900 290"
        role="img"
        aria-label={label}
        onPointerMove={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          setHover(
            Math.max(
              0,
              Math.min(
                points.length - 1,
                Math.round(
                  ((((event.clientX - box.left) / box.width) * 900 - 16) /
                    868) *
                    (points.length - 1),
                ),
              ),
            ),
          );
        }}
      >
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop stopColor="var(--spot)" stopOpacity=".16" />
            <stop offset="1" stopColor="var(--spot)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[55, 117, 179, 241].map((line) => (
          <path key={line} d={`M16 ${line}H884`} className="chart-grid" />
        ))}
        {filled && (
          <path d={`${path(points)} L884 254 L16 254Z`} fill={`url(#${id})`} />
        )}
        {comparison && (
          <path d={path(comparison)} className="chart-comparison" />
        )}
        <path d={path(points)} className="chart-main" />
        <circle
          cx={x(points.length - 1)}
          cy={y(points.at(-1)!.value)}
          r="4"
          fill="var(--spot)"
        />
        {hover !== null && (
          <g>
            <path d={`M${x(hover)} 30V252`} className="chart-hover-line" />
            <circle
              cx={x(hover)}
              cy={y(points[hover].value)}
              r="5"
              fill="var(--spot)"
            />
          </g>
        )}
        <text x="16" y="282" className="chart-date">
          {new Date(points[0].date + "T12:00:00").toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          })}
        </text>
        <text x="884" y="282" textAnchor="end" className="chart-date">
          {new Date(points.at(-1)!.date + "T12:00:00").toLocaleDateString(
            "en-US",
            { month: "short", day: "numeric" },
          )}
        </text>
      </svg>
      {hover !== null && (
        <span className="chart-tooltip">
          {points[hover].date} · ${points[hover].value.toFixed(2)}
          {comparison ? ` / $${comparison[hover].value.toFixed(2)}` : ""}
        </span>
      )}
    </div>
  );
}

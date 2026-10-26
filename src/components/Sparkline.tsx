import type { Instrument } from "../../shared/model.ts";

/** A compact view of the instrument's actual sample series, without a second data source. */
export function Sparkline({
  instrument,
  className = "",
}: {
  instrument: Instrument;
  className?: string;
}) {
  const values = instrument.prices.map((point) => Number(point.price));
  if (values.length < 2) return null;
  const min = Math.min(...values),
    spread = Math.max(...values) - min || 1;
  const path = values
    .map(
      (value, index) =>
        `${index ? "L" : "M"}${(4 + (index / (values.length - 1)) * 120).toFixed(2)},${(40 - ((value - min) / spread) * 32).toFixed(2)}`,
    )
    .join(" ");
  const rising = values.at(-1)! >= values[0];
  return (
    <svg
      className={`sparkline ${rising ? "rising" : "falling"} ${className}`}
      viewBox="0 0 128 48"
      role="img"
      aria-label={`${instrument.name} sample period trend: ${rising ? "up" : "down"}`}
    >
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

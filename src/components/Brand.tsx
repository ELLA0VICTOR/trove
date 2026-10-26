import { Link } from "react-router-dom";
export function Sapling({
  className = "",
  pixel = false,
}: {
  className?: string;
  pixel?: boolean;
}) {
  return pixel ? (
    <svg
      className={className}
      viewBox="0 0 48 48"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M4 9h5v5H4zm6 0h5v5h-5zm6 0h5v5h-5zm-6 6h5v5h-5zm6 0h5v5h-5zm6 0h5v5h-5zm-6 6h5v5h-5zm6 0h5v5h-5zm6 0h5v5h-5zm0-6h5v5h-5zm6 0h5v5h-5zm0-6h5v5h-5zm6 0h5v5h-5zM22 27h5v5h-5zm0 6h5v5h-5zm0 6h5v5h-5z" />
    </svg>
  ) : (
    <svg
      className={className}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
    >
      <path d="M24 41V24" stroke="currentColor" strokeWidth="3" />
      <path
        d="M24 27C12 27 6 20 6 8c12 0 20 6 18 19Zm0-3C24 13 32 7 43 7c0 12-7 19-19 17Z"
        fill="currentColor"
      />
      <path
        d="M11 13 24 27M37 12 24 24"
        stroke="var(--background)"
        strokeWidth="1.5"
      />
    </svg>
  );
}
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className="brand" aria-label="Trove home">
      <Sapling className="brand-mark" />
      <span>trove</span>
      {!compact && <span className="brand-tag">GROW YOUR OWN WAY</span>}
    </Link>
  );
}

const patterns: Record<string, string[]> = {
  sprout: [
    "000000010",
    "011100110",
    "011110100",
    "001111100",
    "000111000",
    "000010000",
    "000010000",
    "001111100",
    "011111110",
  ],
  chart: [
    "000000010",
    "000000010",
    "000010010",
    "000010010",
    "001010010",
    "001010010",
    "101010010",
    "101010010",
    "111111111",
  ],
  memory: [
    "001111100",
    "011000110",
    "110010011",
    "100111001",
    "101111101",
    "100111001",
    "110010011",
    "011000110",
    "001111100",
  ],
  shield: [
    "000010000",
    "001111100",
    "111111111",
    "110000011",
    "110010011",
    "011111110",
    "001111100",
    "000111000",
    "000010000",
  ],
};
export function PixelIcon({
  kind = "sprout",
  className = "",
}: {
  kind?: string;
  className?: string;
}) {
  return (
    <span className={`pixel-icon ${className}`} aria-hidden="true">
      {(patterns[kind] ?? patterns.sprout).flatMap((row, y) =>
        [...row].map((cell, x) => (
          <i
            key={`${x}-${y}`}
            className={cell === "1" ? "lit" : ""}
            style={{
              animationDelay: `${(Math.abs(x - 4) + Math.abs(y - 4)) * 0.13}s`,
            }}
          />
        )),
      )}
    </span>
  );
}

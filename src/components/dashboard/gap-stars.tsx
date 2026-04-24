/**
 * Three-star opportunity indicator for Gap Analysis rows.
 *
 * Peec convention: 1-3 stars, stars filled = opportunity level.
 * Keeps visual weight consistent with the rest of the UI (monospace
 * tabular-nums feel). This is a pure presentational component with
 * no client-state, so it's fine as a server component.
 */

import { Star } from "lucide-react";

interface GapStarsProps {
  stars: 1 | 2 | 3;
  /** Optional textual label shown alongside the stars. */
  label?: string;
  className?: string;
}

const LABELS: Record<1 | 2 | 3, string> = {
  1: "Low",
  2: "Moderate",
  3: "High",
};

export function GapStarsDisplay({ stars, label, className }: GapStarsProps) {
  const text = label ?? LABELS[stars];
  return (
    <span
      className={`inline-flex items-center gap-1 ${className ?? ""}`}
      aria-label={`${text} opportunity (${stars} of 3 stars)`}
    >
      {[1, 2, 3].map((n) => (
        <Star
          key={n}
          className={`h-3.5 w-3.5 ${
            n <= stars
              ? "fill-emerald-dark text-emerald-dark"
              : "text-text-muted/30"
          }`}
          strokeWidth={1.5}
        />
      ))}
      <span className="sr-only">{text}</span>
    </span>
  );
}

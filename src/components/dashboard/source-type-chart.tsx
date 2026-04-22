"use client";

/**
 * Source-type breakdown donut chart.
 *
 * Shared between /sources/domains and /sources/urls views. Takes a
 * pre-aggregated Record<SourceType|"unclassified", number> and renders
 * a compact donut with a legend.
 *
 * Design constraints pulled from .impeccable.md:
 *   - No gradients, no glow, no drop-shadows on slices.
 *   - Forest green accent reserved for `your_own`.
 *   - Neutral palette for everything else, in a narrow tonal range.
 */

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import type { SourceType } from "@/lib/classifiers/types";
import { SOURCE_TYPE_LABELS } from "@/lib/classifiers/types";

type Bucket = SourceType | "unclassified";

interface SourceTypeChartProps {
  counts: Record<Bucket, number>;
  /** If set, clicking a slice will drill-down. Passes the type back. */
  onSliceClick?: (type: Bucket) => void;
  /** Optional explicit size for tight layouts. */
  height?: number;
}

// Palette tuned to `.impeccable.md` — muted, tonal, forest green only
// on the brand slice. Picked via OKLCH so the slices stay distinguishable
// under the paper-warm background.
const COLORS: Record<Bucket, string> = {
  your_own: "#166534", // emerald-dark (brand accent)
  editorial: "#1e3a5f", // deep navy
  corporate: "#475569", // slate
  ugc: "#7c3aed", // violet
  reference: "#0f766e", // teal
  social: "#be185d", // raspberry
  other: "#6b7280", // neutral grey
  unclassified: "#cbd5e1", // light slate — low-emphasis
};

const ORDER: Bucket[] = [
  "your_own",
  "editorial",
  "ugc",
  "reference",
  "corporate",
  "social",
  "other",
  "unclassified",
];

export function SourceTypeChart({
  counts,
  onSliceClick,
  height = 240,
}: SourceTypeChartProps) {
  const data = ORDER.map((type) => ({
    type,
    name:
      type === "unclassified"
        ? SOURCE_TYPE_LABELS.other + " / pending"
        : SOURCE_TYPE_LABELS[type],
    value: counts[type] ?? 0,
    color: COLORS[type],
  })).filter((d) => d.value > 0);

  const total = data.reduce((s, d) => s + d.value, 0);

  if (total === 0) {
    return (
      <div
        className="flex items-center justify-center text-sm text-text-muted border border-dashed border-border rounded-lg"
        style={{ height }}
      >
        No source data yet. Run a visibility pass to populate this chart.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-[minmax(200px,1fr)_auto] gap-6 items-center">
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius="58%"
              outerRadius="90%"
              dataKey="value"
              stroke="transparent"
              paddingAngle={1}
              isAnimationActive={false}
            >
              {data.map((slice) => (
                <Cell
                  key={slice.type}
                  fill={slice.color}
                  cursor={onSliceClick ? "pointer" : "default"}
                  onClick={
                    onSliceClick ? () => onSliceClick(slice.type) : undefined
                  }
                />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                fontSize: 12,
                border: "1px solid var(--color-border)",
                borderRadius: 6,
                background: "var(--color-surface)",
              }}
              formatter={(value, _name, item) => {
                const n = Number(value ?? 0);
                const label =
                  (item as { payload?: { name?: string } } | undefined)?.payload
                    ?.name ?? "";
                const pct = total > 0 ? Math.round((n / total) * 100) : 0;
                return [`${n} (${pct}%)`, label];
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Legend — vertical, no card, editorial-style */}
      <ul className="space-y-1.5 text-xs font-mono tabular-nums">
        {data.map((slice) => (
          <li
            key={slice.type}
            className="flex items-center gap-2"
          >
            <span
              aria-hidden="true"
              className="inline-block w-3 h-3 rounded-sm shrink-0"
              style={{ backgroundColor: slice.color }}
            />
            <span className="text-text-primary whitespace-nowrap">
              {slice.name}
            </span>
            <span className="text-text-muted ml-auto pl-4">
              {slice.value}
              <span className="ml-1 text-text-muted">
                ({Math.round((slice.value / total) * 100)}%)
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

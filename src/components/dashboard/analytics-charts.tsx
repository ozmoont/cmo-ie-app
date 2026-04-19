"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
} from "recharts";

// Hex approximations of the OKLCH palette - recharts can't resolve
// CSS variables, so keep these in sync with globals.css by hand.
const CHART_TOKENS = {
  forest: "#166534",       // emerald / brand accent
  forestDark: "#14532D",   // emerald-dark
  forestLight: "#BBF7D0",  // emerald-light
  danger: "#EF4444",       // danger
  info: "#3B82F6",         // info
  textPrimary: "#141614",  // near-black
  textSecondary: "#5C5F58",// secondary
  textMuted: "#8F928B",    // muted
  border: "#E4E4DE",       // border
  surface: "#FDFDFB",      // paper-warm surface
};

const TOOLTIP_STYLE = {
  backgroundColor: CHART_TOKENS.surface,
  border: `1px solid ${CHART_TOKENS.border}`,
  borderRadius: "8px",
  color: CHART_TOKENS.textPrimary,
  fontSize: "13px",
  boxShadow: "0 4px 12px oklch(0.2 0.03 148 / 0.08)",
};

// ─────────────────────────────────────────────────────────────────────────
// Citation Domains
// Rendered directly into its parent section - no Card wrapper.
// ─────────────────────────────────────────────────────────────────────────

interface CitationDomainsProps {
  domains: {
    domain: string;
    count: number;
    isBrand: boolean;
    isCompetitor: boolean;
  }[];
}

export function CitationDomains({ domains }: CitationDomainsProps) {
  const top = domains.slice(0, 10);

  if (top.length === 0) {
    return (
      <p className="text-sm text-text-secondary py-8">
        No citation data yet. Citations are tracked when daily runs complete.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={top} layout="vertical">
            <CartesianGrid
              strokeDasharray="3 3"
              stroke={CHART_TOKENS.border}
              horizontal={false}
            />
            <XAxis
              type="number"
              tick={{ fill: CHART_TOKENS.textSecondary, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="domain"
              tick={{ fill: CHART_TOKENS.textSecondary, fontSize: 11 }}
              width={160}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(value) => [value ?? 0, "Citations"]}
            />
            <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={20}>
              {top.map((entry, i) => (
                <Cell
                  key={i}
                  fill={
                    entry.isBrand
                      ? CHART_TOKENS.forest
                      : entry.isCompetitor
                        ? CHART_TOKENS.danger
                        : CHART_TOKENS.textMuted
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap gap-5 text-xs text-text-secondary">
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: CHART_TOKENS.forest }}
          />
          Your brand
        </span>
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: CHART_TOKENS.danger }}
          />
          Competitor
        </span>
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: CHART_TOKENS.textMuted }}
          />
          Other
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Sentiment
// ─────────────────────────────────────────────────────────────────────────

const SENTIMENT_COLOURS: Record<string, string> = {
  positive: CHART_TOKENS.forest,
  neutral: CHART_TOKENS.textMuted,
  negative: CHART_TOKENS.danger,
};

interface SentimentChartProps {
  distribution: { sentiment: string; count: number; percentage: number }[];
}

export function SentimentChart({ distribution }: SentimentChartProps) {
  const hasData = distribution.some((d) => d.count > 0);

  if (!hasData) {
    return (
      <p className="text-sm text-text-secondary py-8">
        No sentiment data yet.
      </p>
    );
  }

  return (
    <div className="flex items-center gap-6 flex-wrap">
      <div className="h-48 w-48 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={distribution.filter((d) => d.count > 0)}
              dataKey="count"
              nameKey="sentiment"
              cx="50%"
              cy="50%"
              innerRadius={45}
              outerRadius={70}
              strokeWidth={0}
            >
              {distribution
                .filter((d) => d.count > 0)
                .map((entry, i) => (
                  <Cell
                    key={i}
                    fill={
                      SENTIMENT_COLOURS[entry.sentiment] ??
                      CHART_TOKENS.textMuted
                    }
                  />
                ))}
            </Pie>
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(value, name) => [
                `${value ?? 0} results`,
                typeof name === "string"
                  ? name.charAt(0).toUpperCase() + name.slice(1)
                  : String(name ?? ""),
              ]}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="space-y-3 flex-1 min-w-[180px]">
        {distribution.map((d) => (
          <div key={d.sentiment} className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="inline-block w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: SENTIMENT_COLOURS[d.sentiment] }}
            />
            <span className="text-sm capitalize flex-1 text-text-primary">
              {d.sentiment}
            </span>
            <span className="font-mono tabular-nums text-sm font-semibold text-text-primary">
              {d.percentage}%
            </span>
            <span className="text-xs text-text-muted">({d.count})</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Mention Position
// ─────────────────────────────────────────────────────────────────────────

interface MentionPositionProps {
  positions: { position: string; count: number; percentage: number }[];
}

export function MentionPositionChart({ positions }: MentionPositionProps) {
  const hasData = positions.some((p) => p.count > 0);

  if (!hasData) {
    return (
      <p className="text-sm text-text-secondary py-8">
        No position data yet.
      </p>
    );
  }

  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={positions}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke={CHART_TOKENS.border}
            vertical={false}
          />
          <XAxis
            dataKey="position"
            tick={{ fill: CHART_TOKENS.textSecondary, fontSize: 12 }}
            axisLine={{ stroke: CHART_TOKENS.border }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: CHART_TOKENS.textSecondary, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(value) => [value ?? 0, "Mentions"]}
          />
          <Bar dataKey="count" radius={[4, 4, 0, 0]} barSize={40}>
            {positions.map((_, i) => (
              <Cell
                key={i}
                // Position 1 & 2 are the "good" outcomes - brand colour;
                // 3+ progressively muted. Nothing red unless data says so.
                fill={
                  i === 0
                    ? CHART_TOKENS.forest
                    : i === 1
                      ? CHART_TOKENS.forestDark
                      : i === 2
                        ? CHART_TOKENS.textSecondary
                        : CHART_TOKENS.border
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Competitor Appearances
// ─────────────────────────────────────────────────────────────────────────

interface CompetitorAppearancesProps {
  competitors: { name: string; domain: string; appearances: number }[];
}

export function CompetitorAppearances({
  competitors,
}: CompetitorAppearancesProps) {
  if (competitors.length === 0) {
    return (
      <p className="text-sm text-text-secondary py-8">
        Add competitors to track their citation appearances.
      </p>
    );
  }

  const max = Math.max(...competitors.map((c) => c.appearances), 1);

  return (
    <div className="space-y-3">
      {competitors.map((comp) => {
        const pct = Math.round((comp.appearances / max) * 100);
        return (
          <div key={comp.name}>
            <div className="flex justify-between text-sm mb-1.5">
              <span className="font-medium text-text-primary">{comp.name}</span>
              <span className="font-mono tabular-nums text-text-secondary">
                {comp.appearances} citations
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-surface-hover overflow-hidden">
              <div
                className="h-full rounded-full bg-danger transition-[width] duration-500 ease-linear"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

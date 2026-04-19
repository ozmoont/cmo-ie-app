"use client";

import { Badge } from "@/components/ui/badge";
import type { PromptCategory } from "@/lib/types";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from "recharts";

// Palette kept in sync with globals.css OKLCH tokens - recharts can't
// read CSS vars, so mirror the values here.
const CHART_TOKENS = {
  forest: "#166534",
  forestDark: "#14532D",
  border: "#E4E4DE",
  textSecondary: "#5C5F58",
  textMuted: "#8F928B",
  textPrimary: "#141614",
  surface: "#FDFDFB",
};

const TOOLTIP_STYLE = {
  backgroundColor: CHART_TOKENS.surface,
  border: `1px solid ${CHART_TOKENS.border}`,
  borderRadius: "8px",
  color: CHART_TOKENS.textPrimary,
  fontSize: "13px",
  boxShadow: "0 4px 12px oklch(0.2 0.03 148 / 0.08)",
};

interface ProjectChartsProps {
  trend: { date: string; score: number }[];
  modelScores: { model: string; label: string; score: number }[];
  promptBreakdown: {
    prompt: string;
    category: string;
    score: number;
    modelsVisible: number;
    totalModels: number;
  }[];
  brandName: string;
}

export function ProjectCharts({
  trend,
  modelScores,
  promptBreakdown,
}: ProjectChartsProps) {
  return (
    <div className="space-y-10 md:space-y-12">
      {/* ── Visibility over time + by model (paired) ── */}
      <div className="grid gap-10 md:gap-12 lg:grid-cols-2">
        {/* Visibility trend */}
        <div>
          <h3 className="text-base font-semibold text-text-primary mb-4">
            Visibility over time
          </h3>
          {trend.length === 0 ? (
            <p className="text-sm text-text-secondary py-12">
              No data yet. Click &ldquo;Run now&rdquo; to start tracking.
            </p>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={CHART_TOKENS.border}
                    vertical={false}
                  />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: CHART_TOKENS.textSecondary, fontSize: 11 }}
                    tickFormatter={(d) =>
                      new Date(d).toLocaleDateString("en-IE", {
                        day: "numeric",
                        month: "short",
                      })
                    }
                    axisLine={{ stroke: CHART_TOKENS.border }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: CHART_TOKENS.textSecondary, fontSize: 11 }}
                    domain={[0, 100]}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(value) => [
                      `${value}%`,
                      "of AI responses mention your brand",
                    ]}
                    labelFormatter={(label) =>
                      new Date(label).toLocaleDateString("en-IE", {
                        day: "numeric",
                        month: "long",
                      })
                    }
                  />
                  <Line
                    type="monotone"
                    dataKey="score"
                    stroke={CHART_TOKENS.forest}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, fill: CHART_TOKENS.forest }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Visibility by AI model */}
        <div>
          <h3 className="text-base font-semibold text-text-primary mb-4">
            Visibility by AI model
          </h3>
          {modelScores.length === 0 ? (
            <p className="text-sm text-text-secondary py-12">
              No data yet.
            </p>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={modelScores} layout="vertical">
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={CHART_TOKENS.border}
                    horizontal={false}
                  />
                  <XAxis
                    type="number"
                    domain={[0, 100]}
                    tick={{ fill: CHART_TOKENS.textSecondary, fontSize: 11 }}
                    tickFormatter={(v) => `${v}%`}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="label"
                    tick={{ fill: CHART_TOKENS.textSecondary, fontSize: 12 }}
                    width={140}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(value) => [
                      `${value}%`,
                      "of responses mention your brand",
                    ]}
                  />
                  <Bar dataKey="score" radius={[0, 4, 4, 0]} barSize={24}>
                    {modelScores.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={
                          entry.score >= 60
                            ? CHART_TOKENS.forest
                            : entry.score >= 30
                              ? CHART_TOKENS.forestDark
                              : CHART_TOKENS.border
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* ── Prompt breakdown table ── */}
      <div>
        <h3 className="text-base font-semibold text-text-primary mb-4">
          Prompt breakdown
        </h3>
        {promptBreakdown.length === 0 ? (
          <p className="text-sm text-text-secondary py-8">
            No prompts tracked yet. Add prompts in the Prompts tab.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 pr-4 font-semibold text-[11px] uppercase tracking-[0.15em] text-text-muted">
                    Customer question
                  </th>
                  <th className="text-left py-3 px-4 font-semibold text-[11px] uppercase tracking-[0.15em] text-text-muted">
                    Funnel
                  </th>
                  <th className="text-center py-3 px-4 font-semibold text-[11px] uppercase tracking-[0.15em] text-text-muted">
                    Mentioning
                  </th>
                  <th className="text-right py-3 pl-4 font-semibold text-[11px] uppercase tracking-[0.15em] text-text-muted">
                    Visibility
                  </th>
                </tr>
              </thead>
              <tbody>
                {promptBreakdown.map((row, i) => (
                  <tr
                    key={i}
                    className="border-b border-border hover:bg-surface-muted/50 transition-[background-color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]"
                  >
                    <td className="py-3.5 pr-4 max-w-md">
                      <p className="truncate text-text-primary">{row.prompt}</p>
                    </td>
                    <td className="py-3.5 px-4">
                      <Badge variant={row.category as PromptCategory}>
                        {row.category}
                      </Badge>
                    </td>
                    <td className="py-3.5 px-4 text-center font-mono tabular-nums text-text-primary">
                      {row.modelsVisible}/{row.totalModels}
                    </td>
                    <td className="py-3.5 pl-4 text-right">
                      <span
                        className={`font-mono tabular-nums font-semibold ${
                          row.score >= 60
                            ? "text-emerald-dark"
                            : row.score > 0
                              ? "text-warning"
                              : "text-danger"
                        }`}
                      >
                        {row.score}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

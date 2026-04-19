import { cn } from "@/lib/utils";

interface CreditsBadgeProps {
  used: number;
  limit: number;
  className?: string;
}

export function CreditsBadge({ used, limit, className }: CreditsBadgeProps) {
  const unlimited = limit === Infinity;
  const remaining = unlimited ? Infinity : Math.max(0, limit - used);
  const pct = unlimited ? 100 : (remaining / limit) * 100;

  // Tone: emerald by default, warning when running low, danger when empty.
  let tone = "border-border text-text-secondary";
  if (!unlimited) {
    if (remaining === 0) tone = "border-danger/40 text-danger";
    else if (pct < 20) tone = "border-warning/40 text-warning";
    else tone = "border-emerald-dark/30 text-emerald-dark";
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-mono tabular-nums font-medium uppercase tracking-[0.1em]",
        tone,
        className
      )}
    >
      {unlimited ? "Unlimited" : `${used} / ${limit}`}
    </span>
  );
}

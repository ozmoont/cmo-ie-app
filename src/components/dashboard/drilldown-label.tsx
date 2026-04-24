/**
 * Editorial-style section label that doubles as a drill-down link.
 *
 * Matches the Overview page's existing emerald-underline section labels,
 * with a subtle arrow that appears on hover. The presence of the arrow
 * is the affordance — the section still reads as a label even when the
 * user isn't hovering, so the page doesn't become a wall of links.
 *
 * Server component (no state) — safe to use on SSR pages.
 */

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

interface DrilldownLabelProps {
  href: string;
  children: React.ReactNode;
  className?: string;
}

export function DrilldownLabel({
  href,
  children,
  className,
}: DrilldownLabelProps) {
  return (
    <Link
      href={href}
      className={`group text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold flex items-center gap-3 transition-colors hover:text-emerald-dark/70 ${className ?? ""}`}
    >
      <span
        aria-hidden="true"
        className="inline-block w-4 h-[2px] bg-emerald-dark group-hover:bg-emerald-dark/70"
      />
      <span className="flex items-center gap-1.5">
        {children}
        <ArrowUpRight className="h-3 w-3 opacity-0 -translate-x-1 transition-all duration-150 group-hover:opacity-100 group-hover:translate-x-0" />
      </span>
    </Link>
  );
}

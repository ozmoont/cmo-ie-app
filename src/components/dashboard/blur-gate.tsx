"use client";

import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";
import Link from "next/link";

interface BlurGateProps {
  children: React.ReactNode;
  /** If true, blur the content and show upgrade overlay */
  blurred: boolean;
  /** What feature is gated - shown in the CTA */
  feature?: string;
}

/**
 * Wraps content with a blur + upgrade overlay for trial users.
 * Editorial treatment: minimal centred block, no icon circle.
 */
export function BlurGate({
  children,
  blurred,
  feature = "full results",
}: BlurGateProps) {
  if (!blurred) return <>{children}</>;

  return (
    <div className="relative">
      {/* Blurred content - still rendered so it looks real */}
      <div
        className="select-none pointer-events-none"
        style={{ filter: "blur(6px)" }}
        aria-hidden="true"
      >
        {children}
      </div>

      {/* Upgrade overlay - quiet paper block, no icon circle */}
      <div className="absolute inset-0 flex items-center justify-center bg-surface/70 backdrop-blur-[2px]">
        <div className="text-center px-8 py-6 max-w-sm space-y-4">
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold inline-flex items-center gap-2">
            <Lock className="h-3.5 w-3.5" />
            Upgrade to unlock
          </p>
          <p className="text-lg font-semibold text-text-primary tracking-tight leading-tight">
            See {feature}.
          </p>
          <p className="text-sm text-text-secondary leading-relaxed">
            Your trial includes one snapshot. Unlock daily tracking, more
            prompts, and full competitor analysis.
          </p>
          <Link href="/settings">
            <Button size="sm">View plans</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

/**
 * Wraps a list of items where the first N are clear and the rest are blurred.
 * Use for grids, card lists, chart sections, etc.
 */
export function BlurGateList({
  children,
  visibleCount = 1,
  blurResults,
  feature = "all results",
}: {
  children: React.ReactNode[];
  visibleCount?: number;
  blurResults: boolean;
  feature?: string;
}) {
  if (!blurResults) return <>{children}</>;

  const visible = children.slice(0, visibleCount);
  const gated = children.slice(visibleCount);

  return (
    <>
      {visible}
      {gated.length > 0 && (
        <BlurGate blurred={true} feature={feature}>
          {gated}
        </BlurGate>
      )}
    </>
  );
}

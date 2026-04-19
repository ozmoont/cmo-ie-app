"use client";

import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface UpgradeNudgeProps {
  feature: string;
  targetPlan: string;
  compact?: boolean;
}

const planTitles: Record<string, string> = {
  strategy: "Pro",
  full: "Advanced",
  pro: "Pro",
  advanced: "Advanced",
};

export function UpgradeNudge({
  feature,
  targetPlan,
  compact = false,
}: UpgradeNudgeProps) {
  const planName = planTitles[targetPlan] ?? targetPlan;

  if (compact) {
    // Inline - used beside individual actions / rows
    return (
      <Link href="/settings" className="shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className="text-text-muted hover:text-text-primary"
        >
          <Lock className="h-3.5 w-3.5 mr-1" />
          Upgrade
        </Button>
      </Link>
    );
  }

  // Full - editorial block with kicker rule. No card chrome.
  return (
    <div className="border-l-0 border-t border-b border-border py-5 flex items-start gap-4">
      <Lock className="h-4 w-4 text-emerald-dark shrink-0 mt-1" />
      <div className="flex-1 space-y-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-dark font-semibold">
            {planName} plan
          </p>
          <p className="text-base font-semibold text-text-primary mt-1.5">
            {feature} unlocks on {planName}.
          </p>
          <p className="text-sm text-text-secondary mt-1 max-w-md leading-relaxed">
            Upgrade your plan to unlock {feature.toLowerCase()} and other
            advanced features.
          </p>
        </div>
        <Link href="/settings">
          <Button size="sm" variant="default">
            Upgrade to {planName}
          </Button>
        </Link>
      </div>
    </div>
  );
}

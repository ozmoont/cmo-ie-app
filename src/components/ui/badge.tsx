import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-[background-color,color,border-color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]",
  {
    variants: {
      variant: {
        default: "bg-emerald/10 text-text-primary",
        awareness: "bg-info/10 text-info",
        consideration: "bg-warning/10 text-warning",
        decision: "bg-emerald/10 text-text-primary",
        positive: "bg-emerald/10 text-text-primary",
        neutral: "bg-slate-100 text-text-secondary",
        negative: "bg-danger/10 text-danger",
        outline: "border border-border text-text-secondary",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };

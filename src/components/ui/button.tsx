import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  // Scoped transition (no `all`), strong ease-out curve, press feedback.
  // `active:scale-[0.97]` is the single biggest polish lever per the design spec.
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium will-change-transform transition-[background-color,color,transform,box-shadow,border-color,opacity] duration-[160ms] ease-[cubic-bezier(0.23,1,0.32,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer active:scale-[0.97] active:duration-[100ms]",
  {
    variants: {
      variant: {
        // Primary CTA - matte black, clean shadow on hover.
        default:
          "bg-text-primary text-text-inverse shadow-sm hover:bg-text-primary/90 hover:shadow-md",
        // Featured CTA - identical to default, kept for API compatibility.
        brand:
          "bg-text-primary text-text-inverse shadow-sm hover:bg-text-primary/90 hover:shadow-md",
        outline:
          "border border-border bg-surface text-text-primary hover:bg-surface-hover",
        ghost: "text-text-secondary hover:text-text-primary hover:bg-surface-hover",
        danger: "bg-danger text-text-inverse hover:bg-danger/90",
        link: "text-text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-5 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-12 px-8 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };

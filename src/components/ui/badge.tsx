import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary/90 text-primary-foreground shadow-sm",
        secondary: "border-border/50 bg-muted text-muted-foreground",
        destructive: "border-transparent bg-destructive/90 text-destructive-foreground shadow-sm",
        outline: "border-border/60 text-foreground/80",
        success: "border-transparent bg-success/90 text-success-foreground shadow-sm",
        warning: "border-transparent bg-warning/90 text-warning-foreground shadow-sm",
        pending: "border-transparent bg-pending/90 text-pending-foreground shadow-sm",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant, ...props }, ref) => {
    return <div ref={ref} className={cn(badgeVariants({ variant }), className)} {...props} />;
  }
);
Badge.displayName = "Badge";

export { Badge, badgeVariants };

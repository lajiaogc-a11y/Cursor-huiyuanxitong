import * as React from "react";
import { Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface LoadingButtonProps extends ButtonProps {
  loading?: boolean;
}

export const LoadingButton = React.forwardRef<HTMLButtonElement, LoadingButtonProps>(
  ({ loading, children, disabled, className, ...props }, ref) => (
    <Button ref={ref} disabled={disabled || loading} className={cn(className)} {...props}>
      {loading ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden /> : null}
      {children}
    </Button>
  ),
);
LoadingButton.displayName = "LoadingButton";

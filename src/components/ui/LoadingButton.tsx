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
      <span className={cn("inline-flex items-center justify-center", loading && "gap-2")}>
        {loading ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden />
        ) : null}
        <span className="min-w-0">{children}</span>
      </span>
    </Button>
  ),
);
LoadingButton.displayName = "LoadingButton";

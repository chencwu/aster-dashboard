import * as React from "react";
import { cn } from "@/lib/utils";

type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  tone?: "neutral" | "positive" | "negative" | "warning";
};

export function Badge({ className, tone = "neutral", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border px-2 py-0.5 text-xs font-medium",
        tone === "neutral" && "border-border bg-muted/60 text-muted-foreground",
        tone === "positive" && "border-emerald-400/25 bg-emerald-400/10 text-emerald-200",
        tone === "negative" && "border-rose-400/25 bg-rose-400/10 text-rose-200",
        tone === "warning" && "border-amber-400/25 bg-amber-400/10 text-amber-200",
        className
      )}
      {...props}
    />
  );
}

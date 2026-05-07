import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type StatCardProps = {
  title: string;
  value: string;
  caption?: string;
  icon?: ReactNode;
};

export function StatCard({ title, value, caption, icon }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3 pb-3">
        <CardTitle className="text-muted-foreground">{title}</CardTitle>
        {icon ? <div className="text-primary">{icon}</div> : null}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold text-foreground">{value}</div>
        {caption ? <div className="mt-1 text-xs text-muted-foreground">{caption}</div> : null}
      </CardContent>
    </Card>
  );
}

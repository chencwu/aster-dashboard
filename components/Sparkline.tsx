"use client";

import { Line, LineChart, ResponsiveContainer } from "recharts";

type SparklineProps = {
  values: number[];
  color?: string;
};

export function Sparkline({ values, color = "#1bdfa0" }: SparklineProps) {
  const data = values.map((value, index) => ({ index, value }));

  if (data.length < 2) {
    return <div className="h-8 text-xs text-muted-foreground">累积中</div>;
  }

  return (
    <div className="h-8 w-28">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

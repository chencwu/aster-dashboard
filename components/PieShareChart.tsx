"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatUsd } from "@/lib/format";

const DEFAULT_COLORS = [
  "#20d6a4",
  "#4aa8ff",
  "#ffd166",
  "#ef6f8f",
  "#b186ff",
  "#7de37a",
  "#f59e0b",
  "#60a5fa",
  "#f472b6",
  "#a3e635",
  "#fb7185",
  "#38bdf8",
  "#c084fc",
  "#facc15",
  "#34d399",
  "#94a3b8"
];

export type PieDatum = {
  name: string;
  value: number;
  pct: number;
  color: string;
};

type Props = {
  data: PieDatum[];
  metricLabel: string;
};

export function PieShareChart({ data, metricLabel }: Props) {
  const topLegend = data.slice(0, 8);

  return (
    <div className="grid min-w-0 items-center gap-5">
      <div className="flex min-h-72 min-w-0 items-center justify-center">
        <div className="h-72 w-full max-w-[20rem]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius="45%"
                outerRadius="72%"
                paddingAngle={2}
                stroke="#111820"
                strokeWidth={2}
              >
                {data.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<ShareTooltip metricLabel={metricLabel} />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="mx-auto grid w-full max-w-[42rem] grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="text-xs text-muted-foreground">Top share</div>
        <div className="hidden sm:block" />
        {topLegend.map((item) => (
          <div key={item.name} className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-md border bg-background/45 px-3 py-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: item.color }} />
                <span className="truncate text-sm font-medium text-foreground">{item.name}</span>
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">{formatUsd(item.value)}</div>
            </div>
            <div className="text-sm font-semibold text-foreground">{item.pct.toFixed(2)}%</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function buildPieData(
  items: Array<{ name: string; value: number }>,
  topN: number,
  colors = DEFAULT_COLORS
): PieDatum[] {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  const sorted = [...items].filter((item) => item.value > 0).sort((left, right) => right.value - left.value);
  const top = sorted.slice(0, topN);
  const others = sorted.slice(topN).reduce((sum, item) => sum + item.value, 0);
  const merged = others > 0 ? [...top, { name: "Others", value: others }] : top;

  return merged.map((item, index) => ({
    ...item,
    pct: total > 0 ? (item.value / total) * 100 : 0,
    color: colors[index % colors.length]
  }));
}

type TooltipProps = {
  active?: boolean;
  payload?: Array<{
    payload: PieDatum;
  }>;
  metricLabel: string;
};

function ShareTooltip({ active, payload, metricLabel }: TooltipProps) {
  if (!active || !payload?.length) return null;

  const item = payload[0].payload;

  return (
    <div className="rounded-md border border-border bg-[#101821] px-3 py-2 text-sm text-foreground shadow-xl">
      <div className="flex items-center gap-2 font-medium">
        <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: item.color }} />
        {item.name}
      </div>
      <div className="mt-1 text-muted-foreground">
        {metricLabel}: <span className="text-foreground">{formatUsd(item.value)}</span>
      </div>
      <div className="text-muted-foreground">
        占比: <span className="text-foreground">{item.pct.toFixed(2)}%</span>
      </div>
    </div>
  );
}

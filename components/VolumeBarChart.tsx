"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Protocol } from "@/lib/types";
import { formatUsd } from "@/lib/format";

type Props = {
  protocols: Protocol[];
};

export function VolumeBarChart({ protocols }: Props) {
  const data = protocols.map((protocol) => ({
    name: protocol.name,
    value: protocol.volume24h
  }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data}>
        <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
        <XAxis dataKey="name" tickLine={false} axisLine={false} />
        <YAxis tickFormatter={(value) => formatUsd(Number(value))} tickLine={false} axisLine={false} />
        <Tooltip
          cursor={{ fill: "rgba(255,255,255,0.04)" }}
          formatter={(value) => [formatUsd(Number(value)), "Volume 24h"]}
          contentStyle={{ background: "#111820", border: "1px solid #26323d", borderRadius: 8, color: "#eaf2f8" }}
          labelStyle={{ color: "#eaf2f8" }}
          itemStyle={{ color: "#eaf2f8" }}
        />
        <Bar dataKey="value" fill="#4ab0ff" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

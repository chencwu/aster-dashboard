import { buildPieData, PieShareChart } from "@/components/PieShareChart";

type Item = {
  name?: string;
  symbol?: string;
  volume24h: number;
};

type Props = {
  items: Item[];
  topN?: number;
};

export function VolumePieChart({ items, topN = 15 }: Props) {
  const data = buildPieData(
    items.map((item) => ({
      name: item.symbol ?? item.name ?? "Unknown",
      value: item.volume24h
    })),
    topN
  );

  return <PieShareChart data={data} metricLabel="Volume 24h" />;
}

import { buildPieData, PieShareChart } from "@/components/PieShareChart";

type Item = {
  name?: string;
  symbol?: string;
  oi: number;
};

type Props = {
  items: Item[];
  topN?: number;
};

export function OiPieChart({ items, topN = 15 }: Props) {
  const data = buildPieData(
    items.map((item) => ({
      name: item.symbol ?? item.name ?? "Unknown",
      value: item.oi
    })),
    topN
  );

  return <PieShareChart data={data} metricLabel="OI" />;
}

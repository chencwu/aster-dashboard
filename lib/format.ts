import numeral from "numeral";

export function formatUsd(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "待采集";
  if (Math.abs(value) >= 1_000_000_000) return `$${numeral(value / 1_000_000_000).format("0,0.00")}B`;
  if (Math.abs(value) >= 1_000_000) return `$${numeral(value / 1_000_000).format("0,0.00")}M`;
  if (Math.abs(value) >= 1_000) return `$${numeral(value / 1_000).format("0,0.00")}K`;
  return `$${numeral(value).format("0,0.00")}`;
}

export function formatNumber(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "待采集";
  return numeral(value).format("0,0.[00]");
}

export function formatCompactNumber(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "待采集";
  if (Math.abs(value) >= 1_000_000_000) return `${numeral(value / 1_000_000_000).format("0,0.00")}B`;
  if (Math.abs(value) >= 1_000_000) return `${numeral(value / 1_000_000).format("0,0.00")}M`;
  if (Math.abs(value) >= 1_000) return `${numeral(value / 1_000).format("0,0.00")}K`;
  return numeral(value).format("0,0.[00]");
}

export function formatPct(value: number | null | undefined, decimals = 2) {
  if (value == null || !Number.isFinite(value)) return "待采集";
  const formatted = numeral(value).format(`0,0.${"0".repeat(decimals)}`);
  return `${value > 0 ? "+" : ""}${formatted}%`;
}

export function formatFunding(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "待采集";
  return `${value > 0 ? "+" : ""}${numeral(value * 100).format("0,0.0000")}%`;
}

export function deltaTone(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "text-muted-foreground";
  if (value > 0) return "text-emerald-300";
  if (value < 0) return "text-rose-300";
  return "text-muted-foreground";
}

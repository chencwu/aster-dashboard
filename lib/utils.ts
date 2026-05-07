import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function toNumber(value: unknown, fallback = 0): number {
  const next =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;

  return Number.isFinite(next) ? next : fallback;
}

export function pctChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) {
    return null;
  }

  return ((current - previous) / Math.abs(previous)) * 100;
}

export function sum(values: number[]) {
  return values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);
}

export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker())
  );

  return results;
}

export function intervalToMs(interval: "1m" | "5m" | "15m" | "30m" | "1h" | "4h" | "8h" | "1d") {
  if (interval === "1m") return 60 * 1000;
  if (interval === "5m") return 5 * 60 * 1000;
  if (interval === "15m") return 15 * 60 * 1000;
  if (interval === "30m") return 30 * 60 * 1000;
  if (interval === "4h") return 4 * 60 * 60 * 1000;
  if (interval === "8h") return 8 * 60 * 60 * 1000;
  if (interval === "1d") return 24 * 60 * 60 * 1000;
  return 60 * 60 * 1000;
}

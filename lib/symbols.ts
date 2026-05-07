import type { ProtocolSlug } from "@/lib/types";

const QUOTE_SUFFIXES = ["USDT", "USDC", "USD"];

export function normalizeAsterSymbol(rawSymbol: string) {
  const symbol = rawSymbol.toUpperCase();
  const suffix = QUOTE_SUFFIXES.find((quote) => symbol.endsWith(quote));
  return suffix ? symbol.slice(0, -suffix.length) : symbol;
}

export function normalizeHyperliquidSymbol(rawSymbol: string) {
  return rawSymbol.trim();
}

export function normalizeSymbol(protocol: ProtocolSlug, rawSymbol: string) {
  return protocol === "aster"
    ? normalizeAsterSymbol(rawSymbol)
    : normalizeHyperliquidSymbol(rawSymbol);
}

export function toAsterRawSymbol(symbol: string) {
  const normalized = symbol.trim().toUpperCase();
  return normalized.endsWith("USDT") ? normalized : `${normalized}USDT`;
}

export function toHyperliquidRawSymbol(symbol: string) {
  return symbol.trim();
}

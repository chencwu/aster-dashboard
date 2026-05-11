import type { ProtocolSlug } from "@/lib/types";

const QUOTE_SUFFIXES = ["USDT", "USDC", "USD"];

type KPrefixAlias = {
  base: string;
  hyperliquid: string;
  aster: string;
  binance: string;
};

const K_PREFIX_ALIASES: KPrefixAlias[] = [
  { base: "BONK", hyperliquid: "kBONK", aster: "1000BONK", binance: "1000BONK" },
  { base: "FLOKI", hyperliquid: "kFLOKI", aster: "1000FLOKI", binance: "1000FLOKI" },
  { base: "LUNC", hyperliquid: "kLUNC", aster: "1000LUNC", binance: "1000LUNC" },
  { base: "NEIRO", hyperliquid: "kNEIRO", aster: "NEIRO", binance: "1000NEIRO" },
  { base: "PEPE", hyperliquid: "kPEPE", aster: "1000PEPE", binance: "1000PEPE" },
  { base: "SHIB", hyperliquid: "kSHIB", aster: "1000SHIB", binance: "1000SHIB" }
];

function stripQuoteSuffix(symbol: string) {
  const upper = symbol.trim().toUpperCase();
  const suffix = QUOTE_SUFFIXES.find((quote) => upper.endsWith(quote));
  return suffix ? upper.slice(0, -suffix.length) : upper;
}

function findKPrefixAlias(symbol: string) {
  const normalized = stripQuoteSuffix(symbol);

  return K_PREFIX_ALIASES.find((alias) =>
    [
      alias.base,
      alias.hyperliquid.toUpperCase(),
      alias.aster,
      alias.binance
    ].includes(normalized)
  );
}

export function normalizeAsterSymbol(rawSymbol: string) {
  return stripQuoteSuffix(rawSymbol);
}

export function normalizeHyperliquidSymbol(rawSymbol: string) {
  return rawSymbol.trim();
}

export function normalizeSymbol(protocol: ProtocolSlug, rawSymbol: string) {
  return protocol === "aster"
    ? normalizeAsterSymbol(rawSymbol)
    : normalizeHyperliquidSymbol(rawSymbol);
}

export function normalizeTrackerSymbol(symbol: string) {
  const alias = findKPrefixAlias(symbol);
  if (alias && stripQuoteSuffix(symbol) === alias.hyperliquid.toUpperCase()) {
    return alias.hyperliquid;
  }

  return stripQuoteSuffix(symbol);
}

export function toProtocolLookupSymbol(protocol: ProtocolSlug, symbol: string) {
  const alias = findKPrefixAlias(symbol);
  if (!alias) return protocol === "aster" ? normalizeAsterSymbol(symbol) : symbol.trim();

  return protocol === "aster" ? alias.aster : alias.hyperliquid;
}

export function symbolLookupAliases(symbol: string) {
  const alias = findKPrefixAlias(symbol);
  const normalized = normalizeTrackerSymbol(symbol);

  if (!alias) return [normalized];

  return Array.from(new Set([alias.hyperliquid, alias.aster, alias.binance, alias.base]));
}

export function toAsterRawSymbol(symbol: string) {
  const alias = findKPrefixAlias(symbol);
  const normalized = alias?.aster ?? normalizeAsterSymbol(symbol);
  return normalized.endsWith("USDT") ? normalized : `${normalized}USDT`;
}

export function toBinanceRawSymbol(symbol: string) {
  const alias = findKPrefixAlias(symbol);
  const normalized = alias?.binance ?? normalizeAsterSymbol(symbol);
  return normalized.endsWith("USDT") ? normalized : `${normalized}USDT`;
}

export function toHyperliquidRawSymbol(symbol: string) {
  const alias = findKPrefixAlias(symbol);
  return alias?.hyperliquid ?? symbol.trim();
}

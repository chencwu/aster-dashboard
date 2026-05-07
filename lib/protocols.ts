import type { ProtocolSlug } from "@/lib/types";

export const PROTOCOLS: Record<
  ProtocolSlug,
  { slug: ProtocolSlug; name: string; logo: string; url: string; color: string }
> = {
  aster: {
    slug: "aster",
    name: "Aster",
    logo: "A",
    url: "https://www.asterdex.com",
    color: "#1bdfa0"
  },
  hyperliquid: {
    slug: "hyperliquid",
    name: "Hyperliquid",
    logo: "H",
    url: "https://hyperliquid.xyz",
    color: "#4ab0ff"
  }
};

export function isProtocolSlug(value: string): value is ProtocolSlug {
  return value === "aster" || value === "hyperliquid";
}

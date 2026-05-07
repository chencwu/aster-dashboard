import { ExternalLink } from "lucide-react";
import { Sparkline } from "@/components/Sparkline";
import { Badge } from "@/components/ui/badge";
import type { Protocol } from "@/lib/types";
import { deltaTone, formatPct, formatUsd } from "@/lib/format";

type Props = {
  protocols: Protocol[];
};

function badgeTone(value: number | null) {
  if (value == null) return "neutral";
  return value >= 0 ? "positive" : "negative";
}

export function ProtocolTable({ protocols }: Props) {
  const rows = [...protocols].sort((left, right) => right.oi - left.oi);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[920px] text-left text-sm">
        <thead className="border-b text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">#</th>
            <th className="px-4 py-3 font-medium">Protocol</th>
            <th className="px-4 py-3 font-medium">OI</th>
            <th className="px-4 py-3 font-medium">OI (7D)</th>
            <th className="px-4 py-3 font-medium">OI 24h Δ</th>
            <th className="px-4 py-3 font-medium">Volume (24h)</th>
            <th className="px-4 py-3 font-medium">Vol (7D)</th>
            <th className="px-4 py-3 font-medium">Vol 24h Δ</th>
            <th className="px-4 py-3 font-medium">上线币种数</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((protocol, index) => (
            <tr key={protocol.slug} className="border-b border-border/70 last:border-0">
              <td className="px-4 py-4 text-muted-foreground">{index + 1}</td>
              <td className="px-4 py-4">
                <a
                  className="inline-flex items-center gap-3 text-foreground hover:text-primary"
                  href={protocol.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-md border bg-muted text-xs font-semibold">
                    {protocol.logo}
                  </span>
                  <span>{protocol.name}</span>
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </td>
              <td className="px-4 py-4 font-medium">{formatUsd(protocol.oi)}</td>
              <td className="px-4 py-4">
                <Sparkline values={protocol.oi7d} />
              </td>
              <td className={`px-4 py-4 ${deltaTone(protocol.oiDelta24hPct)}`}>
                <Badge tone={badgeTone(protocol.oiDelta24hPct)}>
                  {formatPct(protocol.oiDelta24hPct)}
                </Badge>
              </td>
              <td className="px-4 py-4 font-medium">{formatUsd(protocol.volume24h)}</td>
              <td className="px-4 py-4">
                <Sparkline values={protocol.volume7d} color="#4ab0ff" />
              </td>
              <td className={`px-4 py-4 ${deltaTone(protocol.volumeDelta24hPct)}`}>
                <Badge tone={badgeTone(protocol.volumeDelta24hPct)}>
                  {formatPct(protocol.volumeDelta24hPct)}
                </Badge>
              </td>
              <td className="px-4 py-4">{protocol.symbolCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

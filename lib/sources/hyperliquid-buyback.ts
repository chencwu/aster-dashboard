import { toNumber } from "@/lib/utils";

const HYPERLIQUID_INFO_URL = "https://api.hyperliquid.xyz/info";

export const ASSISTANCE_FUND_ADDRESS = "0xfefefefefefefefefefefefefefefefefefefefe";
export const HYPE_SPOT_COIN = "@107";

export type AssistanceFundFill = {
  tid: string;
  hash: string;
  ts: number;
  px: number;
  sz: number;
  startPosition: number;
};

export type AssistanceFundBalance = {
  hypeBalance: number;
  entryNotional: number;
  fetchedAt: number;
};

type HyperliquidFillRaw = {
  coin: string;
  px: string;
  sz: string;
  side: string;
  time: number;
  startPosition: string;
  dir: string;
  hash: string;
  tid: number | string;
  feeToken?: string;
};

type HyperliquidSpotState = {
  balances: Array<{
    coin: string;
    total: string;
    entryNtl: string;
  }>;
};

async function postInfo<T>(body: object): Promise<T> {
  const response = await fetch(HYPERLIQUID_INFO_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Hyperliquid API failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function fetchAssistanceFundBalance(): Promise<AssistanceFundBalance> {
  const state = await postInfo<HyperliquidSpotState>({
    type: "spotClearinghouseState",
    user: ASSISTANCE_FUND_ADDRESS
  });

  const hype = state.balances.find((entry) => entry.coin === "HYPE");

  return {
    hypeBalance: hype ? toNumber(hype.total) : 0,
    entryNotional: hype ? toNumber(hype.entryNtl) : 0,
    fetchedAt: Date.now()
  };
}

const MAX_PAGE_SIZE = 2000;

export async function fetchAssistanceFundBuybackFills(
  startTime: number,
  endTime: number = Date.now()
): Promise<AssistanceFundFill[]> {
  const collected: AssistanceFundFill[] = [];
  const seen = new Set<string>();
  let cursor = startTime;

  for (let page = 0; page < 50; page += 1) {
    const raw = await postInfo<HyperliquidFillRaw[]>({
      type: "userFillsByTime",
      user: ASSISTANCE_FUND_ADDRESS,
      startTime: cursor,
      endTime,
      aggregateByTime: true
    });

    if (!Array.isArray(raw) || raw.length === 0) break;

    let added = 0;
    let lastTime = cursor;

    for (const row of raw) {
      if (row.coin !== HYPE_SPOT_COIN) continue;
      if (row.dir !== "Buy") continue;

      const tid = String(row.tid);
      if (seen.has(tid)) continue;
      seen.add(tid);

      const ts = toNumber(row.time);
      const fill: AssistanceFundFill = {
        tid,
        hash: row.hash,
        ts,
        px: toNumber(row.px),
        sz: toNumber(row.sz),
        startPosition: toNumber(row.startPosition)
      };

      if (fill.sz <= 0 || !Number.isFinite(fill.px)) continue;

      collected.push(fill);
      added += 1;
      if (ts > lastTime) lastTime = ts;
    }

    if (raw.length < MAX_PAGE_SIZE) break;
    if (lastTime <= cursor) break;
    cursor = lastTime + 1;
    if (cursor >= endTime) break;
    if (added === 0) break;
  }

  collected.sort((a, b) => a.ts - b.ts);
  return collected;
}

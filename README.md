# Perp DEX Dashboard — Aster & Hyperliquid

聚焦 **Aster** 和 **Hyperliquid** 两家 Perp DEX 的 **加密货币持仓量(OI) 与 成交量(Volume) 监控**，提供平台总览 + 单币种细分 + 历史走势追踪。

---

## 一、项目目标

构建一个中文 Dashboard，实时聚合并**长期记录** Aster / Hyperliquid 上每个加密货币的 OI 和 Volume，方便观察资金流向、堆仓异动、跨平台偏好差异。

> 本项目**只关注 OI 与 Volume**，不做 TVL、Revenue、协议收入等指标。

## 二、功能范围

### 1. 顶部总览卡

| 指标 | 说明 |
|---|---|
| Total OI | 两平台未平仓合约总价值（USD） |
| Total Volume (24h) | 两平台 24h 总成交额（USD） |
| Protocols | 固定显示 `2` |

### 2. 平台对比区

- **OI 柱状图**：Aster vs Hyperliquid 当前 OI 对比
- **Volume 柱状图**：Aster vs Hyperliquid 24h 成交额对比
- **OI 占比饼图**：两家 OI 份额
- **Volume 占比饼图**：两家成交额份额

### 3. Hyperliquid 回购 (Assistance Fund)

参考 hypeburn.fun 的展示方式，追踪 AF 钱包 `0xfefefefefefefefefefefefefefefefefefefefe` 在 HYPE/USDC 现货市场的买回活动：

| 模块 | 说明 |
|---|---|
| 累计 HYPE 回购 KPI | 自首次入库以来 AF 累计买入的 HYPE 总量，含 24h 增量与加权均价 |
| 累计 USDC 花费 KPI | 累计买回成本（`Σ px × sz`），含 24h 增量 |
| AF 当前 HYPE 余额 KPI | 实时 `spotClearinghouseState` 抓取的 HYPE 余额 + 成本基础（entry notional） |
| 每日 HYPE 买回量柱状图 | 近 30 天每日成交量（HYPE） |
| 每日 USDC 花费柱状图 | 近 30 天每日买回成本（USD） |
| AF 余额累计曲线 | 每日 EOD 抓取的 AF HYPE 持仓走势，体现长期累积 |

> 数据来自 Hyperliquid 自家 `info` 端点，**无第三方依赖**，每 1 小时增量入库一次。

### 4. 平台明细表

| 列 | 内容 |
|---|---|
| # | 排名 |
| Protocol | Logo + 名称 + 跳转链接 |
| OI | 当前值 |
| OI (7D) | 7 日 sparkline |
| OI 24h Δ | 24 小时变化 % |
| Volume (24h) | 当前值 |
| Vol (7D) | 7 日 sparkline |
| Vol 24h Δ | 24 小时变化 % |
| 上线币种数 | 当前合约数 |

### 5. 加密货币细分（核心）

针对 Aster / Hyperliquid 各自上线的所有合约币种：

#### 5.1 单币种排行表（Tab 切换平台）

| 列 | 说明 |
|---|---|
| # | 排名 |
| Symbol | 如 BTC、ETH、SOL |
| Mark Price | 最新标记价 |
| 24h Change % | 价格 24h 涨跌 |
| OI | 该币种 USD OI |
| OI 1h Δ / 24h Δ / 7d Δ | OI 三档变化 |
| Volume (24h) | 该币种 24h 成交额 |
| Vol 24h Δ / 7d Δ | Volume 两档变化 |
| Funding Rate | 当前资金费率 |
| OI/Vol Ratio | 持仓/成交比 |

支持列头排序、关键字搜索；OI 24h Δ > +50% 或 < -30% 整行高亮。

#### 5.2 单平台全币种占比

- 单平台所有上线币种的 OI 占比饼图（前 N 名独立显示，其余合并为 Others，N 默认 15）
- 同样的 Volume 占比饼图

#### 5.3 跨平台单币种对比

选定一个 Symbol（如 BTC），并排展示 Aster vs Hyperliquid：
- 当前 OI / Volume / Funding / Mark Price 差值
- **OI 历史曲线**（多时间档 1H / 12H / 1D / 3D / 7D）
- **Volume 历史曲线**（同上）

#### 5.4 OI / Volume 增长追踪（核心）

| 视图 | 内容 |
|---|---|
| OI 历史曲线 | 每个币种支持 1H / 12H / 1D / 3D / 7D 多时间档 OI 走势 |
| Volume 历史曲线 | 每个币种相同时间档 Volume 走势 |
| OI Δ 排行榜 | 按 1h / 4h / 8h / 12h / 24h 五档 OI 增长率或增加量 U 倒序，找出"正在被堆仓"的币种 |
| Volume Δ 排行榜 | 按 1h / 4h / 8h / 12h / 24h 五档 Volume 增长率或增加量 U 倒序，找出"突然爆量"的币种 |
| 异动提示 | OI 24h Δ > +50% 或 < -30%、Volume 24h Δ > +200% 时高亮 |

### 6. 不做的功能（已确认排除）

- 多语言（仅中文）
- X Social Heat
- TVL、Revenue、协议收入相关指标
- DefiLlama / 第三方聚合源依赖
- Tools 子页

---

## 三、数据源（实测确认）

| 数据 | 来源 | 备注 |
|---|---|---|
| Hyperliquid 单币种 OI(BASE) / Volume(USD) / Funding / Mark Price | `POST https://api.hyperliquid.xyz/info` body `{"type":"metaAndAssetCtxs"}` | 公开免费；`openInterest × markPx` = USD OI；`dayNtlVlm` 直接是 USD 24h 成交额 |
| Hyperliquid 单币种 K 线（用于 Volume 历史） | `POST .../info` body `{"type":"candleSnapshot","req":{"coin":"BTC","interval":"1h","startTime":...,"endTime":...}}` | K 线包含 `v`（base volume），需 × 收盘价转 USD |
| Aster 全市场 ticker（价格、24h Volume、24h 涨跌） | `GET https://fapi.asterdex.com/fapi/v1/ticker/24hr` | `quoteVolume` 直接是 USD |
| Aster 单币种实时 OI(BASE) | `GET https://fapi.asterdex.com/fapi/v1/openInterest?symbol=BTCUSDT` | × markPrice 得 USD |
| Aster Mark Price + Funding Rate | `GET .../fapi/v1/premiumIndex` | 全市场或按 symbol |
| Aster 单币种 K 线（用于 Volume 历史） | `GET .../fapi/v1/klines?symbol=BTCUSDT&interval=1h&limit=...` | 第 8 字段 `quoteAssetVolume` 直接是 USD |
| **OI 历史（两家）** | **本地 Postgres 落库**，每 5 分钟 Cron 写入快照 | API 都不返回历史 OI |
| Hyperliquid AF 买回成交 | `POST .../info` body `{"type":"userFillsByTime","user":"0xfefe…fefe","aggregateByTime":true}` | 过滤 `coin === "@107" && dir === "Buy"`，按 `tid` 去重，每 1 小时增量入库 |
| Hyperliquid AF HYPE 余额 | `POST .../info` body `{"type":"spotClearinghouseState","user":"0xfefe…fefe"}` | 取 `balances[].coin === "HYPE"` 的 `total` 与 `entryNtl`，每 1 小时快照入库 |

> 所有外部接口走 Next.js API Route 代理 + 60s ~ 5min 缓存，避免限流。
> **本项目不依赖 DefiLlama 或任何第三方聚合接口。**

### Volume 历史 vs OI 历史的处理差异

| | Volume | OI |
|---|---|---|
| 单币种历史曲线 | K-line API 直接查询，可任意回溯 | Cron + Postgres 自采 |
| 平台 7D / Δ 排行 | 优先用 Cron 落库的 `volume24h_usd` 快照，避免全市场逐币种拉 K 线 | Cron + Postgres 自采 |
| 是否能回填历史 | 单币种 Volume ✅；平台快照序列 ❌ | ❌（API 不提供） |
| 7D 曲线启动 | 单币种 Volume 立即可用；平台快照需累积 | 需自然累积 7 天 |

---

## 四、技术栈

| 层 | 选型 |
|---|---|
| 框架 | Next.js 14 (App Router) + TypeScript |
| 样式 | Tailwind CSS + shadcn/ui（暗色主题） |
| 图表 | Recharts |
| 数据请求 | TanStack Query（轮询 + 缓存） |
| 数字格式化 | numeral.js |
| OI 历史与读模型存储 | Vercel Postgres (Neon) |
| 定时任务 | Vercel Cron / OS crontab：每 5 分钟写 OI 快照 + 预计算 payload；每 1 小时拉 AF 买回 fills + 余额快照（**自部署必须配 OS crontab，详见 DEPLOYMENT.md**） |
| 部署 | Vercel |

---

## 五、刷新策略

| 数据 | 刷新间隔 |
|---|---|
| 前端读取预计算 payload | 60 秒轮询，后端计算不依赖前端请求 |
| OI 快照写库 + stats/protocols/markets/delta 预计算（Cron） | 5 分钟 |
| OI 快照读查询防 stale | `oi_snapshots` helper SELECT 每 60 秒刷新 SQL marker，避免长期运行进程复用凝固的 prepared/result |
| 单币种 Volume 历史 K 线 | 5 分钟（按需查询，TanStack Query 缓存） |
| 平台 Volume 走势 / Δ 排行 | 5 分钟（优先使用 Cron 快照） |
| Hyperliquid 回购数据写库 | 1 小时（增量抓 AF fills + 余额） |
| 总览页回购模块前端轮询 | 5 分钟 |

---

### 调试端点

| 路径 | 用途 |
|---|---|
| `/api/oi-debug?protocol=hyperliquid&symbol=DYDX` | 同时跑 `MAX(ts)` 整表、`literal24h/72h`、`param24h/72h`（参数化）、`make_interval24h`、`cast24h`，对比各 SQL 形式拿到的 max_ts 是否一致；外加 `pg_now`、`tz`、最新 3 行原始数据。**用于排查"前端拿到陈旧 lastPoint，但表里实际有新行"这类 prepared-plan 缓存类问题**。正常结果应与历史接口 lastPoint 接近；若库里有新行但业务接口旧，优先检查 helper 是否套了 `freshReadMarker()`。 |

---

## 六、目录结构

```
app/
├─ layout.tsx              顶部导航
├─ page.tsx                Dashboard 主页（总览 + 平台对比 + 明细表）
├─ markets/
│  └─ page.tsx             单币种细分页（Tab + 全币种饼图 + 跨平台对比）
├─ tracker/
│  └─ page.tsx             OI/Volume 增长追踪页（异动榜 + 历史曲线）
└─ api/
   ├─ stats/route.ts                       两平台总指标聚合
   ├─ protocols/route.ts                   平台明细 + 7D 序列
   ├─ markets/[protocol]/route.ts          单平台所有币种快照
   ├─ compare/[symbol]/route.ts            跨平台单币种对比
   ├─ history/oi/[protocol]/[symbol]/route.ts        单币种 OI 历史（查 Postgres）
   ├─ history/volume/[protocol]/[symbol]/route.ts    单币种 Volume 历史（查 K-line）
   ├─ delta/oi/route.ts                    OI Δ 排行（1h/4h/8h/12h/24h）
   ├─ delta/volume/route.ts                Volume Δ 排行
   ├─ buyback/hyperliquid/route.ts         AF 回购 KPI / 日序列 / 余额序列
   ├─ oi-debug/route.ts                    OI Postgres 调试端点（参数化 vs 字面量 vs make_interval 多种 SQL 形式对比，用于排查 plan-cache 类问题）
   ├─ cron/snapshot-oi/route.ts            每 5min 写 OI 快照并生成预计算 payload
   └─ cron/snapshot-buyback/route.ts       每 1h 增量抓 AF fills + HYPE 余额快照

components/
├─ StatCard.tsx
├─ OiBarChart.tsx
├─ VolumeBarChart.tsx
├─ OiPieChart.tsx               全币种 OI 占比（前 N + Others）
├─ VolumePieChart.tsx           全币种 Volume 占比
├─ ProtocolTable.tsx
├─ MarketsTable.tsx             单币种排行表（含 OI/Vol Δ 列、异动高亮）
├─ SymbolCompare.tsx            跨平台对比
├─ HistoryChart.tsx             OI 或 Volume 历史曲线（多时间档切换、可叠加双 metric）
├─ DeltaLeaderboard.tsx         OI/Volume 增长榜（共用组件）
├─ BuybackSection.tsx           总览页回购模块（KPI + 三张图，自管查询）
├─ BuybackCharts.tsx            日 HYPE 柱、日 USDC 柱、AF 余额面积图
├─ Sparkline.tsx
└─ ui/                          shadcn 组件

lib/
├─ sources/
│  ├─ hyperliquid.ts            实时取数 + K 线（Volume 历史）
│  ├─ hyperliquid-buyback.ts    AF fills（userFillsByTime）+ AF 余额（spotClearinghouseState）
│  └─ aster.ts                  实时取数 + K 线（Volume 历史）
├─ db/
│  ├─ schema.sql                oi_snapshots + precomputed_payloads + hl_buyback_* 表
│  ├─ oi-history.ts             查询历史 OI、计算 Δ
│  └─ buyback.ts                AF fills 入库去重 + 日聚合 / 余额序列查询
├─ symbols.ts                   币种归一化（BTCUSDT ↔ BTC）
├─ format.ts
└─ types.ts
```

---

## 七、核心数据模型

```ts
type Protocol = {
  slug: 'aster' | 'hyperliquid';
  name: string;
  logo: string;
  url: string;
  oi: number;                  // USD
  oi7d: number[];              // 7D 序列（来自 Postgres 聚合）
  oiDelta24hPct: number;
  volume24h: number;           // USD
  volume7d: number[];          // 来自 Postgres 的 24h Volume 快照聚合
  volumeDelta24hPct: number;
  symbolCount: number;
};

type Market = {
  protocol: 'aster' | 'hyperliquid';
  symbol: string;              // 归一化后的 base symbol：BTC、ETH、kPEPE...
  rawSymbol: string;           // 原始 symbol：BTCUSDT or BTC
  markPrice: number;
  change24hPct: number;
  oi: number;                  // USD
  oiDelta1hPct: number | null; // null = 数据未累积足够
  oiDelta4hPct: number | null;
  oiDelta8hPct: number | null;
  oiDelta12hPct: number | null;
  oiDelta24hPct: number | null;
  oiDelta7dPct: number | null;
  oiDelta1hUsd: number | null;
  oiDelta4hUsd: number | null;
  oiDelta8hUsd: number | null;
  oiDelta12hUsd: number | null;
  oiDelta24hUsd: number | null;
  oiDelta7dUsd: number | null;
  volume24h: number;           // USD
  volumeDelta1hPct: number;
  volumeDelta4hPct: number;
  volumeDelta8hPct: number;
  volumeDelta12hPct: number;
  volumeDelta24hPct: number;
  volumeDelta7dPct: number;
  volumeDelta1hUsd: number | null;
  volumeDelta4hUsd: number | null;
  volumeDelta8hUsd: number | null;
  volumeDelta12hUsd: number | null;
  volumeDelta24hUsd: number | null;
  volumeDelta7dUsd: number | null;
  fundingRate: number;
};

type HistoryPoint = { ts: number; value: number };
type HistorySeries = {
  protocol: 'aster' | 'hyperliquid';
  symbol: string;
  metric: 'oi' | 'volume';
  period: '1h' | '4h' | '1d';
  points: HistoryPoint[];
};

type SymbolCompare = {
  symbol: string;
  aster: Market | null;
  hyperliquid: Market | null;
};

type DashboardStats = {
  totalOi: number;
  totalVolume24h: number;
  protocolCount: 2;
};
```

### Postgres 表结构

```sql
CREATE TABLE oi_snapshots (
  protocol TEXT NOT NULL,           -- 'aster' | 'hyperliquid'
  symbol   TEXT NOT NULL,           -- 归一化后的 base symbol
  ts       TIMESTAMPTZ NOT NULL,
  oi_usd   NUMERIC NOT NULL,
  PRIMARY KEY (protocol, symbol, ts)
);
CREATE INDEX idx_oi_snapshots_lookup ON oi_snapshots (protocol, symbol, ts DESC);

CREATE TABLE precomputed_payloads (
  key TEXT PRIMARY KEY,              -- stats / protocols / markets:aster / delta:oi:12h:pct / delta:oi:24h:amount 等
  generated_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL             -- 前端 API 直接返回的 JSON payload
);

-- Hyperliquid Assistance Fund 回购原始 fills（按 tid 去重）
CREATE TABLE hl_buyback_fills (
  tid            TEXT PRIMARY KEY,
  hash           TEXT NOT NULL,
  ts             TIMESTAMPTZ NOT NULL,
  px             NUMERIC NOT NULL,   -- 成交价（USDC）
  sz             NUMERIC NOT NULL,   -- 成交量（HYPE）
  start_position NUMERIC             -- 成交前 AF 的 HYPE 持仓
);
CREATE INDEX idx_hl_buyback_fills_ts ON hl_buyback_fills (ts DESC);

-- AF HYPE 余额快照（每次 cron 写一行）
CREATE TABLE hl_buyback_balance_snapshots (
  ts             TIMESTAMPTZ PRIMARY KEY,
  hype_balance   NUMERIC NOT NULL,
  entry_notional NUMERIC NOT NULL    -- AF 累计买回成本（USDC）
);
CREATE INDEX idx_hl_buyback_balance_ts ON hl_buyback_balance_snapshots (ts DESC);
```

每 5min 一次写入原始快照，随后生成预计算 payload。前端接口优先读取 `precomputed_payloads`，没有预计算结果时才临时走旧计算兜底。

---

## 八、实施步骤

1. **Scaffold** — `create-next-app` + Tailwind + shadcn 初始化暗色主题
2. **Mock UI** — 静态数据跑通首页布局、图表、表格
3. **接 Hyperliquid** — `metaAndAssetCtxs` 拿全部币种实时 OI/Volume/Funding/Price
4. **接 Aster** — `ticker/24hr` + `openInterest` + `premiumIndex` 拼装 Market
5. **聚合校验** — 单币种加总应≈平台总值，与官方 API 比对
6. **Markets 子页** — Tab 切换、排序、搜索、全币种饼图、跨平台对比
7. **Volume 历史** — 接两家 K-line，前端图表组件就绪
8. **OI 历史存储**：
   - 建 Vercel Postgres，跑 `schema.sql`
   - 写 `/api/cron/snapshot-oi/route.ts`，同一次任务并发抓两家
   - `vercel.json` 配置 `*/5 * * * *` cron
9. **预计算读模型** — Cron 写完快照后计算 stats/protocols/markets/delta，delta 同时预计算百分比与增加量 U，并写入 `precomputed_payloads`
10. **Tracker 子页** — OI/Volume 异动榜 + 历史曲线 + 表格 Δ 列（Δ 优先读预计算 payload）
11. **轮询 + 错误态 + Loading 骨架屏**
12. **Hyperliquid 回购模块**：
    - 新增 `hl_buyback_fills` / `hl_buyback_balance_snapshots` 两张表
    - `lib/sources/hyperliquid-buyback.ts` 封装 `userFillsByTime` 分页拉取（首跑回拉 30 天，后续按 `MAX(ts)+1ms` 增量）+ `spotClearinghouseState` 余额抓取
    - `/api/cron/snapshot-buyback` 每 1 小时写库；`/api/buyback/hyperliquid` 返回 KPI、24h/7d 窗口、日序列、余额序列
    - 总览页 `BuybackSection` 渲染 3 个 KPI 卡 + 日 HYPE 柱 + 日 USDC 柱 + AF 余额面积图
13. **Vercel 部署**

> OI 历史**无法回填**，部署后前 7 天 OI 7D 曲线/Δ 会逐日补全，前端用 `null` 加"已采集 N 小时"提示降级显示。

---

## 九、实测结论与字段约定

| 项 | 状态 |
|---|---|
| Hyperliquid `metaAndAssetCtxs` | ✅ 230 perps，含 `openInterest`(BASE) / `dayNtlVlm`(USD) / `funding` / `markPx` / `prevDayPx` |
| Hyperliquid `candleSnapshot` | ✅ 用于 Volume 历史 |
| Aster `ticker/24hr` `openInterest` `premiumIndex` `klines` `exchangeInfo` | ✅ 全部可用 |
| Aster `openInterestHist` | ❌ 404，无此接口（OI 历史走 Cron 落库） |
| Hyperliquid `userFillsByTime` (AF) | ✅ 可拉 AF 钱包历史成交，支持 `aggregateByTime`，单页上限 ~2000 条；通过 `coin === "@107" && dir === "Buy"` 过滤即得回购 fills |
| Hyperliquid `spotClearinghouseState` (AF) | ✅ 可读 AF 当前 HYPE 余额（`total`）+ 累计买回成本（`entryNtl`） |

### 字段处理约定

- **OI 单位换算**：两家 API 返回的 `openInterest` 都是 **BASE 数量**（如 5757 BTC），统一在数据层乘 `markPrice` 转 USD 后再使用 / 入库。
- **Volume 单位**：Aster `quoteVolume`、Hyperliquid `dayNtlVlm` 均已是 USD。K 线 Volume 字段：Aster 第 8 字段 `quoteAssetVolume`（USD），Hyperliquid `v` 是 base volume，需 × 收盘价。
- **数字格式化分工**：`formatUsd`（USD 走 K/M/B）/ `formatCompactNumber`（裸数走 K/M/B，无前缀，用于 HYPE 数量等）/ `formatNumber`（完整千分位 + 小数，tooltip 等需要精度的场景）。三者集中在 `lib/format.ts`，KPI 大字与图表 Y 轴默认用 compact，hover/详情默认用 full。
- **币种归一化**：Aster `BTCUSDT` 去 `USDT` 后缀，Hyperliquid `BTC` 直接用；`kPEPE` / `kSHIB` 等保留原名。归一化逻辑集中在 `lib/symbols.ts`。
- **Delisted 过滤**：Hyperliquid `universe[i].isDelisted=true` 的币种不计入总览与排行榜。
- **OI 历史不可回填**：前端在数据不足时显示 "已采集 N 小时" 而非 "—"，避免误以为接口失败。
- **HYPE 现货 token 编号**：当前为 `@107`（HYPE/USDC），写在 `lib/sources/hyperliquid-buyback.ts` 的 `HYPE_SPOT_COIN` 常量；若 Hyperliquid 调整 spot index 改这一处即可。
- **AF 回购首跑回拉范围**：`/api/cron/snapshot-buyback` 默认回拉 30 天 fills（`DEFAULT_BACKFILL_DAYS = 30`），之后增量；如需更长历史调大该常量并手动触发一次 cron。
- **AF 余额累计曲线启动**：cron 每 1 小时写一行实时 balance snapshot；同时每次跑 cron 会用 `backfillBalanceFromFills()` 从 `hl_buyback_fills` 反推近 30 天每日 EOD 余额（取每天最后一笔 fill 的 `start_position + sz`，按 `ON CONFLICT DO NOTHING` 不覆盖已有真实快照）。所以**首次触发 cron 后 30 天曲线立刻就有数据**。
- **回购数字展示格式**：累计 HYPE / AF 余额这类大数走 `formatCompactNumber`（≥1B→B、≥1M→M、≥1K→K，规则与 `formatUsd` 一致），KPI 大字与图表 Y 轴使用紧凑形式（如 `44.01M HYPE`、`0.10M`），tooltip 仍保留完整精度（如 `44,006,145.05 HYPE`）方便核对。
- **Postgres prepared-plan 缓存陷阱（多次踩坑，统一防线）**：`@vercel/postgres` 在 Neon HTTP 端点上会按 SQL 文本复用 server-side prepared plan/result。表刚建或统计信息陈旧时被 prepare 的 generic plan，**后续 INSERT 不会自动 invalidate**，长期运行的进程（生产 pm2、Vercel）会"凝固"返回旧数据；本地 `next dev` 经常重启所以看不出来。**已踩两次**：(a) buyback helper 在 fresh table 期被 prepare，多 aggregate SELECT 永久返回 0；(b) `getOiHistory` 在生产服务器上对某些 `hours` 值返回的 lastPoint 比 `MAX(ts)` 早几小时（直接 sql 查表能看到最新行）。**统一约定**：1) 写入函数（`insertBuybackFills` / `insertBalanceSnapshot` / `insertOiSnapshots`）末尾跑 `ANALYZE`，强制更新统计 + 触发 plan 重评估；2) 读取 `oi_snapshots` 的业务 helper 必须用 `sql.query` + `freshReadMarker(domain)`，每 60 秒刷新一次 SQL 注释文本（如 `/* oi:get-history:fresh:<bucket> */`），避免业务接口长期复用凝固查询；3) 新加 helper 读写快变 Postgres 表时沿用同一约定，尤其不要只写固定 `/* domain:* */` 注释后长期不变。

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

### 3. 平台明细表

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

### 4. 加密货币细分（核心）

针对 Aster / Hyperliquid 各自上线的所有合约币种：

#### 4.1 单币种排行表（Tab 切换平台）

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

#### 4.2 单平台全币种占比

- 单平台所有上线币种的 OI 占比饼图（前 N 名独立显示，其余合并为 Others，N 默认 15）
- 同样的 Volume 占比饼图

#### 4.3 跨平台单币种对比

选定一个 Symbol（如 BTC），并排展示 Aster vs Hyperliquid：
- 当前 OI / Volume / Funding / Mark Price 差值
- **OI 历史曲线**（多时间档 1H / 4H / 1D / 7D / 30D）
- **Volume 历史曲线**（同上）

#### 4.4 OI / Volume 增长追踪（核心）

| 视图 | 内容 |
|---|---|
| OI 历史曲线 | 每个币种支持 1H / 4H / 1D / 7D / 30D 多时间档 OI 走势 |
| Volume 历史曲线 | 每个币种相同时间档 Volume 走势 |
| OI Δ 排行榜 | 按 1h / 24h / 7d 三档 OI 增长率倒序，找出"正在被堆仓"的币种 |
| Volume Δ 排行榜 | 按 1h / 24h / 7d 三档 Volume 增长率倒序，找出"突然爆量"的币种 |
| 异动提示 | OI 24h Δ > +50% 或 < -30%、Volume 24h Δ > +200% 时高亮 |

### 5. 不做的功能（已确认排除）

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

> 所有外部接口走 Next.js API Route 代理 + 60s ~ 5min 缓存，避免限流。
> **本项目不依赖 DefiLlama 或任何第三方聚合接口。**

### Volume 历史 vs OI 历史的处理差异

| | Volume | OI |
|---|---|---|
| 数据来源 | K-line API 直接查询，可任意回溯 | Cron + Postgres 自采 |
| 是否能回填历史 | ✅ 可以 | ❌ 不能（API 不提供） |
| 7D 曲线启动 | 立即可用 | 需自然累积 7 天 |

---

## 四、技术栈

| 层 | 选型 |
|---|---|
| 框架 | Next.js 14 (App Router) + TypeScript |
| 样式 | Tailwind CSS + shadcn/ui（暗色主题） |
| 图表 | Recharts |
| 数据请求 | TanStack Query（轮询 + 缓存） |
| 数字格式化 | numeral.js |
| OI 历史存储 | Vercel Postgres (Neon) |
| 定时任务 | Vercel Cron（每 5 分钟写一次 OI 快照） |
| 部署 | Vercel |

---

## 五、刷新策略

| 数据 | 刷新间隔 |
|---|---|
| 实时 OI / Volume / Funding / Price（前端轮询） | 60 秒 |
| OI 快照写库（Cron） | 5 分钟 |
| Volume 历史 K 线 | 5 分钟（按需查询，TanStack Query 缓存） |

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
   ├─ delta/oi/route.ts                    OI Δ 排行（1h/24h/7d）
   ├─ delta/volume/route.ts                Volume Δ 排行
   └─ cron/snapshot-oi/route.ts            每 5min 同时为两家写 OI 快照

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
├─ Sparkline.tsx
└─ ui/                          shadcn 组件

lib/
├─ sources/
│  ├─ hyperliquid.ts            实时取数 + K 线（Volume 历史）
│  └─ aster.ts                  实时取数 + K 线（Volume 历史）
├─ db/
│  ├─ schema.sql                oi_snapshots 表
│  └─ oi-history.ts             查询历史 OI、计算 Δ
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
  volume7d: number[];          // 来自 K 线
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
  oiDelta24hPct: number | null;
  oiDelta7dPct: number | null;
  volume24h: number;           // USD
  volumeDelta24hPct: number;
  volumeDelta7dPct: number;
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
```

每 5min 一次写入，单 symbol 一年 ~10.5w 行，两家 200 个 symbol 总量约 4200w 行/年——可控，必要时按月分区。

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
9. **Tracker 子页** — OI/Volume 异动榜 + 历史曲线 + 表格 Δ 列
10. **轮询 + 错误态 + Loading 骨架屏**
11. **Vercel 部署**

> OI 历史**无法回填**，部署后前 7 天 OI 7D 曲线/Δ 会逐日补全，前端用 `null` 加"已采集 N 小时"提示降级显示。

---

## 九、实测结论与字段约定

| 项 | 状态 |
|---|---|
| Hyperliquid `metaAndAssetCtxs` | ✅ 230 perps，含 `openInterest`(BASE) / `dayNtlVlm`(USD) / `funding` / `markPx` / `prevDayPx` |
| Hyperliquid `candleSnapshot` | ✅ 用于 Volume 历史 |
| Aster `ticker/24hr` `openInterest` `premiumIndex` `klines` `exchangeInfo` | ✅ 全部可用 |
| Aster `openInterestHist` | ❌ 404，无此接口（OI 历史走 Cron 落库） |

### 字段处理约定

- **OI 单位换算**：两家 API 返回的 `openInterest` 都是 **BASE 数量**（如 5757 BTC），统一在数据层乘 `markPrice` 转 USD 后再使用 / 入库。
- **Volume 单位**：Aster `quoteVolume`、Hyperliquid `dayNtlVlm` 均已是 USD。K 线 Volume 字段：Aster 第 8 字段 `quoteAssetVolume`（USD），Hyperliquid `v` 是 base volume，需 × 收盘价。
- **币种归一化**：Aster `BTCUSDT` 去 `USDT` 后缀，Hyperliquid `BTC` 直接用；`kPEPE` / `kSHIB` 等保留原名。归一化逻辑集中在 `lib/symbols.ts`。
- **Delisted 过滤**：Hyperliquid `universe[i].isDelisted=true` 的币种不计入总览与排行榜。
- **OI 历史不可回填**：前端在数据不足时显示 "已采集 N 小时" 而非 "—"，避免误以为接口失败。

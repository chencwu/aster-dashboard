# Vercel 部署步骤

## 1. 本地确认

```bash
npm install
npm run typecheck
npm run lint
npm run build
```

## 2. 准备环境变量

本地新建 `.env.local`，不要提交到 Git：

```env
POSTGRES_URL=postgres://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require
CRON_SECRET=replace_with_a_random_string_at_least_16_chars
COINGECKO_API_KEY=optional_free_basic_demo_key_for_coin_profiles
# COINGECKO_PRO_API_KEY=optional_paid_pro_key
```

- `POSTGRES_URL`：Neon / Vercel Marketplace Postgres 的 pooled connection string。
- `CRON_SECRET`：随机字符串，生产环境用来保护 `/api/cron/snapshot-oi`。
- `COINGECKO_API_KEY` / `CG_API_KEY`：CoinGecko 免费 Basic/Demo key，可选但生产服务器建议配置。代码会继续使用 public endpoint，并发送 `x-cg-demo-api-key`。
- `COINGECKO_PRO_API_KEY`：只有付费 Pro key 才填。填了它才会切到 `https://pro-api.coingecko.com/api/v3` 并发送 `x-cg-pro-api-key`。

## 3. 创建 Git 仓库

```bash
git init
git add .
git commit -m "Initial dashboard MVP"
```

把仓库推到 GitHub，然后在 Vercel 导入这个 GitHub repo。

## 4. 在 Vercel 配置

1. Vercel Dashboard -> Add New Project -> Import Git Repository。
2. Framework Preset 选择 Next.js。
3. Build Command 保持 `npm run build`。
4. Install Command 保持 `npm install`。
5. Environment Variables 添加：
   - `POSTGRES_URL`
   - `CRON_SECRET`
   - `COINGECKO_API_KEY`（免费 Basic/Demo，可选但推荐）
   - `COINGECKO_PRO_API_KEY`（仅付费 Pro 账号需要）
6. 点击 Deploy。

## 5. 配置 Postgres

推荐在 Vercel Marketplace 安装 Neon Postgres，并把 Neon 连接到当前 Vercel 项目。Neon integration 会注入 Postgres 相关环境变量；本项目只需要确认有可用的 `POSTGRES_URL`。

首次 Cron 或首次手动调用 `/api/cron/snapshot-oi` 时，代码会自动创建/补齐 `oi_snapshots` 表结构。

## 6. 验证部署

部署后打开：

```text
https://你的域名/api/stats
https://你的域名/api/markets/aster
https://你的域名/api/markets/hyperliquid
https://你的域名/api/history/oi/aster/BTC
```

在 Vercel Dashboard -> Settings -> Cron Jobs 查看 `/api/cron/snapshot-oi` 是否已创建。

OI 历史不会回填。部署成功后，Cron 每 5 分钟采集一次，1h/24h/7d 的 OI Δ 会随着数据自然累积。

## 自有服务器部署

自有服务器推荐使用 Node.js 20+、PM2 和系统 cron。

```bash
git clone <your-repo-url>
cd Aster
npm install
npm run build
```

在服务器项目目录创建 `.env.local`：

```env
POSTGRES_URL=postgres://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require
CRON_SECRET=replace_with_a_random_string_at_least_16_chars
```

启动生产服务：

```bash
npm run start
```

默认生产端口是 `3001`。如果要临时覆盖：

```bash
PORT=3002 npm run start
```

用 PM2 守护：

```bash
npm install -g pm2
pm2 start npm --name aster-dashboard -- start
pm2 save
pm2 startup
```

设置定时采集（**自部署必须配置**，`vercel.json` 里的 cron 只在 Vercel 平台生效）：

```bash
crontab -e
```

添加两行——OI 快照每 5 分钟、Hyperliquid 回购每 1 小时：

```cron
*/5 * * * * curl -fsS -H "Authorization: Bearer YOUR_CRON_SECRET" http://127.0.0.1:3001/api/cron/snapshot-oi >> /var/log/aster-oi-cron.log 2>&1
0 * * * * curl -fsS -H "Authorization: Bearer YOUR_CRON_SECRET" http://127.0.0.1:3001/api/cron/snapshot-buyback >> /var/log/aster-buyback-cron.log 2>&1
```

回购 cron 每小时整点跑一次，首次会回拉 30 天 fills，之后只增量更新（一般几十到几百条 fills/小时）。

如果要绑定域名，使用 Nginx 反代到 `http://127.0.0.1:3001`，再用 Certbot 配 HTTPS。

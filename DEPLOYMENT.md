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
```

- `POSTGRES_URL`：Neon / Vercel Marketplace Postgres 的 pooled connection string。
- `CRON_SECRET`：随机字符串，生产环境用来保护 `/api/cron/snapshot-oi`。

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

用 PM2 守护：

```bash
npm install -g pm2
pm2 start npm --name aster-dashboard -- start
pm2 save
pm2 startup
```

设置 5 分钟采集：

```bash
crontab -e
```

添加：

```cron
*/5 * * * * curl -fsS -H "Authorization: Bearer YOUR_CRON_SECRET" http://127.0.0.1:3000/api/cron/snapshot-oi >> /var/log/aster-oi-cron.log 2>&1
```

如果要绑定域名，使用 Nginx 反代到 `http://127.0.0.1:3000`，再用 Certbot 配 HTTPS。

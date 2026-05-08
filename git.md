# Git / 服务器更新流程

这份流程用于本项目的日常更新：本地改代码，推送到 GitHub，然后在服务器 `/home/aster-dashboard` 拉取并重启服务。

## 1. 本地开发完成后

先确认当前改动：

```bash
git status --short
git diff --stat
```

跑检查：

```bash
npm run typecheck
npm run lint
npm run build
```

提交并推送：

```bash
git add .
git commit -m "Describe your change"
git push origin main
```

## 2. 服务器正常更新

登录服务器后：

```bash
cd /home/aster-dashboard
git status --short
git pull --ff-only origin main
npm install
npm run build
pm2 restart aster-dashboard --update-envß
```

如果 `git status --short` 没有输出，说明服务器工作区干净，可以直接 pull。

## 3. 如果服务器 pull 提示本地改动冲突

常见报错：

```text
error: Your local changes to the following files would be overwritten by merge:
...
Please commit your changes or stash them before you merge.
Aborting
```

不要直接 `reset --hard`。先保存服务器本地改动：

```bash
git status --short
git stash push -m "server local changes before deploy"
git pull --ff-only origin main
npm install
npm run build
pm2 restart aster-dashboard --update-env
```

如果只想 stash 指定文件，例如：

```bash
git stash push -m "server local changes before deploy" -- components/PieShareChart.tsx lib/db/oi-history.ts package.json
```

## 4. 查看或恢复服务器 stash

查看 stash 列表：

```bash
git stash list
```

查看最近一次 stash 改了什么：

```bash
git stash show -p stash@{0}
```

如果确认要恢复 stash：

```bash
git stash apply stash@{0}
```

如果恢复后产生冲突，先处理冲突，再：

```bash
git add .
git commit -m "Restore server local changes"
```

如果确认 stash 不再需要：

```bash
git stash drop stash@{0}
```

## 5. 部署后立即生成最新数据

新版本上线后，可以手动触发一次 cron，让快照和预计算数据马上刷新：

```bash
CRON_SECRET=$(grep '^CRON_SECRET=' .env.local | cut -d= -f2- | tr -d '"' | tr -d "'")
curl -fsS -H "Authorization: Bearer $CRON_SECRET" http://127.0.0.1:3001/api/cron/snapshot-oi
```

## 6. 部署后验证

```bash
curl -s http://127.0.0.1:3001/api/stats
curl -s http://127.0.0.1:3001/api/protocols
curl -s http://127.0.0.1:3001/api/markets/aster | head
curl -s "http://127.0.0.1:3001/api/delta/oi?period=1h"
pm2 logs aster-dashboard --lines 50
```

## 7. 常用排错

看当前运行状态：

```bash
pm2 status
pm2 logs aster-dashboard --lines 100
```

重新启动：

```bash
pm2 restart aster-dashboard --update-env
```

如果依赖异常：

```bash
npm install
npm run build
pm2 restart aster-dashboard --update-env
```

## 8. 危险命令提醒

不要轻易执行：

```bash
git reset --hard
git clean -fd
```

这两个命令会删除服务器本地未提交改动。只有在你确认这些改动完全不要了，才可以使用。

import { DeltaLeaderboard } from "@/components/DeltaLeaderboard";

export default function LeaderboardPage() {
  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-semibold">OI / Volume Δ 排行榜</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          按 1h / 24h / 7d 的 OI 增长率与 24h 成交额变化率寻找正在被堆仓 / 突然爆量的币种；点击币名跳转到追踪页查看该币种的历史曲线。
        </p>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <DeltaLeaderboard
          metric="oi"
          title="OI Δ 排行榜"
          description="按 1h / 24h / 7d OI 增长率或增加量寻找正在被堆仓的币种"
        />
        <DeltaLeaderboard
          metric="volume"
          title="Volume Δ 排行榜"
          description="按 24h 成交额快照变化率或增加量寻找突然爆量的币种"
        />
      </section>
    </div>
  );
}

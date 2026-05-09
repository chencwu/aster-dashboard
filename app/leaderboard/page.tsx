import { DeltaLeaderboard } from "@/components/DeltaLeaderboard";

export default function LeaderboardPage() {
  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-semibold">OI / Volume Δ 排行榜</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          点击币名跳转到追踪页查看该币种的历史曲线。
        </p>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <DeltaLeaderboard
          metric="oi"
          title="OI Δ 排行榜"
          description="正在被堆仓的币种"
        />
        <DeltaLeaderboard
          metric="volume"
          title="Volume Δ 排行榜"
          description="突然爆量的币种"
        />
      </section>
    </div>
  );
}

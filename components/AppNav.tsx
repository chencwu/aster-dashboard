"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, BarChart3, LineChart } from "lucide-react";
import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "总览", icon: BarChart3 },
  { href: "/markets", label: "币种", icon: Activity },
  { href: "/tracker", label: "追踪", icon: LineChart }
];

export function AppNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-20 border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-md border bg-card text-sm font-semibold text-primary">
            PX
          </span>
          <div>
            <div className="font-semibold">Perp DEX Monitor</div>
            <div className="text-xs text-muted-foreground">Aster / Hyperliquid OI 与成交量</div>
          </div>
        </Link>
        <nav className="flex items-center gap-1 rounded-md border bg-card p-1">
          {links.map((link) => {
            const Icon = link.icon;
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "inline-flex h-9 items-center gap-2 rounded-sm px-3 text-sm text-muted-foreground transition-colors hover:text-foreground",
                  active && "bg-muted text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

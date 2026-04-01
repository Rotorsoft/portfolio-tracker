import { useRef, useEffect, useState } from "react";
import { Tooltip } from "./Tooltip.js";
import { isMarketOpen, marketCountdown, fmtCountdown, lastTradingDate, type LiveQuotes } from "../live.js";
import { glColor, fmtDate } from "../fmt.js";

const INDEXES = [
  { symbol: "^DJI", name: "DOW" },
  { symbol: "^GSPC", name: "S&P 500" },
  { symbol: "^IXIC", name: "NASDAQ" },
];

function fmtIndex(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type Props = {
  now: number;
  polling: boolean;
  quotesUpdatedAt: number | undefined;
  quoteStats: { refreshCount: number; lastRefreshTs: number | null } | undefined;
  autoBackfilling: boolean;
  quotes: LiveQuotes | undefined;
};

export function MarketMarquee({ now, polling, quotesUpdatedAt, quoteStats, autoBackfilling, quotes }: Props) {
  const [tick, setTick] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const open = isMarketOpen();
  const mc = marketCountdown();
  const target = lastTradingDate();

  const trackRef = useRef<HTMLDivElement>(null);
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    if (trackRef.current) setAnimate(true);
  }, [quotes]);

  const refreshCount = quoteStats?.refreshCount ?? 0;
  const nextUpdateIn = quotesUpdatedAt ? Math.max(0, 300_000 - (now - quotesUpdatedAt)) : 0;

  const tooltipLabel = open ? (
    <div className="space-y-1.5 text-[11px]">
      <div className="flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
        <span className="text-emerald-400 font-medium">Market Open</span>
        <span className="text-gray-500">·</span>
        <span className="text-gray-300">{mc.label} {fmtCountdown(mc.ms)}</span>
      </div>
      <div className="flex items-center gap-3 text-gray-400">
        <span>Refresh every 5 min</span>
        <span className="text-gray-500">·</span>
        <span>Next in {fmtCountdown(nextUpdateIn)}</span>
      </div>
      <div className="text-gray-500">Refreshed {refreshCount}x since last boot</div>
      {autoBackfilling && <div className="text-amber-400">Syncing prices...</div>}
    </div>
  ) : (
    <div className="space-y-1.5 text-[11px]">
      <div className="flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-gray-500" />
        <span className="text-gray-400 font-medium">Market Closed</span>
        <span className="text-gray-500">·</span>
        <span className="text-gray-300">{mc.label} {fmtCountdown(mc.ms)}</span>
      </div>
      <div className="text-gray-500">Last close {fmtDate(target)}</div>
      {polling && <div className="text-gray-500">Settling...</div>}
    </div>
  );

  const items = INDEXES.map((idx) => {
    const q = quotes?.[idx.symbol];
    if (!q) return null;
    const chg = q.price - q.previousClose;
    const pct = q.previousClose > 0 ? (chg / q.previousClose) * 100 : 0;
    const color = glColor(chg);
    const arrow = chg > 0 ? "▲" : chg < 0 ? "▼" : "–";
    return (
      <span key={idx.symbol} className="inline-flex items-center gap-1.5 px-3 whitespace-nowrap">
        <span className="text-gray-400 font-medium">{idx.name}</span>
        <span className="text-gray-200">{fmtIndex(q.price)}</span>
        <span className={color}>
          {arrow} {Math.abs(chg).toFixed(2)} ({Math.abs(pct).toFixed(2)}%)
        </span>
      </span>
    );
  }).filter(Boolean);

  const hasData = items.length > 0;

  const track = hasData ? (
    <>
      {items}
      <span className="px-2 text-gray-700">•</span>
      {items}
      <span className="px-2 text-gray-700">•</span>
      {items}
      <span className="px-2 text-gray-700">•</span>
    </>
  ) : null;

  return (
    <div className="flex items-center gap-2 text-[10px] ml-6 overflow-hidden min-w-0 flex-1">
      <Tooltip label={tooltipLabel} icon>
        <div className="flex items-center gap-1.5 flex-shrink-0 cursor-default">
          <span className={`w-1.5 h-1.5 rounded-full ${open ? "bg-emerald-400 animate-pulse" : "bg-gray-600"}`} />
          {open ? (
            <span className="text-emerald-400 font-medium">Live</span>
          ) : (
            <span className="text-gray-600">Closed</span>
          )}
        </div>
      </Tooltip>

      {hasData && (
        <div className="overflow-hidden min-w-0 flex-1 select-none text-[11px] contain-layout">
          <div
            ref={trackRef}
            className={`inline-flex items-center ${animate ? "marquee-scroll" : ""}`}
            style={{ willChange: "transform", contain: "layout style" }}
          >
            {track}
          </div>
        </div>
      )}
    </div>
  );
}

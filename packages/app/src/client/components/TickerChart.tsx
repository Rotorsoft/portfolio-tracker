import { useState } from "react";
import { ResponsiveContainer, ComposedChart, Line, Bar, Area, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from "recharts";
import { trpc } from "../trpc.js";
import { fmtDate, fmtDateShort } from "../fmt.js";
import { shouldPollQuotes } from "../live.js";

type Lot = { id: string; type: string; transactionDate: string; quantity: number; price: number; fees: number; notes: string; grade?: string; gradeScore?: number; gradeExplanation?: string };
type HighlightLot = { date: string; price: number; type: string } | null;
type Range = "1M" | "3M" | "6M" | "1Y" | "ALL";
let persistedRange: Range = "ALL";
let persistedShowMA = true;
let persistedShowBB = false;

export function TickerChart({ symbol, lots, cutoffDate, highlightLot, refreshMs = 300_000 }: { symbol: string; lots: Lot[]; cutoffDate?: string; highlightLot?: HighlightLot; refreshMs?: number }) {
  const { data: prices } = trpc.getTickerPrices.useQuery({ symbol, from: "2024-01-01" });
  const { data: overlays } = trpc.getChartOverlays.useQuery({ symbol });
  const { data: liveQuotes } = trpc.getQuotes.useQuery({ symbols: [symbol] }, { refetchInterval: shouldPollQuotes() ? refreshMs : false });
  const [showMA, setShowMAState] = useState(persistedShowMA);
  const [showBB, setShowBBState] = useState(persistedShowBB);
  const [range, setRangeState] = useState<Range>(persistedRange);
  const setShowMA = (v: boolean) => { persistedShowMA = v; setShowMAState(v); };
  const setShowBB = (v: boolean) => { persistedShowBB = v; setShowBBState(v); };
  const setRange = (r: Range) => { persistedRange = r; setRangeState(r); };

  if (!prices || prices.length === 0) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6 text-center text-gray-500">
        No price data for {symbol}. Use the Price Data tab to backfill.
      </div>
    );
  }

  // Append today's live price if not in historical data
  const today = new Date().toISOString().split("T")[0];
  const livePrice = liveQuotes?.[symbol]?.price;
  const allPrices = prices && livePrice && (!prices.length || prices[prices.length - 1].date < today)
    ? [...prices, { date: today, close: livePrice, volume: 0 }]
    : prices ?? [];

  // Merge prices with lot markers + overlays
  const ma50Map = new Map(overlays?.ma50?.map((m) => [m.date, m.value]) ?? []);
  const ma200Map = new Map(overlays?.ma200?.map((m) => [m.date, m.value]) ?? []);
  const bbMap = new Map(overlays?.bollinger?.map((b) => [b.date, b]) ?? []);

  const chartData = allPrices.map((p) => {
    const buyLots = lots.filter((l) => l.transactionDate === p.date && l.type === "buy");
    const sellLots = lots.filter((l) => l.transactionDate === p.date && l.type === "sell");
    const ma50AtDate = ma50Map.get(p.date) ?? null;
    const ma200AtDate = ma200Map.get(p.date) ?? null;
    // Aggregate lot info for tooltip
    const buyInfo = buyLots.length > 0 ? buyLots.map((l) => `${l.quantity}@$${l.price}`).join(", ") : null;
    const sellInfo = sellLots.length > 0 ? sellLots.map((l) => `${l.quantity}@$${l.price}`).join(", ") : null;
    const buyVsMa50 = buyLots.length > 0 && ma50AtDate ? ((buyLots[0].price - ma50AtDate) / ma50AtDate * 100) : null;
    const buyGrade = buyLots.length > 0 ? (buyLots[0].grade || null) : null;
    return {
      date: p.date,
      close: p.close,
      volume: p.volume,
      buyMarker: buyLots.length > 0 ? buyLots[0].price : null,
      sellMarker: sellLots.length > 0 ? sellLots[0].price : null,
      _buyInfo: buyInfo,
      _sellInfo: sellInfo,
      _buyVsMa50: buyVsMa50?.toFixed(1) ?? null,
      _buyGrade: buyGrade,
      _ma50: ma50AtDate,
      ma50: showMA ? (ma50Map.get(p.date) ?? null) : null,
      ma200: showMA ? (ma200Map.get(p.date) ?? null) : null,
      bbUpper: showBB ? (bbMap.get(p.date)?.upper ?? null) : null,
      bbMiddle: showBB ? (bbMap.get(p.date)?.middle ?? null) : null,
      bbLower: showBB ? (bbMap.get(p.date)?.lower ?? null) : null,
    };
  });

  // Filter by selected range
  const rangeStart = (() => {
    if (range === "ALL") return null;
    const d = new Date();
    if (range === "1M") d.setMonth(d.getMonth() - 1);
    else if (range === "3M") d.setMonth(d.getMonth() - 3);
    else if (range === "6M") d.setMonth(d.getMonth() - 6);
    else if (range === "1Y") d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().split("T")[0];
  })();
  const visibleData = rangeStart ? chartData.filter((d) => d.date >= rangeStart) : chartData;

  const highlightIndex = highlightLot ? (() => {
    const exact = visibleData.findIndex((d) => d.date === highlightLot.date);
    if (exact >= 0) return exact;
    const nearest = visibleData.findIndex((d) => d.date >= highlightLot.date);
    return nearest >= 0 ? nearest : visibleData.length - 1;
  })() : undefined;

  const avgCost = lots.filter((l) => l.type === "buy").length > 0
    ? lots.filter((l) => l.type === "buy").reduce((s, l) => s + l.quantity * l.price, 0) /
      lots.filter((l) => l.type === "buy").reduce((s, l) => s + l.quantity, 0)
    : 0;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl px-1 py-2 mb-4">
      <div className="flex items-center gap-3 mb-4 px-3">
        <h3 className="text-sm font-medium text-gray-400">{symbol} Price &amp; Transactions</h3>
        <button onClick={() => setShowMA(!showMA)} type="button"
          className={`text-xs px-2 py-0.5 rounded ${showMA ? "bg-amber-600/20 text-amber-400" : "text-gray-600 hover:text-gray-400"}`}>
          Moving Avg
        </button>
        <button onClick={() => setShowBB(!showBB)}
          className={`text-xs px-2 py-0.5 rounded ${showBB ? "bg-purple-600/20 text-purple-400" : "text-gray-600 hover:text-gray-400"}`}>
          Bollinger
        </button>
        <div className="flex-1" />
        <div className="flex gap-1">
          {(["1M", "3M", "6M", "1Y", "ALL"] as const).map((r) => (
            <button key={r} onClick={() => setRange(r)}
              className={`text-[10px] px-1.5 py-0.5 rounded ${range === r ? "bg-indigo-600/20 text-indigo-400" : "text-gray-600 hover:text-gray-400"}`}>
              {r}
            </button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={visibleData} margin={{ top: 0, right: -15, bottom: 0, left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748b" }} tickFormatter={fmtDateShort} interval="preserveStartEnd" />
          <YAxis yAxisId="price" tick={{ fontSize: 11, fill: "#64748b" }} domain={["auto", "auto"]} />
          <YAxis yAxisId="volume" orientation="right" tick={{ fontSize: 10, fill: "#475569" }}
            tickFormatter={(v: number) => v >= 1e6 ? `${(v / 1e6).toFixed(0)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : `${v}`} />
          <Tooltip
            defaultIndex={highlightIndex != null && highlightIndex >= 0 ? highlightIndex : undefined}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0]?.payload;
              return (
                <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs shadow-xl">
                  <div className="text-gray-400 mb-1">{fmtDate(label)}</div>
                  <div className="text-white">Close: ${d?.close?.toFixed(2)}</div>
                  {d?._ma50 != null && <div className="text-amber-400">MA50: ${d._ma50.toFixed(2)}</div>}
                  {d?.ma200 != null && <div className="text-red-400">MA200: ${d.ma200.toFixed(2)}</div>}
                  {d?.volume != null && <div className="text-gray-500">Vol: {d.volume >= 1e6 ? `${(d.volume / 1e6).toFixed(1)}M` : `${(d.volume / 1e3).toFixed(0)}K`}</div>}
                  {d?.bbUpper != null && <div className="text-purple-400 text-[10px]">BB: ${d.bbLower?.toFixed(2)} — ${d.bbUpper?.toFixed(2)}</div>}
                  {d?._buyInfo && (
                    <div className="mt-1 pt-1 border-t border-gray-700">
                      <div className="flex items-center gap-2">
                        <span className="text-emerald-400 font-medium">BUY {d._buyInfo}</span>
                        {d._buyGrade && (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            d._buyGrade === "A" ? "bg-emerald-500/20 text-emerald-400" :
                            d._buyGrade === "B" ? "bg-emerald-500/10 text-emerald-400" :
                            d._buyGrade === "C" ? "bg-amber-500/10 text-amber-400" :
                            d._buyGrade === "D" ? "bg-red-500/10 text-red-400" :
                            "bg-red-500/20 text-red-400"
                          }`}>{d._buyGrade}</span>
                        )}
                      </div>
                      {d._buyVsMa50 && <div className={`text-[10px] ${Number(d._buyVsMa50) > 0 ? "text-red-400" : "text-emerald-400"}`}>
                        {Math.abs(Number(d._buyVsMa50)).toFixed(1)}% vs MA50
                      </div>}
                      {d._buyGrade && <div className="text-[10px] text-gray-500">
                        {d._buyGrade === "A" ? "Dip buy in uptrend" :
                         d._buyGrade === "B" ? "Buying in uptrend" :
                         d._buyGrade === "C" ? "No clear trend" :
                         d._buyGrade === "D" ? "Buying in downtrend" :
                         "Chasing in downtrend"}
                      </div>}
                    </div>
                  )}
                  {d?._sellInfo && (
                    <div className="mt-1 pt-1 border-t border-gray-700">
                      <div className="text-red-400 font-medium">SELL {d._sellInfo}</div>
                    </div>
                  )}
                </div>
              );
            }}
          />
          {cutoffDate && <ReferenceLine yAxisId="price" x={cutoffDate} stroke="#f59e0b" strokeDasharray="5 5" label={{ value: "Cutoff", fill: "#f59e0b", fontSize: 10, position: "insideTopRight" }} />}
          {avgCost > 0 && (
            <ReferenceLine yAxisId="price" y={avgCost} stroke="#f59e0b" strokeDasharray="5 5" label={{
              value: `Avg $${avgCost.toFixed(2)}`, position: "insideTopLeft", fill: "#f59e0b", fontSize: 11,
            }} />
          )}
          {/* Bollinger Bands — shaded area */}
          {showBB && <Area yAxisId="price" type="monotone" dataKey="bbUpper" stroke="none" fill="#8b5cf6" fillOpacity={0.05} dot={false} />}
          {showBB && <Area yAxisId="price" type="monotone" dataKey="bbLower" stroke="none" fill="#1e293b" fillOpacity={1} dot={false} />}
          {showBB && <Line yAxisId="price" type="monotone" dataKey="bbUpper" stroke="#8b5cf6" strokeWidth={1} strokeOpacity={0.4} dot={false} />}
          {showBB && <Line yAxisId="price" type="monotone" dataKey="bbLower" stroke="#8b5cf6" strokeWidth={1} strokeOpacity={0.4} dot={false} />}
          {showBB && <Line yAxisId="price" type="monotone" dataKey="bbMiddle" stroke="#8b5cf6" strokeWidth={1} strokeDasharray="3 3" strokeOpacity={0.3} dot={false} />}
          {/* Volume bars */}
          <Bar yAxisId="volume" dataKey="volume" fill="#64748b" opacity={0.25} />
          {/* Price line */}
          <Line yAxisId="price" type="monotone" dataKey="close" stroke="#6366f1" strokeWidth={2} dot={false} />
          {/* Moving averages */}
          {showMA && <Line yAxisId="price" type="monotone" dataKey="ma50" stroke="#f59e0b" strokeWidth={1.5} strokeOpacity={0.7} dot={false} />}
          {showMA && <Line yAxisId="price" type="monotone" dataKey="ma200" stroke="#ef4444" strokeWidth={1.5} strokeOpacity={0.7} dot={false} />}
          {/* Entry/exit markers */}
          <Line yAxisId="price" type="monotone" dataKey="buyMarker" stroke="#10b981" strokeWidth={0} dot={{ r: 6, fill: "#10b981", stroke: "#064e3b", strokeWidth: 2 }} />
          <Line yAxisId="price" type="monotone" dataKey="sellMarker" stroke="#ef4444" strokeWidth={0} dot={{ r: 6, fill: "#ef4444", stroke: "#7f1d1d", strokeWidth: 2 }} />
          {/* Highlight from lot table hover */}
          {highlightLot && highlightIndex != null && highlightIndex >= 0 && (
            <ReferenceLine yAxisId="price" x={visibleData[highlightIndex].date} stroke={highlightLot.type === "buy" ? "#10b981" : "#ef4444"} strokeDasharray="3 3" strokeOpacity={0.5} />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

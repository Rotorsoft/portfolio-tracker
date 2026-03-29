import { useState } from "react";
import { ResponsiveContainer, ComposedChart, Line, Bar, Area, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, Brush } from "recharts";
import { trpc } from "../trpc.js";
import { fmtDate, fmtDateShort } from "../fmt.js";

type Lot = { id: string; type: string; transactionDate: string; quantity: number; price: number; fees: number; notes: string; grade?: string; gradeScore?: number; gradeExplanation?: string };

export function TickerChart({ symbol, lots, cutoffDate }: { symbol: string; lots: Lot[]; cutoffDate?: string }) {
  const { data: prices } = trpc.getTickerPrices.useQuery({ symbol, from: "2024-01-01" });
  const { data: overlays } = trpc.getChartOverlays.useQuery({ symbol });
  const [showMA, setShowMA] = useState(true);
  const [showBB, setShowBB] = useState(false);

  if (!prices || prices.length === 0) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6 text-center text-gray-500">
        No price data for {symbol}. Use the Price Data tab to backfill.
      </div>
    );
  }

  // Merge prices with lot markers + overlays
  const ma50Map = new Map(overlays?.ma50?.map((m) => [m.date, m.value]) ?? []);
  const ma200Map = new Map(overlays?.ma200?.map((m) => [m.date, m.value]) ?? []);
  const bbMap = new Map(overlays?.bollinger?.map((b) => [b.date, b]) ?? []);

  const chartData = prices.map((p) => {
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

  const avgCost = lots.filter((l) => l.type === "buy").length > 0
    ? lots.filter((l) => l.type === "buy").reduce((s, l) => s + l.quantity * l.price, 0) /
      lots.filter((l) => l.type === "buy").reduce((s, l) => s + l.quantity, 0)
    : 0;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6">
      <div className="flex items-center gap-3 mb-4">
        <h3 className="text-sm font-medium text-gray-400">{symbol} Price &amp; Transactions</h3>
        <button onClick={() => setShowMA(!showMA)}
          className={`text-xs px-2 py-0.5 rounded ${showMA ? "bg-amber-600/20 text-amber-400" : "text-gray-600 hover:text-gray-400"}`}>
          Moving Avg
        </button>
        <button onClick={() => setShowBB(!showBB)}
          className={`text-xs px-2 py-0.5 rounded ${showBB ? "bg-purple-600/20 text-purple-400" : "text-gray-600 hover:text-gray-400"}`}>
          Bollinger
        </button>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748b" }} tickFormatter={fmtDateShort} interval="preserveStartEnd" />
          <YAxis yAxisId="price" tick={{ fontSize: 11, fill: "#64748b" }} domain={["auto", "auto"]} />
          <YAxis yAxisId="volume" orientation="right" tick={{ fontSize: 10, fill: "#475569" }}
            tickFormatter={(v: number) => v >= 1e6 ? `${(v / 1e6).toFixed(0)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : `${v}`} />
          <Tooltip
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
                        {Number(d._buyVsMa50) > 0 ? "+" : ""}{d._buyVsMa50}% vs MA50
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
          <Brush dataKey="date" height={20} stroke="#334155" fill="#1e293b" tickFormatter={fmtDateShort} travellerWidth={8} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

import { useState } from "react";
import { ResponsiveContainer, ComposedChart, Line, Bar, Area, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, Brush } from "recharts";
import { trpc } from "../trpc.js";
import { fmtDate, fmtDateShort } from "../fmt.js";

type Lot = { id: string; type: string; transactionDate: string; quantity: number; price: number; fees: number; notes: string };

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
    return {
      date: p.date,
      close: p.close,
      volume: p.volume,
      buyMarker: buyLots.length > 0 ? buyLots[0].price : null,
      sellMarker: sellLots.length > 0 ? sellLots[0].price : null,
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
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-400">{symbol} Price &amp; Entry Points</h3>
        <div className="flex gap-2">
          <button onClick={() => setShowMA(!showMA)}
            className={`text-xs px-2 py-0.5 rounded ${showMA ? "bg-indigo-600/20 text-indigo-400" : "text-gray-600 hover:text-gray-400"}`}>
            MA
          </button>
          <button onClick={() => setShowBB(!showBB)}
            className={`text-xs px-2 py-0.5 rounded ${showBB ? "bg-purple-600/20 text-purple-400" : "text-gray-600 hover:text-gray-400"}`}>
            BB
          </button>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748b" }} tickFormatter={fmtDateShort} interval="preserveStartEnd" />
          <YAxis yAxisId="price" tick={{ fontSize: 11, fill: "#64748b" }} domain={["auto", "auto"]} />
          <YAxis yAxisId="volume" orientation="right" tick={{ fontSize: 10, fill: "#475569" }}
            tickFormatter={(v: number) => v >= 1e6 ? `${(v / 1e6).toFixed(0)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : `${v}`} />
          <Tooltip
            contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: "8px", fontSize: "12px" }}
            labelStyle={{ color: "#94a3b8" }}
            labelFormatter={(d: string) => fmtDate(d)}
            formatter={(value: number | null, name: string) => {
              if (value == null) return ["", ""];
              if (name === "volume") return [value >= 1e6 ? `${(value / 1e6).toFixed(1)}M` : `${(value / 1e3).toFixed(0)}K`, "Volume"];
              if (name === "close") return [`$${value.toFixed(2)}`, "Close"];
              if (name === "buyMarker") return [`$${value.toFixed(2)}`, "Buy"];
              if (name === "sellMarker") return [`$${value.toFixed(2)}`, "Sell"];
              if (name === "ma50") return [`$${value.toFixed(2)}`, "50-day MA"];
              if (name === "ma200") return [`$${value.toFixed(2)}`, "200-day MA"];
              if (name === "bbUpper") return [`$${value.toFixed(2)}`, "BB Upper"];
              if (name === "bbLower") return [`$${value.toFixed(2)}`, "BB Lower"];
              if (name === "bbMiddle") return [`$${value.toFixed(2)}`, "BB Middle"];
              return [`${value}`, name];
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

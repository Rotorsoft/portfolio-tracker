import { ResponsiveContainer, ComposedChart, Line, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, Brush } from "recharts";
import { trpc } from "../trpc.js";
import { fmtDate, fmtDateShort } from "../fmt.js";

type Lot = { id: string; type: string; transactionDate: string; quantity: number; price: number; fees: number; notes: string };

export function TickerChart({ symbol, lots, cutoffDate }: { symbol: string; lots: Lot[]; cutoffDate?: string }) {
  const { data: prices } = trpc.getTickerPrices.useQuery({ symbol, from: "2024-01-01" });

  if (!prices || prices.length === 0) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6 text-center text-gray-500">
        No price data for {symbol}. Use the Price Data tab to backfill.
      </div>
    );
  }

  // Merge prices with lot markers
  const chartData = prices.map((p) => {
    const buyLots = lots.filter((l) => l.transactionDate === p.date && l.type === "buy");
    const sellLots = lots.filter((l) => l.transactionDate === p.date && l.type === "sell");
    return {
      date: p.date,
      close: p.close,
      volume: p.volume,
      buyMarker: buyLots.length > 0 ? buyLots[0].price : null,
      sellMarker: sellLots.length > 0 ? sellLots[0].price : null,
    };
  });

  // Add lot entry lines
  const buyEntries = lots.filter((l) => l.type === "buy").map((l) => l.price);
  const avgCost = buyEntries.length > 0
    ? lots.filter((l) => l.type === "buy").reduce((s, l) => s + l.quantity * l.price, 0) /
      lots.filter((l) => l.type === "buy").reduce((s, l) => s + l.quantity, 0)
    : 0;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6">
      <h3 className="text-sm font-medium text-gray-400 mb-4">
        {symbol} Price &amp; Entry Points
      </h3>
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: "#64748b" }}
            tickFormatter={fmtDateShort}
            interval="preserveStartEnd"
          />
          <YAxis yAxisId="price" tick={{ fontSize: 11, fill: "#64748b" }} domain={["auto", "auto"]} />
          <YAxis yAxisId="volume" orientation="right" tick={{ fontSize: 10, fill: "#475569" }}
            tickFormatter={(v: number) => v >= 1e6 ? `${(v / 1e6).toFixed(0)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : `${v}`} />
          <Tooltip
            contentStyle={{
              backgroundColor: "#1e293b",
              border: "1px solid #334155",
              borderRadius: "8px",
              fontSize: "12px",
            }}
            labelStyle={{ color: "#94a3b8" }}
            labelFormatter={(d: string) => fmtDate(d)}
            formatter={(value: number | null, name: string) => {
              if (value == null) return ["", ""];
              if (name === "volume") return [value >= 1e6 ? `${(value / 1e6).toFixed(1)}M` : `${(value / 1e3).toFixed(0)}K`, "Volume"];
              if (name === "close") return [`$${value.toFixed(2)}`, "Close"];
              if (name === "buyMarker") return [`$${value.toFixed(2)}`, "Buy"];
              if (name === "sellMarker") return [`$${value.toFixed(2)}`, "Sell"];
              return [`${value}`, name];
            }}
          />
          {avgCost > 0 && (
            <ReferenceLine yAxisId="price" y={avgCost} stroke="#f59e0b" strokeDasharray="5 5" label={{
              value: `Avg $${avgCost.toFixed(2)}`,
              position: "insideTopLeft",
              fill: "#f59e0b",
              fontSize: 11,
            }} />
          )}
          {cutoffDate && <ReferenceLine yAxisId="price" x={cutoffDate} stroke="#f59e0b" strokeDasharray="5 5" label={{ value: "Cutoff", fill: "#f59e0b", fontSize: 10, position: "insideTopRight" }} />}
          <Bar yAxisId="volume" dataKey="volume" fill="#64748b" opacity={0.25} />
          <Line yAxisId="price" type="monotone" dataKey="close" stroke="#6366f1" strokeWidth={2} dot={false} />
          <Line yAxisId="price" type="monotone" dataKey="buyMarker" stroke="#10b981" strokeWidth={0} dot={{
            r: 6, fill: "#10b981", stroke: "#064e3b", strokeWidth: 2
          }} />
          <Line yAxisId="price" type="monotone" dataKey="sellMarker" stroke="#ef4444" strokeWidth={0} dot={{
            r: 6, fill: "#ef4444", stroke: "#7f1d1d", strokeWidth: 2
          }} />
          <Brush dataKey="date" height={20} stroke="#334155" fill="#1e293b"
            tickFormatter={fmtDateShort} travellerWidth={8} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

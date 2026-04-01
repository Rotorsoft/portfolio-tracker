import { useState } from "react";
import { ResponsiveContainer, ComposedChart, Line, Area, XAxis, YAxis, Tooltip as RechartsTooltip, CartesianGrid, Legend, ReferenceLine } from "recharts";
import { trpc } from "../trpc.js";
import { fmtUsd, fmtUsdAbs, fmtPctAbs, fmtDate, fmtDateShort, glColor } from "../fmt.js";
import { StatCard } from "./StatCard.js";
import { Tooltip } from "./Tooltip.js";

type Props = { portfolioId: string; onSelectTicker?: (ticker: string) => void };

export function DCAChart({ portfolioId, onSelectTicker }: Props) {
  const { data: summary } = trpc.getPortfolioSummary.useQuery({ portfolioId });
  const { data: dcaData, isLoading } = trpc.getDCAComparison.useQuery({ portfolioId });
  const [sort, setSort] = useState<{ col: string; dir: "asc" | "desc" }>({ col: "dcaSavingsPct", dir: "desc" });

  if (!summary || summary.positions.length === 0) {
    return <div className="text-gray-500 text-center py-8">No positions to analyze.</div>;
  }

  const { totalCost } = summary;
  const fmtK = (n: number) => `$${(Math.abs(n) / 1000).toFixed(1)}k`;

  // Table data from DCA route (consistent with chart computation)
  const dcaPositions = dcaData?.positions ?? [];
  const rows = dcaPositions.map((p) => {
    const valueDiff = p.actualValue - p.dcaValue;
    const valueDiffPct = p.dcaValue > 0 ? (valueDiff / p.dcaValue) * 100 : 0;
    const weight = totalCost > 0 ? (p.actualCost / totalCost) * 100 : 0;
    return { ...p, valueDiff, valueDiffPct, weight };
  });

  const totalActualValue = rows.reduce((s, r) => s + r.actualValue, 0);
  const totalDcaValue = rows.reduce((s, r) => s + r.dcaValue, 0);
  const maxDiffPct = Math.max(...rows.map((r) => Math.abs(r.valueDiffPct)), 1);

  const sorted = [...rows].sort((a, b) => {
    const av = (a as any)[sort.col] ?? 0;
    const bv = (b as any)[sort.col] ?? 0;
    const cmp = typeof av === "string" ? av.localeCompare(bv) : av - bv;
    return sort.dir === "asc" ? cmp : -cmp;
  });

  const cols: { key: string; label: string; align: string; border?: boolean }[] = [
    { key: "ticker", label: "Ticker", align: "left" },
    { key: "weight", label: "Weight", align: "right" },
    { key: "actualCost", label: "Cost", align: "right" },
    { key: "actualValue", label: "Your Value", align: "right" },
    { key: "dcaValue", label: "DCA Value", align: "right", border: true },
    { key: "valueDiff", label: "Diff", align: "right" },
    { key: "valueDiffPct", label: "vs DCA", align: "right", border: true },
  ];

  // Chart data
  const timeline = dcaData?.timeline ?? [];
  const lastEntry = timeline.at(-1);
  const deltaColor = lastEntry && lastEntry.delta >= 0 ? "#10b981" : "#ef4444";

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-sm font-medium text-gray-400">DCA — Dollar-Cost Averaging Comparison</h3>
          <p className="text-[10px] text-gray-600 mt-0.5">Your actual timing vs buying equal amounts every trading day from first to last lot</p>
        </div>
        <div className="flex items-start gap-5 text-right">
          {(() => {
            const valueDiff = totalActualValue - totalDcaValue;
            const valueDiffPct = totalDcaValue > 0 ? (valueDiff / totalDcaValue) * 100 : 0;
            return <>
              <StatCard label="Your Value" value={fmtUsd(totalActualValue)} />
              <StatCard label="DCA Value" value={fmtUsd(totalDcaValue)} />
              <StatCard label="Your Timing" value={fmtUsdAbs(valueDiff)}
                color={valueDiff >= 0 ? "text-emerald-400" : "text-red-400"}
                subValue={valueDiff >= 0 ? "better than DCA" : "DCA was better"}
                subColor={valueDiff >= 0 ? "text-emerald-400" : "text-red-400"} />
            </>;
          })()}
        </div>
      </div>

      {/* Timeline chart */}
      {isLoading && <div className="text-gray-500 text-center py-8">Loading...</div>}
      {timeline.length > 0 && (
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={timeline} margin={{ top: 0, right: -10, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="dcaDeltaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={deltaColor} stopOpacity={0.2} />
                <stop offset="95%" stopColor={deltaColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748b" }} tickFormatter={fmtDateShort} interval="preserveStartEnd" />
            <YAxis yAxisId="value" tick={{ fontSize: 11, fill: "#64748b" }} tickFormatter={fmtK} />
            <YAxis yAxisId="delta" orientation="right" tick={{ fontSize: 10, fill: "#475569" }} tickFormatter={fmtK} />
            <RechartsTooltip
              contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: "8px", fontSize: "12px" }}
              labelStyle={{ color: "#94a3b8" }}
              labelFormatter={(d: string) => fmtDate(d)}
              formatter={(value: number, name: string) => [
                `$${value.toLocaleString()}`,
                name === "actualValue" ? "Your Portfolio" : name === "dcaValue" ? "DCA Portfolio" : name === "delta" ? "Your Timing" : "Cost Basis",
              ]}
            />
            <Legend
              wrapperStyle={{ fontSize: "12px" }}
              formatter={(value: string) =>
                value === "actualValue" ? "Your Portfolio" : value === "dcaValue" ? "DCA Portfolio" : value === "delta" ? "Timing Delta" : value === "actualCost" ? "Cost Basis" : value
              }
            />
            <ReferenceLine yAxisId="delta" y={0} stroke="#475569" strokeDasharray="3 3" />
            <Area yAxisId="delta" type="monotone" dataKey="delta" fill="url(#dcaDeltaGrad)" stroke="#f59e0b" strokeWidth={1} dot={false} />
            <Line yAxisId="value" type="monotone" dataKey="actualCost" stroke="#64748b" strokeWidth={1} strokeDasharray="4 4" dot={false} />
            <Line yAxisId="value" type="monotone" dataKey="dcaValue" stroke="#06b6d4" strokeWidth={2} dot={false} />
            <Line yAxisId="value" type="monotone" dataKey="actualValue" stroke="#6366f1" strokeWidth={2.5} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      )}

      {/* Per-position table */}
      <div className="overflow-x-auto rounded-lg border border-gray-700 mt-4">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-700 bg-gray-800/50">
              {cols.map((col) => (
                <th key={col.key} onClick={() => setSort((s) => ({ col: col.key, dir: s.col === col.key && s.dir === "asc" ? "desc" : "asc" }))}
                  className={`text-${col.align} px-3 py-2 text-xs text-gray-500 uppercase cursor-pointer hover:text-gray-300 select-none whitespace-nowrap ${col.border ? "border-l border-gray-800" : ""}`}>
                  {col.key === "dcaSavingsPct" ? <Tooltip label="Your timing vs dollar-cost averaging. Positive = your entries beat buying equal amounts every trading day.">{col.label}</Tooltip> : col.label}
                  {sort.col === col.key ? (sort.dir === "asc" ? " ▲" : " ▼") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((pos) => {
              const pct = pos.valueDiffPct;
              return (
                <tr key={pos.ticker} onClick={() => onSelectTicker?.(pos.ticker)}
                  className={`border-b border-gray-800/50 ${onSelectTicker ? "cursor-pointer hover:bg-gray-800/30" : ""}`}>
                  <td className="px-3 py-2 text-white font-medium">{pos.ticker}{pos.singleLot && <span className="text-[9px] text-gray-600 ml-1">1 lot</span>}</td>
                  <td className="px-3 py-2 text-right text-gray-500">{pos.weight.toFixed(1)}%</td>
                  <td className="px-3 py-2 text-right text-gray-300">{fmtUsd(pos.actualCost)}</td>
                  <td className="px-3 py-2 text-right text-gray-300">{fmtUsd(pos.actualValue)}</td>
                  <td className="px-3 py-2 text-right text-gray-300 border-l border-gray-800">{fmtUsd(pos.dcaValue)}</td>
                  <td className={`px-3 py-2 text-right font-medium ${glColor(pos.valueDiff)}`}>{pos.valueDiff >= 0 ? "+" : ""}{fmtUsdAbs(pos.valueDiff)}</td>
                  <td className="px-3 py-2 border-l border-gray-800">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-24 h-2 bg-gray-800 rounded-full relative overflow-hidden">
                        <div className="absolute top-0 bottom-0 left-1/2 w-px bg-gray-600" />
                        {pct >= 0 ? (
                          <div className="absolute top-0 bottom-0 left-1/2 bg-emerald-500 rounded-r-full" style={{ width: `${Math.min(50, (pct / maxDiffPct) * 50)}%` }} />
                        ) : (
                          <div className="absolute top-0 bottom-0 bg-red-500 rounded-l-full" style={{ width: `${Math.min(50, (Math.abs(pct) / maxDiffPct) * 50)}%`, right: "50%" }} />
                        )}
                      </div>
                      <span className={`font-bold tabular-nums min-w-[60px] text-right ${pct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {pct >= 0 ? "+" : ""}{fmtPctAbs(pct)}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            {(() => {
              const totalValueDiff = totalActualValue - totalDcaValue;
              const totalValueDiffPct = totalDcaValue > 0 ? (totalValueDiff / totalDcaValue) * 100 : 0;
              return (
              <tr className="border-t border-gray-700 text-sm">
                <td className="px-3 py-3 text-white font-semibold">Total</td>
                <td className="px-3 py-3 text-right text-gray-500">100%</td>
                <td className="px-3 py-3 text-right text-white font-semibold">{fmtUsd(totalCost)}</td>
                <td className="px-3 py-3 text-right text-white font-semibold">{fmtUsd(totalActualValue)}</td>
                <td className="px-3 py-3 text-right text-white font-semibold border-l border-gray-800">{fmtUsd(totalDcaValue)}</td>
                <td className={`px-3 py-3 text-right font-bold ${glColor(totalValueDiff)}`}>{totalValueDiff >= 0 ? "+" : ""}{fmtUsdAbs(totalValueDiff)}</td>
                <td className={`px-3 py-3 text-right font-bold border-l border-gray-800 ${totalValueDiffPct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {totalValueDiffPct >= 0 ? "+" : ""}{fmtPctAbs(totalValueDiffPct)}
                </td>
              </tr>
              );
            })()}
          </tfoot>
        </table>
      </div>
    </div>
  );
}

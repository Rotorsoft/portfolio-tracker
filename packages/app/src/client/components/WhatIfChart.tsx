import { useState, useEffect } from "react";
import { ResponsiveContainer, ComposedChart, Line, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ReferenceLine } from "recharts";
import { trpc } from "../trpc.js";
import { DateInput } from "./DateInput.js";
import { fmtDate, fmtDateShort } from "../fmt.js";

export function WhatIfChart({ portfolioId, cutoffDate, onSelectTicker }: { portfolioId: string; cutoffDate: string; onSelectTicker?: (ticker: string) => void }) {
  const [whatIfDate, setWhatIfDate] = useState(cutoffDate || "2024-01-02");
  useEffect(() => { if (cutoffDate) setWhatIfDate(cutoffDate); }, [cutoffDate]);
  const [wiSort, setWiSort] = useState<{ col: string; dir: "asc" | "desc" }>({ col: "absDiff", dir: "desc" });
  const { data, isLoading } = trpc.getWhatIfComparison.useQuery(
    { portfolioId, whatIfDate, from: whatIfDate && !isNaN(new Date(whatIfDate).getTime()) ? new Date(new Date(whatIfDate).getTime() - 7 * 86400000).toISOString().split("T")[0] : whatIfDate },
    { enabled: !!whatIfDate && !isNaN(new Date(whatIfDate).getTime()) }
  );

  const fmt = (n: number) => `$${(n / 1000).toFixed(1)}k`;
  const fmtFull = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-4">
        <h3 className="text-sm font-medium text-gray-400">
          What If I Bought Everything On
        </h3>
        <DateInput value={whatIfDate} onChange={setWhatIfDate} />
      </div>

      {/* Summary cards */}
      {data && data.positions.length > 0 && (() => {
        const totalActual = data.positions.reduce((s, p) => s + p.actualCost, 0);
        const totalWhatIf = data.positions.reduce((s, p) => s + p.whatIfCost, 0);
        const totalDiff = totalActual - totalWhatIf;
        const totalPct = totalWhatIf > 0 ? (totalDiff / totalWhatIf) * 100 : 0;
        const last = data.timeline.at(-1);
        const actualValue = last?.actualValue ?? 0;
        const whatIfValue = last?.whatIfValue ?? 0;
        const actualGL = actualValue - totalActual;
        const whatIfGL = whatIfValue - totalWhatIf;

        return (
          <>
            {/* Totals */}
            <div className="flex flex-wrap gap-3 mb-3">
              <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
                <div className="text-xs text-gray-500">Cost Basis</div>
                <div className="text-sm font-semibold text-white">{fmtFull(totalActual)}</div>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
                <div className="text-xs text-gray-500">What-If Cost</div>
                <div className="text-sm font-semibold text-white">{fmtFull(totalWhatIf)}</div>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
                <div className="text-xs text-gray-500">Actual G/L</div>
                <div className={`text-sm font-semibold ${actualGL >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {fmtFull(actualGL)} ({totalActual > 0 ? ((actualGL / totalActual) * 100).toFixed(1) : 0}%)
                </div>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
                <div className="text-xs text-gray-500">What-If G/L</div>
                <div className={`text-sm font-semibold ${whatIfGL >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {fmtFull(whatIfGL)} ({totalWhatIf > 0 ? ((whatIfGL / totalWhatIf) * 100).toFixed(1) : 0}%)
                </div>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-3 border border-indigo-500/50">
                <div className="text-xs text-gray-500">Your Timing</div>
                {(() => {
                  const advantage = actualGL - whatIfGL;
                  return (
                    <div className={`text-sm font-semibold ${advantage >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {advantage >= 0 ? "+" : ""}{fmtFull(advantage)}
                      <span className="text-xs ml-1">{advantage >= 0 ? "better" : "worse"}</span>
                    </div>
                  );
                })()}
              </div>
            </div>

          </>
        );
      })()}

      {/* Chart */}
      {isLoading && <div className="text-gray-500 text-center py-8">Loading...</div>}
      {data && data.timeline.length > 0 && (() => {
        const lastEntry = data.timeline.at(-1);
        const whatIfGLNeg = (lastEntry?.whatIfGL ?? 0) < 0;
        const timingColor = ((lastEntry?.actualGL ?? 0) - (lastEntry?.whatIfGL ?? 0)) >= 0 ? "#10b981" : "#ef4444";
        // Add timing delta to timeline data
        const chartData = data.timeline.map((d) => ({
          ...d,
          timingDelta: d.actualGL - d.whatIfGL,
        }));
        return (
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <defs>
                <linearGradient id="timingGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={timingColor} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={timingColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: "#64748b" }}
                tickFormatter={fmtDateShort}
                interval="preserveStartEnd"
              />
              <YAxis yAxisId="value" tick={{ fontSize: 11, fill: "#64748b" }} tickFormatter={fmt} />
              <YAxis yAxisId="delta" orientation="right" tick={{ fontSize: 10, fill: "#475569" }}
                tickFormatter={(v: number) => `${v >= 0 ? "+" : ""}${(v / 1000).toFixed(1)}k`} />
              <Tooltip
                contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: "8px", fontSize: "12px" }}
                labelStyle={{ color: "#94a3b8" }}
                labelFormatter={(d: string) => fmtDate(d)}
                formatter={(value: number, name: string) => {
                  if (name === "timingDelta") return [`$${value.toLocaleString()}`, "Your Timing"];
                  return [
                    `$${value.toLocaleString()}`,
                    name === "actualValue" ? "Actual Value" : name === "whatIfValue" ? "What-If Value" : name === "actualCost" ? "Cost Basis" : "What-If Cost",
                  ];
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: "12px" }}
                formatter={(value: string) =>
                  value === "actualValue" ? "Actual Portfolio" : value === "whatIfValue" ? `What-If (${fmtDate(whatIfDate)})` : value === "timingDelta" ? "Timing Delta" : value === "actualCost" ? "Cost Basis" : value
                }
              />
              <ReferenceLine yAxisId="value" x={whatIfDate} stroke="#f59e0b" strokeDasharray="5 5" label={{ value: "Buy date", fill: "#f59e0b", fontSize: 11 }} />
              <ReferenceLine yAxisId="value" y={data.timeline[0]?.whatIfCost ?? 0} stroke="#94a3b8" strokeOpacity={0.3} label={{ value: `What-If Cost`, position: "insideTopRight", fill: "#64748b", fontSize: 10 }} />
              <ReferenceLine yAxisId="delta" y={0} stroke="#475569" strokeDasharray="3 3" />
              {cutoffDate && cutoffDate !== whatIfDate && <ReferenceLine yAxisId="value" x={cutoffDate} stroke="#f59e0b" strokeDasharray="3 3" strokeOpacity={0.5} label={{ value: "Cutoff", fill: "#f59e0b", fontSize: 9, position: "insideTopLeft" }} />}
              <Area yAxisId="delta" type="monotone" dataKey="timingDelta" fill="url(#timingGrad)" stroke={timingColor} strokeWidth={1} dot={false} />
              <Line yAxisId="value" type="monotone" dataKey="actualCost" stroke="#64748b" strokeWidth={1} strokeDasharray="4 4" dot={false} />
              <Line yAxisId="value" type="monotone" dataKey="actualValue" stroke="#6366f1" strokeWidth={2} dot={false} />
              <Line yAxisId="value" type="monotone" dataKey="whatIfValue" stroke={whatIfGLNeg ? "#ef4444" : "#10b981"} strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        );
      })()}
      {data && data.timeline.length === 0 && (
        <div className="text-gray-500 text-center py-8">No price data available. Backfill prices first.</div>
      )}

      {/* Per-ticker breakdown table */}
      {data && data.positions.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-gray-700 mt-4">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-700 bg-gray-800/50">
                {([
                  { key: "ticker", label: "Ticker", align: "left" },
                  { key: "actualShares", label: "Shares", align: "right" },
                  { key: "avgCost", label: "Avg Cost", align: "right" },
                  { key: "actualCost", label: "Total Cost", align: "right" },
                  { key: "avgWhatIf", label: "What-If Avg", align: "right" },
                  { key: "whatIfCost", label: "What-If Total", align: "right" },
                  { key: "diff", label: "Difference", align: "right" },
                  { key: "diffPct", label: "Diff %", align: "right" },
                ] as const).map((col) => (
                  <th key={col.key} onClick={() => setWiSort((s) => ({ col: col.key, dir: s.col === col.key && s.dir === "asc" ? "desc" : "asc" }))}
                    className={`text-${col.align} px-3 py-2 text-xs text-gray-500 uppercase cursor-pointer hover:text-gray-300 select-none whitespace-nowrap`}>
                    {col.label}{wiSort.col === col.key ? (wiSort.dir === "asc" ? " ▲" : " ▼") : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...data.positions].map((p) => ({ ...p, diff: p.actualCost - p.whatIfCost, absDiff: Math.abs(p.actualCost - p.whatIfCost), diffPct: p.whatIfCost > 0 ? ((p.actualCost - p.whatIfCost) / p.whatIfCost) * 100 : 0, avgCost: p.actualShares > 0 ? p.actualCost / p.actualShares : 0, avgWhatIf: p.actualShares > 0 ? p.whatIfCost / p.actualShares : 0 }))
                .sort((a, b) => {
                  const av = (a as any)[wiSort.col] ?? 0;
                  const bv = (b as any)[wiSort.col] ?? 0;
                  const cmp = typeof av === "string" ? av.localeCompare(bv) : av - bv;
                  return wiSort.dir === "asc" ? cmp : -cmp;
                })
                .map((p) => (
                <tr key={p.ticker} onClick={() => onSelectTicker?.(p.ticker)}
                  className={`border-b border-gray-800/50 ${onSelectTicker ? "cursor-pointer hover:bg-gray-800/30" : ""}`}>
                  <td className="px-3 py-2 font-medium text-white">{p.ticker}</td>
                  <td className="px-3 py-2 text-right text-gray-300">{p.actualShares}</td>
                  <td className="px-3 py-2 text-right text-gray-300">{fmtFull(p.avgCost)}</td>
                  <td className="px-3 py-2 text-right text-gray-300">{fmtFull(p.actualCost)}</td>
                  <td className={`px-3 py-2 text-right ${p.avgWhatIf > p.avgCost ? "text-red-400" : p.avgWhatIf < p.avgCost ? "text-emerald-400" : "text-gray-300"}`}>{fmtFull(p.avgWhatIf)}</td>
                  <td className={`px-3 py-2 text-right ${p.whatIfCost > p.actualCost ? "text-red-400" : p.whatIfCost < p.actualCost ? "text-emerald-400" : "text-gray-300"}`}>{fmtFull(p.whatIfCost)}</td>
                  <td className={`px-3 py-2 text-right font-medium ${p.diff > 0 ? "text-red-400" : p.diff < 0 ? "text-emerald-400" : "text-gray-400"}`}>
                    {fmtFull(Math.abs(p.diff))}
                  </td>
                  <td className={`px-3 py-2 text-right font-medium ${p.diffPct > 0 ? "text-red-400" : p.diffPct < 0 ? "text-emerald-400" : "text-gray-400"}`}>
                    {Math.abs(p.diffPct).toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

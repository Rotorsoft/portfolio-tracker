import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, CartesianGrid, ReferenceLine, Cell } from "recharts";
import { trpc } from "../trpc.js";
import { fmtUsd, fmtUsdAbs, fmtPctAbs, glColor } from "../fmt.js";
import { StatCard } from "./StatCard.js";
import { Tooltip } from "./Tooltip.js";

export function BenchmarkChart({ portfolioId }: { portfolioId: string }) {
  const { data: summary } = trpc.getPortfolioSummary.useQuery({ portfolioId });

  if (!summary || summary.positions.length === 0) {
    return <div className="text-gray-500 text-center py-8">No positions to analyze.</div>;
  }

  const { totalCost, totalMarketValue, totalBenchmarkValue, portfolioBenchmarkReturnPct, portfolioAlphaPct } = summary;
  const actualReturnPct = totalCost > 0 ? ((totalMarketValue - totalCost) / totalCost) * 100 : 0;
  const actualGL = totalMarketValue - totalCost;
  const benchmarkGL = (totalBenchmarkValue ?? 0) - totalCost;

  const sorted = [...summary.positions].sort((a, b) => (b.alphaPct ?? 0) - (a.alphaPct ?? 0));
  const maxAlpha = Math.max(...sorted.map((p) => Math.abs(p.alphaPct ?? 0)), 1);

  // Chart data
  const chartData = sorted.map((p) => ({
    ticker: p.ticker,
    alpha: Math.round((p.alphaPct ?? 0) * 100) / 100,
    actual: Math.round((p.actualReturnPct ?? 0) * 100) / 100,
    benchmark: Math.round((p.benchmarkReturnPct ?? 0) * 100) / 100,
  }));

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-sm font-medium text-gray-400">Benchmark vs S&P 500 (VOO)</h3>
          <p className="text-[10px] text-gray-600 mt-0.5">Compares your actual returns against investing the same $ on the same dates into VOO</p>
        </div>
        <div className="flex items-start gap-5 text-right">
          <StatCard size="sm" label="Your Return" value={fmtPctAbs(actualReturnPct)} color={glColor(actualGL)}
            subValue={fmtUsdAbs(actualGL)} subColor={glColor(actualGL)} />
          <StatCard size="sm" label="S&P 500" value={fmtPctAbs(portfolioBenchmarkReturnPct ?? 0)} color={glColor(benchmarkGL)}
            subValue={fmtUsdAbs(benchmarkGL)} subColor={glColor(benchmarkGL)} />
          <StatCard size="sm" label="Alpha" value={`${(portfolioAlphaPct ?? 0) >= 0 ? "+" : ""}${fmtPctAbs(portfolioAlphaPct ?? 0)}`}
            color={(portfolioAlphaPct ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}
            subValue={(portfolioAlphaPct ?? 0) >= 0 ? "outperforming" : "underperforming"}
            subColor={(portfolioAlphaPct ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"} />
        </div>
      </div>

      {/* Alpha bar chart */}
      <ResponsiveContainer width="100%" height={Math.max(200, sorted.length * 32 + 40)}>
        <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 20, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 11, fill: "#64748b" }} tickFormatter={(v: number) => `${v}%`} />
          <YAxis type="category" dataKey="ticker" tick={{ fontSize: 11, fill: "#e2e8f0", fontWeight: 500 }} width={50} />
          <ReferenceLine x={0} stroke="#475569" />
          <RechartsTooltip
            contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: "8px", fontSize: "12px" }}
            formatter={(value: number, name: string) => [
              `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`,
              name === "alpha" ? "Alpha" : name === "actual" ? "Your Return" : "S&P 500",
            ]}
          />
          <Bar dataKey="alpha" radius={[0, 4, 4, 0]}>
            {chartData.map((d, i) => (
              <Cell key={i} fill={d.alpha >= 0 ? "#10b981" : "#ef4444"} fillOpacity={0.7} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Per-position table */}
      <div className="overflow-x-auto mt-4">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-700 bg-gray-800/50">
              <th className="text-left px-3 py-2 text-gray-500 uppercase">Ticker</th>
              <th className="text-right px-3 py-2 text-gray-500 uppercase">Cost</th>
              <th className="text-right px-3 py-2 text-gray-500 uppercase">Your Value</th>
              <th className="text-right px-3 py-2 text-gray-500 uppercase">Your Return</th>
              <th className="text-right px-3 py-2 text-gray-500 uppercase border-l border-gray-800">VOO Value</th>
              <th className="text-right px-3 py-2 text-gray-500 uppercase">VOO Return</th>
              <th className="text-right px-3 py-2 text-gray-500 uppercase border-l border-gray-800">
                <Tooltip label="Alpha = your return % minus what S&P 500 would have returned on the same investment dates and amounts">Alpha</Tooltip>
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((pos) => {
              const posGL = pos.marketValue - (pos.totalShares * pos.avgCostBasis);
              const posBenchGL = (pos.benchmarkValue ?? 0) - (pos.benchmarkCost ?? 0);
              const alpha = pos.alphaPct ?? 0;
              return (
                <tr key={pos.ticker} className="border-b border-gray-800/50">
                  <td className="px-3 py-2 text-white font-medium">{pos.ticker}</td>
                  <td className="px-3 py-2 text-right text-gray-300">{fmtUsd(pos.totalShares * pos.avgCostBasis)}</td>
                  <td className="px-3 py-2 text-right text-gray-300">{fmtUsd(pos.marketValue)}</td>
                  <td className={`px-3 py-2 text-right font-medium ${glColor(posGL)}`}>{fmtPctAbs(pos.actualReturnPct ?? 0)}</td>
                  <td className={`px-3 py-2 text-right text-gray-300 border-l border-gray-800`}>{fmtUsd(pos.benchmarkValue ?? 0)}</td>
                  <td className={`px-3 py-2 text-right font-medium ${glColor(posBenchGL)}`}>{fmtPctAbs(pos.benchmarkReturnPct ?? 0)}</td>
                  <td className="px-3 py-2 border-l border-gray-800">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 h-1.5 bg-gray-800 rounded-full overflow-hidden flex">
                        {alpha >= 0 ? (
                          <div className="h-full bg-emerald-500 rounded-full ml-auto" style={{ width: `${Math.min(100, (alpha / maxAlpha) * 100)}%` }} />
                        ) : (
                          <div className="h-full bg-red-500 rounded-full" style={{ width: `${Math.min(100, (Math.abs(alpha) / maxAlpha) * 100)}%` }} />
                        )}
                      </div>
                      <span className={`font-bold tabular-nums ${alpha >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {alpha >= 0 ? "+" : ""}{fmtPctAbs(alpha)}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-gray-700">
              <td className="px-3 py-2 text-white font-medium">Total</td>
              <td className="px-3 py-2 text-right text-white font-medium">{fmtUsd(totalCost)}</td>
              <td className="px-3 py-2 text-right text-white font-medium">{fmtUsd(totalMarketValue)}</td>
              <td className={`px-3 py-2 text-right font-bold ${glColor(actualGL)}`}>{fmtPctAbs(actualReturnPct)}</td>
              <td className={`px-3 py-2 text-right text-white font-medium border-l border-gray-800`}>{fmtUsd(totalBenchmarkValue ?? 0)}</td>
              <td className={`px-3 py-2 text-right font-bold ${glColor(benchmarkGL)}`}>{fmtPctAbs(portfolioBenchmarkReturnPct ?? 0)}</td>
              <td className={`px-3 py-2 text-right font-bold border-l border-gray-800 ${(portfolioAlphaPct ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {(portfolioAlphaPct ?? 0) >= 0 ? "+" : ""}{fmtPctAbs(portfolioAlphaPct ?? 0)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {(totalBenchmarkValue ?? 0) === 0 && (
        <p className="text-amber-400 text-xs mt-3">VOO price data not found. Backfill VOO prices from the Price Data tab to see benchmark comparison.</p>
      )}
    </div>
  );
}

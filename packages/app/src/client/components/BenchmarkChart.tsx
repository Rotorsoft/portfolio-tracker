import { useState } from "react";
import { trpc } from "../trpc.js";
import { fmtUsd, fmtUsdAbs, fmtPctAbs, glColor } from "../fmt.js";
import { StatCard } from "./StatCard.js";
import { Tooltip } from "./Tooltip.js";

type Props = { portfolioId: string; onSelectTicker?: (ticker: string) => void };

export function BenchmarkChart({ portfolioId, onSelectTicker }: Props) {
  const { data: summary } = trpc.getPortfolioSummary.useQuery({ portfolioId });
  const [sort, setSort] = useState<{ col: string; dir: "asc" | "desc" }>({ col: "alphaPct", dir: "desc" });

  if (!summary || summary.positions.length === 0) {
    return <div className="text-gray-500 text-center py-8">No positions to analyze.</div>;
  }

  const { totalCost, totalMarketValue, totalBenchmarkValue, portfolioBenchmarkReturnPct, portfolioAlphaPct } = summary;
  const actualReturnPct = totalCost > 0 ? ((totalMarketValue - totalCost) / totalCost) * 100 : 0;
  const actualGL = totalMarketValue - totalCost;
  const benchmarkGL = (totalBenchmarkValue ?? 0) - totalCost;
  const maxAlpha = Math.max(...summary.positions.map((p) => Math.abs(p.alphaPct ?? 0)), 1);

  const cols: { key: string; label: string; align: string; border?: boolean }[] = [
    { key: "ticker", label: "Ticker", align: "left" },
    { key: "weight", label: "Weight", align: "right" },
    { key: "cost", label: "Cost", align: "right" },
    { key: "marketValue", label: "Your Value", align: "right" },
    { key: "actualReturnPct", label: "Your Return", align: "right" },
    { key: "benchmarkValue", label: "VOO Value", align: "right", border: true },
    { key: "benchmarkReturnPct", label: "VOO Return", align: "right" },
    { key: "alphaPct", label: "Alpha", align: "right", border: true },
  ];

  const rows = [...summary.positions].map((p) => ({
    ...p,
    cost: p.totalShares * p.avgCostBasis,
    weight: totalCost > 0 ? (p.totalShares * p.avgCostBasis) / totalCost * 100 : 0,
  })).sort((a, b) => {
    const av = (a as any)[sort.col] ?? 0;
    const bv = (b as any)[sort.col] ?? 0;
    const cmp = typeof av === "string" ? av.localeCompare(bv) : av - bv;
    return sort.dir === "asc" ? cmp : -cmp;
  });

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-sm font-medium text-gray-400">Attribution — Alpha vs S&P 500 (VOO)</h3>
          <p className="text-[10px] text-gray-600 mt-0.5">How much each position contributed vs investing the same $ on the same dates into VOO</p>
        </div>
        <div className="flex items-start gap-5 text-right">
          <StatCard label="Your Return" value={fmtPctAbs(actualReturnPct)} color={glColor(actualGL)}
            subValue={fmtUsdAbs(actualGL)} subColor={glColor(actualGL)} />
          <StatCard label="S&P 500" value={fmtPctAbs(portfolioBenchmarkReturnPct ?? 0)} color={glColor(benchmarkGL)}
            subValue={fmtUsdAbs(benchmarkGL)} subColor={glColor(benchmarkGL)} />
          <StatCard label="Alpha" value={`${(portfolioAlphaPct ?? 0) >= 0 ? "+" : ""}${fmtPctAbs(portfolioAlphaPct ?? 0)}`}
            color={(portfolioAlphaPct ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}
            subValue={(portfolioAlphaPct ?? 0) >= 0 ? "outperforming" : "underperforming"}
            subColor={(portfolioAlphaPct ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"} />
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-700">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-700 bg-gray-800/50">
              {cols.map((col) => (
                <th key={col.key} onClick={() => setSort((s) => ({ col: col.key, dir: s.col === col.key && s.dir === "asc" ? "desc" : "asc" }))}
                  className={`text-${col.align} px-3 py-2 text-xs text-gray-500 uppercase cursor-pointer hover:text-gray-300 select-none whitespace-nowrap ${col.border ? "border-l border-gray-800" : ""}`}>
                  {col.key === "alphaPct" ? <Tooltip label="Alpha = your return % minus what S&P 500 would have returned on the same dates and amounts">{col.label}</Tooltip> : col.label}
                  {sort.col === col.key ? (sort.dir === "asc" ? " ▲" : " ▼") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((pos) => {
              const posGL = pos.marketValue - pos.cost;
              const posBenchGL = (pos.benchmarkValue ?? 0) - (pos.benchmarkCost ?? 0);
              const alpha = pos.alphaPct ?? 0;
              return (
                <tr key={pos.ticker} onClick={() => onSelectTicker?.(pos.ticker)}
                  className={`border-b border-gray-800/50 ${onSelectTicker ? "cursor-pointer hover:bg-gray-800/30" : ""}`}>
                  <td className="px-3 py-2 text-white font-medium">{pos.ticker}</td>
                  <td className="px-3 py-2 text-right text-gray-500">{pos.weight.toFixed(1)}%</td>
                  <td className="px-3 py-2 text-right text-gray-300">{fmtUsd(pos.cost)}</td>
                  <td className="px-3 py-2 text-right text-gray-300">{fmtUsd(pos.marketValue)}</td>
                  <td className={`px-3 py-2 text-right font-medium ${glColor(posGL)}`}>{fmtPctAbs(pos.actualReturnPct ?? 0)}</td>
                  <td className="px-3 py-2 text-right text-gray-300 border-l border-gray-800">{fmtUsd(pos.benchmarkValue ?? 0)}</td>
                  <td className={`px-3 py-2 text-right font-medium ${glColor(posBenchGL)}`}>{fmtPctAbs(pos.benchmarkReturnPct ?? 0)}</td>
                  <td className="px-3 py-2 border-l border-gray-800">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-24 h-2 bg-gray-800 rounded-full relative overflow-hidden">
                        <div className="absolute top-0 bottom-0 left-1/2 w-px bg-gray-600" />
                        {alpha >= 0 ? (
                          <div className="absolute top-0 bottom-0 left-1/2 bg-emerald-500 rounded-r-full" style={{ width: `${Math.min(50, (alpha / maxAlpha) * 50)}%` }} />
                        ) : (
                          <div className="absolute top-0 bottom-0 bg-red-500 rounded-l-full" style={{ width: `${Math.min(50, (Math.abs(alpha) / maxAlpha) * 50)}%`, right: "50%" }} />
                        )}
                      </div>
                      <span className={`font-bold tabular-nums min-w-[60px] text-right ${alpha >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {alpha >= 0 ? "+" : ""}{fmtPctAbs(alpha)}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-gray-700 text-sm">
              <td className="px-3 py-3 text-white font-semibold">Total</td>
              <td className="px-3 py-3 text-right text-gray-500">100%</td>
              <td className="px-3 py-3 text-right text-white font-semibold">{fmtUsd(totalCost)}</td>
              <td className="px-3 py-3 text-right text-white font-semibold">{fmtUsd(totalMarketValue)}</td>
              <td className={`px-3 py-3 text-right font-bold ${glColor(actualGL)}`}>{fmtPctAbs(actualReturnPct)}</td>
              <td className="px-3 py-3 text-right text-white font-semibold border-l border-gray-800">{fmtUsd(totalBenchmarkValue ?? 0)}</td>
              <td className={`px-3 py-3 text-right font-bold ${glColor(benchmarkGL)}`}>{fmtPctAbs(portfolioBenchmarkReturnPct ?? 0)}</td>
              <td className={`px-3 py-3 text-right font-bold border-l border-gray-800 ${(portfolioAlphaPct ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
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

import { useState } from "react";
import { Plus, Trash2, Lightbulb, ExternalLink } from "lucide-react";
import { Tooltip } from "../components/Tooltip.js";
import { trpc } from "../trpc.js";
import { TickerChart } from "../components/TickerChart.js";

import { fmtDate, fmtUsd, fmtUsdAbs, fmtPctAbs, glColor } from "../fmt.js";
import { FiftyTwoWeekBar } from "../components/FiftyTwoWeekBar.js";
import { Modal } from "../components/Modal.js";
import { AddSingleLotForm } from "../components/AddForms.js";
import { getLiveAlerts, liveDayChange, livePositionGL, lastBuyPrice, avgDownOpportunity, avgDownColor, gradeColor, shouldPollQuotes } from "../live.js";

type Props = { positionId: string; portfolioId: string; ticker: string; cutoffDate?: string; dipThreshold?: number };

type KV = { label: string; value: React.ReactNode; color?: string; tooltip?: React.ReactNode };

function KVRow({ kv }: { kv: KV }) {
  return (
    <div className="flex justify-between py-[3px] border-b border-gray-800/50 last:border-0">
      <span className="text-[11px] text-gray-500">{kv.tooltip ? <Tooltip label={kv.tooltip} icon>{kv.label}</Tooltip> : kv.label}</span>
      <span className={`text-[11px] font-medium ${kv.color ?? "text-white"}`}>{kv.value}</span>
    </div>
  );
}

export function PositionDetail({ positionId, portfolioId, ticker, cutoffDate, dipThreshold = 5 }: Props) {
  const { data: position } = trpc.getPosition.useQuery({ positionId });
  const { data: tickerInfo } = trpc.getTicker.useQuery({ symbol: ticker });
  const { data: liveQuotes } = trpc.getQuotes.useQuery(
    { symbols: [ticker] },
    { refetchInterval: shouldPollQuotes() ? 300_000 : false }
  );
  const liveQuote = liveQuotes?.[ticker];
  const { data: entry } = trpc.getEntryAnalysis.useQuery({ positionId });
  const { data: fundamentals } = trpc.getFundamentals.useQuery({ symbol: ticker }, { staleTime: 5 * 60 * 1000 });

  const removeMutation = trpc.removeLot.useMutation();
  const utils = trpc.useUtils();
  const [showAdd, setShowAdd] = useState(false);
  const [highlightLot, setHighlightLot] = useState<{ date: string; price: number; type: string } | null>(null);

  const handleRemoveLot = async (lotId: string) => {
    await removeMutation.mutateAsync({ portfolioId, ticker, lotId });
    utils.getPosition.invalidate();
    utils.getPortfolioSummary.invalidate();
    utils.getEntryAnalysis.invalidate();
  };

  if (!position) return <div className="text-gray-500">Loading...</div>;

  const S = {
    title: "text-base font-semibold tracking-wide mb-1.5 text-center",
    row: "flex gap-4 justify-center",
    cell: "text-center whitespace-nowrap",
    label: "text-[10px] text-gray-500",
    val: "text-sm font-semibold",
  };

  // Lot grades come from server (entry?.analysis?.lots[].grade)
  const entryLots = entry?.analysis?.lots ?? [];
  const lotGradeMap = new Map(entryLots.map((l: any) => [l.lotId, l]));

  return (
    <div>

      {(() => {
        const shares = position.totalShares ?? 0;
        const cost = position.totalCost ?? 0;
        const avgCost = position.avgCostBasis ?? 0;
        const currentPrice = liveQuote?.price ?? tickerInfo?.lastClose ?? 0;
        const pc = liveQuote?.previousClose ?? tickerInfo?.previousClose ?? 0;
        const dayChg = pc > 0 ? currentPrice - pc : 0;
        const { mv: marketValue, gl: unrealizedGL, glPct } = livePositionGL(shares, avgCost, currentPrice);

        const a = entry?.analysis;
        const f = fundamentals;
        const ti = tickerInfo;

        const hasFundamentals = f && (f.trailingPE != null || f.epsTrailing != null || f.dividendYield != null || f.marketCap != null || f.sector);

        const grade = position.entryGrade ?? "C";
        const gradeScore = position.entryGradeScore ?? 50;
        const gradeText = grade === "A" || grade === "B" ? "text-emerald-400" : grade === "C" ? "text-amber-400" : "text-red-400";
        const sigColor = ti?.signal?.includes("buy") ? "text-emerald-400" : ti?.signal?.includes("sell") ? "text-red-400" : "text-gray-400";
        const priceMa50 = ti && ti.ma50 > 0 ? ((currentPrice - ti.ma50) / ti.ma50 * 100) : 0;
        const priceMa200 = ti && ti.ma200 > 0 ? ((currentPrice - ti.ma200) / ti.ma200 * 100) : 0;
        const gc = ti ? ti.ma50 > ti.ma200 && ti.ma200 > 0 : false;
        const dc = ti ? ti.ma50 < ti.ma200 && ti.ma200 > 0 : false;
        const rsiLabel = ti ? ((ti.rsi14 ?? 50) < 30 ? "oversold" : (ti.rsi14 ?? 50) > 70 ? "overbought" : "") : "";

        // Key-value pairs organized in 2 groups × 2 columns
        // Group 1: Holdings — col1 = position, col2 = market
        const holdCol1: KV[] = [
          { label: "Shares", value: `${shares.toLocaleString()} @ ${fmtUsd(avgCost)}` },
          { label: "Cost", value: fmtUsd(cost) },
          { label: "Value", value: currentPrice > 0 ? fmtUsd(marketValue) : "—" },
          { label: "G/L", value: currentPrice > 0 ? `${fmtUsdAbs(unrealizedGL)} (${fmtPctAbs(glPct)})` : "—", color: currentPrice > 0 ? glColor(unrealizedGL) : undefined },
        ];
        const holdCol2: KV[] = [];
        if (ti) {
          holdCol2.push({ label: "52wk Range", value: <FiftyTwoWeekBar low={ti.yearlyLow} high={ti.yearlyHigh} current={currentPrice} avgCost={avgCost} dayChange={dayChg} width="w-20" /> });
          holdCol2.push({ label: "Volatility", value: `${ti.volatility30d.toFixed(1)}%`, tooltip: "30-day annualized volatility — the standard deviation of daily returns, scaled to a yearly rate. Measures how much the price swings. Higher % = more risk/opportunity. Typical stocks: 15-30%, high-growth: 40%+, stable blue chips: 10-15%." });
        }
        if (hasFundamentals) {
          if (f.trailingPE != null) holdCol2.push({ label: "P/E (TTM)", value: f.trailingPE.toFixed(1) });
          if (f.dividendYield != null) holdCol2.push({ label: "Yield", value: `${(f.dividendYield * 100).toFixed(2)}%` });
        }

        // Group 2: Analysis — col1 = entry, col2 = signal
        const analCol1: KV[] = [];
        if (a) {
          analCol1.push({ label: "Grade Score", value: `${gradeScore.toFixed(0)}/100`, color: gradeText, tooltip: "Weighted composite of RSI (25%), Bollinger position (20%), MA trend (20%), price timing (20%), and volume (15%) at time of your average entry." });
          analCol1.push({ label: "Timing Score", value: `${a.timingScore.toFixed(0)}%`, color: a.timingScore >= 66 ? "text-emerald-400" : a.timingScore >= 33 ? "text-amber-400" : "text-red-400", tooltip: "Where your average entry price sits in the price range during your holding period. 100% = you bought at the period low (perfect timing). 0% = you bought at the period high. Above 66% is great, below 33% is poor." });
          analCol1.push({ label: "vs DCA", value: `${Math.abs(a.dcaSavingsPct).toFixed(1)}%`, color: glColor(a.dcaSavingsPct), tooltip: "Compares your actual average entry price to what it would have been if you had dollar-cost averaged (bought equal amounts every trading day from your first to last lot). Green = you beat DCA. Red = DCA would have been cheaper." });
          analCol1.push({ label: "Max Drawdown", value: position.maxDrawdown > 0 ? `${position.maxDrawdown.toFixed(1)}% (${position.daysUnderwater}d)` : "—", color: "text-red-400", tooltip: "The largest peak-to-trough percentage decline since your first purchase. Days underwater = total trading days the price closed below your average entry. Lower is better — indicates less pain during your holding period." });
          const lbp = lastBuyPrice(position.lots ?? []);
          if (lbp > 0) {
            const opp = avgDownOpportunity(lbp, currentPrice, avgCost, shares);
            if (opp && avgDownColor(opp.gapPct, dipThreshold)) {
              analCol1.push({ label: "Avg Down", value: `${fmtPctAbs(opp.gapPct)} below last buy`, color: avgDownColor(opp.gapPct, dipThreshold), tooltip: <div className="space-y-1.5"><div className="text-gray-200 font-semibold whitespace-nowrap">{fmtUsd(currentPrice)} is {fmtPctAbs(opp.gapPct)} below last buy at {fmtUsd(lbp)}</div><table className="text-[11px] w-full"><thead><tr><td className="text-gray-600 pr-3 pb-0.5">Buy</td><td className="text-gray-600 text-right pb-0.5">Cost</td><td className="text-gray-600 text-right pb-0.5">New Avg</td><td className="text-gray-600 text-right pb-0.5">Avg Cut</td></tr></thead><tbody>{opp.scenarios.map((s, i) => <tr key={i}><td className="text-gray-300 pr-3 py-0.5">{s.addShares} shares</td><td className="text-gray-300 text-right">{fmtUsd(s.addCost)}</td><td className="text-white text-right font-medium">{fmtUsd(s.newAvg)}</td><td className="text-emerald-400 text-right">{fmtPctAbs(s.costReduction)}</td></tr>)}</tbody></table><div className="text-[10px] text-gray-500">Current avg: {fmtUsd(avgCost)} · {shares} shares</div></div> });
            }
          }
        }
        const analCol2: KV[] = [];
        if (ti) {
          analCol2.push({ label: "RSI (14)", value: `${(ti.rsi14 ?? 50).toFixed(0)}${rsiLabel ? ` ${rsiLabel}` : ""}`, color: (ti.rsi14 ?? 50) < 30 ? "text-emerald-400" : (ti.rsi14 ?? 50) > 70 ? "text-red-400" : undefined, tooltip: "Relative Strength Index — momentum oscillator over 14 trading days (industry standard). Below 30 = oversold (price dropped too fast, may bounce). Above 70 = overbought (price rose too fast, may pull back)." });
          analCol2.push({ label: "vs MA50", value: `${Math.abs(priceMa50).toFixed(1)}%`, color: priceMa50 >= 0 ? "text-emerald-400" : "text-red-400", tooltip: "Current price vs 50-day Simple Moving Average (short-term trend). Above = uptrend, below = downtrend. The 50-day MA smooths out daily noise to reveal the underlying direction." });
          analCol2.push({ label: "vs MA200", value: ti.ma200 > 0 ? `${Math.abs(priceMa200).toFixed(1)}%` : "—", color: priceMa200 >= 0 ? "text-emerald-400" : "text-red-400", tooltip: "Current price vs 200-day Simple Moving Average (long-term trend). Above = bull market, below = bear market. When MA50 crosses above MA200 = Golden Cross (bullish signal). Below = Death Cross (bearish)." });
          analCol2.push({ label: "MACD", value: `${Math.abs(ti.macdHistogram).toFixed(2)}`, color: ti.macdHistogram > 0 ? "text-emerald-400" : ti.macdHistogram < 0 ? "text-red-400" : "text-gray-400", tooltip: "Moving Average Convergence Divergence histogram (12/26/9 EMA). Measures the gap between the MACD line (EMA12 − EMA26) and its 9-period signal line. Positive = bullish momentum building. Negative = bearish. Zero crossing is a key buy/sell trigger." });
        }


        return (
          <div className="mb-3">
            {/* Hero: ticker, price, signal, add button */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-baseline gap-3">
                <h2 className="text-lg font-semibold text-white flex items-center gap-1.5">{position.ticker} <a href={`https://finance.yahoo.com/quote/${position.ticker}`} target="_blank" rel="noopener noreferrer" className="text-gray-600 hover:text-gray-400"><ExternalLink size={12} /></a></h2>
                {currentPrice > 0 && <span className="text-2xl font-bold text-white">{fmtUsd(currentPrice)}</span>}
                {(() => {
                  const pc = liveQuote?.previousClose ?? ti?.previousClose ?? 0;
                  if (currentPrice <= 0 || pc <= 0) return null;
                  const day = liveDayChange(currentPrice, pc);
                  return <span className={`text-sm font-medium ${glColor(day.chg)}`}>{fmtUsdAbs(day.chg)} ({fmtPctAbs(day.pct)})</span>;
                })()}
              </div>
            </div>
            {ti?.name && <div className="text-xs text-gray-500 -mt-1 mb-2">{ti.name}</div>}
            {/* Three groups, stacking on small screens */}
            <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr] gap-2">
              {/* Holdings */}
              <div className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-1.5">
                <div className="grid grid-cols-2 gap-x-6">
                  <div>{holdCol1.map((kv, i) => <KVRow key={i} kv={kv} />)}</div>
                  <div>{holdCol2.map((kv, i) => <KVRow key={i} kv={kv} />)}</div>
                </div>
              </div>
              {/* Entry */}
              {analCol1.length > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-lg flex overflow-hidden">
                  <div className={`shrink-0 flex items-stretch self-stretch ${gradeText.includes("emerald") ? "bg-emerald-500/20" : gradeText.includes("amber") ? "bg-amber-500/20" : "bg-red-500/20"}`}>
                    <div className="w-6 flex flex-col items-center justify-center gap-1">
                      <span className="text-[9px] font-bold uppercase tracking-widest text-gray-500" style={{ writingMode: "vertical-lr", transform: "rotate(180deg)" }}>Entry Grade</span>
                      <Tooltip icon label={<div className="space-y-2">
                        <div className="text-gray-200 font-semibold">Entry Grade <span className={gradeText}>{grade}</span> <span className="text-gray-500 font-normal">({gradeScore.toFixed(0)}/100)</span></div>
                        <div className="text-[10px] text-gray-400">Evaluated at time of purchase (avg lot entry)</div>
                        <table className="text-[11px] w-full">
                          <tbody>
                            <tr><td className="text-gray-500 pr-3 py-0.5">RSI at entry</td><td className={`text-right ${(position.rsiAtEntry ?? 50) < 30 ? "text-emerald-400" : (position.rsiAtEntry ?? 50) > 70 ? "text-red-400" : "text-gray-300"}`}>{position.rsiAtEntry?.toFixed(0) ?? "?"}</td><td className="text-gray-600 pl-2">{(position.rsiAtEntry ?? 50) < 30 ? "oversold" : (position.rsiAtEntry ?? 50) > 70 ? "overbought" : "neutral"}</td></tr>
                            <tr><td className="text-gray-500 pr-3 py-0.5">Bollinger</td><td className={`text-right ${(position.bollingerPctAtEntry ?? 50) > 70 ? "text-emerald-400" : (position.bollingerPctAtEntry ?? 50) < 30 ? "text-red-400" : "text-gray-300"}`}>{position.bollingerPctAtEntry?.toFixed(0) ?? "?"}%</td><td className="text-gray-600 pl-2">{(position.bollingerPctAtEntry ?? 50) > 70 ? "near support" : (position.bollingerPctAtEntry ?? 50) < 30 ? "near resistance" : "mid-range"}</td></tr>
                            <tr><td className="text-gray-500 pr-3 py-0.5">MA trend</td><td className={`text-right ${position.ma50AtEntry > position.ma200AtEntry && position.ma200AtEntry > 0 ? "text-emerald-400" : position.ma50AtEntry < position.ma200AtEntry && position.ma200AtEntry > 0 ? "text-red-400" : "text-gray-300"}`}>{position.ma50AtEntry > position.ma200AtEntry && position.ma200AtEntry > 0 ? "uptrend" : position.ma50AtEntry < position.ma200AtEntry && position.ma200AtEntry > 0 ? "downtrend" : "—"}</td><td className="text-gray-600 pl-2">{position.ma50AtEntry > position.ma200AtEntry && position.ma200AtEntry > 0 ? "golden cross" : position.ma50AtEntry < position.ma200AtEntry && position.ma200AtEntry > 0 ? "death cross" : "converging"}</td></tr>
                            <tr><td className="text-gray-500 pr-3 py-0.5">Timing</td><td className={`text-right ${(a?.timingScore ?? 50) >= 66 ? "text-emerald-400" : (a?.timingScore ?? 50) >= 33 ? "text-amber-400" : "text-red-400"}`}>{a?.timingScore.toFixed(0)}%</td><td className="text-gray-600 pl-2">100%=low, 0%=high</td></tr>
                          </tbody>
                        </table>
                        <div className={`text-[11px] font-medium ${gradeText}`}>{grade === "A" ? "Excellent entry — most factors aligned favorably" : grade === "B" ? "Good entry — majority of factors favorable" : grade === "C" ? "Average entry — mixed signals at purchase" : grade === "D" ? "Below average — unfavorable conditions" : "Poor entry — most factors unfavorable"}</div>
                        <div className="text-[10px] flex gap-2"><span className="text-emerald-400">A ≥85</span><span className="text-emerald-400">B ≥70</span><span className="text-amber-400">C ≥55</span><span className="text-red-400">D ≥40</span><span className="text-red-400">F &lt;40</span></div>
                      </div>}><span /></Tooltip>
                    </div>
                    <div className="w-8 flex items-center justify-center"><span className={`text-2xl font-bold ${gradeText}`} style={{ writingMode: "vertical-lr", transform: "rotate(180deg)" }}>{grade}</span></div>
                  </div>
                  <div className="flex-1 px-3 py-1.5">{analCol1.map((kv, i) => <KVRow key={i} kv={kv} />)}</div>
                </div>
              )}
              {/* Signal */}
              {analCol2.length > 0 && (() => {
                const crossLabel = gc ? "Golden Cross ↑" : dc ? "Death Cross ↓" : "";
                return (
                <div className="bg-gray-900 border border-gray-800 rounded-lg flex overflow-hidden">
                  <div className={`shrink-0 flex items-stretch self-stretch ${ti?.signal?.includes("buy") ? "bg-emerald-500/20" : ti?.signal?.includes("sell") ? "bg-red-500/20" : "bg-gray-700"}`}>
                    <div className="w-6 flex flex-col items-center justify-center gap-1">
                      <span className="text-[9px] font-bold uppercase tracking-widest text-gray-500" style={{ writingMode: "vertical-lr", transform: "rotate(180deg)" }}>Signal</span>
                      <Tooltip icon label={<div className="space-y-2">
                        <div className="text-gray-200 font-semibold">Market Signal <span className={sigColor}>{ti?.signal?.toUpperCase()}</span> <span className="text-gray-500 font-normal">(score {ti?.compositeScore?.toFixed(2) ?? "0"})</span></div>
                        <div className="text-[10px] text-gray-400">Current market conditions — updated on backfill</div>
                        <table className="text-[11px] w-full">
                          <thead><tr><td className="text-gray-600 pr-3 pb-0.5">Indicator</td><td className="text-gray-600 text-right pb-0.5">Value</td><td className="text-gray-600 text-right pb-0.5">Weight</td><td className="text-gray-600 pl-2 pb-0.5">Reading</td></tr></thead>
                          <tbody>
                            <tr><td className="text-gray-500 pr-3 py-0.5">RSI (14-day)</td><td className={`text-right ${(ti?.rsi14 ?? 50) < 30 ? "text-emerald-400" : (ti?.rsi14 ?? 50) > 70 ? "text-red-400" : "text-gray-300"}`}>{(ti?.rsi14 ?? 50).toFixed(0)}</td><td className="text-gray-600 text-right">20%</td><td className="text-gray-600 pl-2">{(ti?.rsi14 ?? 50) < 30 ? "oversold" : (ti?.rsi14 ?? 50) > 70 ? "overbought" : "neutral"}</td></tr>
                            <tr><td className="text-gray-500 pr-3 py-0.5">MACD (12/26/9)</td><td className={`text-right ${(ti?.macdHistogram ?? 0) > 0 ? "text-emerald-400" : (ti?.macdHistogram ?? 0) < 0 ? "text-red-400" : "text-gray-300"}`}>{(ti?.macdHistogram ?? 0).toFixed(2)}</td><td className="text-gray-600 text-right">25%</td><td className="text-gray-600 pl-2">{(ti?.macdHistogram ?? 0) > 0 ? "bullish" : (ti?.macdHistogram ?? 0) < 0 ? "bearish" : "flat"}</td></tr>
                            <tr><td className="text-gray-500 pr-3 py-0.5">Bollinger (20d)</td><td className="text-right text-gray-300">—</td><td className="text-gray-600 text-right">15%</td><td className="text-gray-600 pl-2">band position</td></tr>
                            <tr><td className="text-gray-500 pr-3 py-0.5">MA Trend</td><td className={`text-right ${gc ? "text-emerald-400" : dc ? "text-red-400" : "text-gray-300"}`}>{gc ? "↑" : dc ? "↓" : "—"}</td><td className="text-gray-600 text-right">20%</td><td className="text-gray-600 pl-2">{gc ? "golden cross" : dc ? "death cross" : "converging"}</td></tr>
                            <tr><td className="text-gray-500 pr-3 py-0.5">Momentum</td><td className={`text-right ${(ti?.roc10 ?? 0) > 0 ? "text-emerald-400" : (ti?.roc10 ?? 0) < 0 ? "text-red-400" : "text-gray-300"}`}>{(ti?.roc10 ?? 0).toFixed(1)}%</td><td className="text-gray-600 text-right">10%</td><td className="text-gray-600 pl-2">10d ROC</td></tr>
                            <tr><td className="text-gray-500 pr-3 py-0.5">Volume</td><td className="text-right text-gray-300">{(ti?.volumeRatio ?? 1).toFixed(1)}x</td><td className="text-gray-600 text-right">10%</td><td className="text-gray-600 pl-2">vs avg vol</td></tr>
                          </tbody>
                        </table>
                        <div className="text-[10px] text-gray-500">Price {Math.abs(priceMa50).toFixed(1)}% {priceMa50 >= 0 ? "above" : "below"} MA50 · {Math.abs(priceMa200).toFixed(1)}% {priceMa200 >= 0 ? "above" : "below"} MA200</div>
                        <table className="text-[10px] w-full mt-1">
                          <tbody>
                            <tr><td className="text-emerald-400 pr-2">Strong Buy ≥1.2</td><td className="text-emerald-400 pr-2">Buy ≥0.4</td><td className="text-gray-400 pr-2">Hold ±0.4</td><td className="text-red-400 pr-2">Sell ≤-0.4</td><td className="text-red-400">Strong Sell ≤-1.2</td></tr>
                          </tbody>
                        </table>
                      </div>}><span /></Tooltip>
                    </div>
                    <div className="w-8 flex items-center justify-center"><span className={`text-2xl font-bold uppercase ${sigColor}`} style={{ writingMode: "vertical-lr", transform: "rotate(180deg)" }}>{ti?.signal?.toUpperCase()}</span></div>
                    {crossLabel && <div className="w-6 flex items-center justify-center"><span className={`text-[8px] font-medium uppercase ${gc ? "text-emerald-400" : "text-red-400"}`} style={{ writingMode: "vertical-lr", transform: "rotate(180deg)" }}>{crossLabel}</span></div>}
                  </div>
                  <div className="flex-1 px-3 py-1.5">
                    {analCol2.map((kv, i) => <KVRow key={i} kv={kv} />)}
                    {(() => {
                      const alerts = getLiveAlerts(liveQuote?.price ?? 0, ti?.lastClose ?? 0, liveQuote?.previousClose ?? ti?.previousClose ?? 0, ti?.ma50 ?? 0, ti?.ma200 ?? 0);
                      if (alerts.length === 0) return null;
                      return (
                        <div className="mt-1 border-t border-gray-800 pt-1">
                          {alerts.map((a, i) => (
                            <div key={i} className={`text-[10px] font-medium ${a.bullish ? "text-emerald-400" : "text-red-400"}`}>
                              {a.bullish ? "▲" : "▼"} {a.text}
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                </div>
                );
              })()}
            </div>
          </div>
        );
      })()}

      <TickerChart symbol={position.ticker} lots={position.lots ?? []} cutoffDate={cutoffDate} highlightLot={highlightLot} />

      {/* Lots Table — consolidated with entry analysis */}
      {(() => {
        const entryMap = new Map(entry?.analysis?.lots.map((a) => [a.lotId, a]) ?? []);
        return (
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-x-auto mb-6">
            <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="font-medium text-white">Lots</h3>
                {!showAdd && (
                  <button onClick={() => setShowAdd(true)} className="bg-indigo-600 hover:bg-indigo-500 text-white px-2 py-0.5 rounded text-xs font-medium transition-colors flex items-center gap-1">
                    <Plus size={10} /> Add
                  </button>
                )}
              </div>
              {(() => {
                const lbp2 = lastBuyPrice(position.lots ?? []);
                if (lbp2 <= 0) return null;
                const lp = liveQuote?.price ?? tickerInfo?.lastClose ?? 0;
                const opp = avgDownOpportunity(lbp2, lp, position.avgCostBasis ?? 0, position.totalShares ?? 0);
                if (!opp || !avgDownColor(opp.gapPct, dipThreshold)) return null;
                return (
                  <Tooltip label={<div className="space-y-1.5"><div className="text-gray-200 font-semibold whitespace-nowrap">{fmtUsd(lp)} is {fmtPctAbs(opp.gapPct)} below last buy at {fmtUsd(lbp2)}</div><table className="text-[11px] w-full"><thead><tr><td className="text-gray-600 pr-3 pb-0.5">Buy</td><td className="text-gray-600 text-right pb-0.5">Cost</td><td className="text-gray-600 text-right pb-0.5">New Avg</td><td className="text-gray-600 text-right pb-0.5">Avg Cut</td></tr></thead><tbody>{opp.scenarios.map((s, i) => <tr key={i}><td className="text-gray-300 pr-3 py-0.5">{s.addShares} shares</td><td className="text-gray-300 text-right">{fmtUsd(s.addCost)}</td><td className="text-white text-right font-medium">{fmtUsd(s.newAvg)}</td><td className="text-emerald-400 text-right">{fmtPctAbs(s.costReduction)}</td></tr>)}</tbody></table><div className="text-[10px] text-gray-500">Current avg: {fmtUsd(position.avgCostBasis ?? 0)} · {position.totalShares ?? 0} shares</div></div>}>
                    <span className={`text-sm font-medium cursor-help flex items-center gap-1 ${avgDownColor(opp.gapPct, dipThreshold)}`}>
                      <Lightbulb size={14} /> {fmtPctAbs(opp.gapPct)} below last buy
                    </span>
                  </Tooltip>
                );
              })()}
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left px-3 py-2 text-xs text-gray-500 uppercase">Type</th>
                  <th className="text-left px-3 py-2 text-xs text-gray-500 uppercase">Date</th>
                  <th className="text-right px-3 py-2 text-xs text-gray-500 uppercase">Qty</th>
                  <th className="text-right px-3 py-2 text-xs text-gray-500 uppercase">Price</th>
                  <th className="text-right px-3 py-2 text-xs text-gray-500 uppercase">Total</th>
                  <th className="text-center px-3 py-2 text-xs text-gray-500 uppercase">Grade</th>
                  <th className="text-right px-3 py-2 text-xs text-gray-500 uppercase">vs Avg</th>
                  <th className="text-center px-3 py-2 text-xs text-gray-500 uppercase">Timing</th>
                  <th className="text-left px-3 py-2 text-xs text-gray-500 uppercase">Notes</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {[...(position.lots ?? [])].sort((a, b) => a.transactionDate.localeCompare(b.transactionDate)).map((lot) => {
                  const a = entryMap.get(lot.id);
                  return (
                    <tr key={lot.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors cursor-default"
                      onMouseEnter={() => setHighlightLot({ date: lot.transactionDate, price: lot.price, type: lot.type })}
                      onMouseLeave={() => setHighlightLot(null)}>
                      <td className="px-3 py-2">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                          lot.type === "buy" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                        }`}>{lot.type.toUpperCase()}</span>
                      </td>
                      <td className="px-3 py-2 text-gray-300">{fmtDate(lot.transactionDate)}</td>
                      <td className="px-3 py-2 text-right text-gray-300">{lot.quantity}</td>
                      <td className="px-3 py-2 text-right text-gray-300">{fmtUsd(lot.price)}</td>
                      <td className="px-3 py-2 text-right text-white font-medium">{fmtUsd(lot.quantity * lot.price + lot.fees)}</td>
                      <td className="px-3 py-2 text-center">
                        {(() => {
                          const lg = lotGradeMap.get(lot.id);
                          if (!lg) return <span className="text-gray-600">—</span>;
                          return (
                            <Tooltip label={lg.gradeExplanation}>
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded cursor-help ${gradeColor(lg.grade)}`}>{lg.grade}</span><span className="text-[10px] text-gray-600 ml-1">{lg.gradeScore.toFixed(0)}</span>
                            </Tooltip>
                          );
                        })()}
                      </td>
                      <td className={`px-3 py-2 text-right text-xs ${a ? glColor(-a.vsAvg) : "text-gray-600"}`}>
                        {a ? fmtPctAbs(a.vsAvgPct) : "—"}
                      </td>
                      <td className="px-3 py-2">
                        {a ? (
                          <div className="flex items-center justify-center gap-1">
                            <div className="w-12 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${
                                a.timingScore >= 66 ? "bg-emerald-500" : a.timingScore >= 33 ? "bg-amber-500" : "bg-red-500"
                              }`} style={{ width: `${a.timingScore}%` }} />
                            </div>
                            <span className={`text-xs ${a.timingScore >= 66 ? "text-emerald-400" : a.timingScore >= 33 ? "text-amber-400" : "text-red-400"}`}>{a.timingScore.toFixed(0)}%</span>
                          </div>
                        ) : <span className="text-gray-600 text-xs text-center block">—</span>}
                      </td>
                      <td className="px-3 py-2 text-gray-500 truncate max-w-[120px]">{lot.notes}</td>
                      <td className="px-3 py-2 text-right">
                        <Tooltip label="Remove lot"><button onClick={() => handleRemoveLot(lot.id)} className="text-red-400 hover:text-red-300"><Trash2 size={14} /></button></Tooltip>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })()}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title={`Add Lot — ${ticker}`}>
        <AddSingleLotForm portfolioId={portfolioId} ticker={ticker} onDone={() => setShowAdd(false)} />
      </Modal>
    </div>
  );
}

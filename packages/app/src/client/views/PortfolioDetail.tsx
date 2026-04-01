import { useState, useEffect, useRef, useCallback } from "react";
import { Plus, RefreshCw, Settings, LayoutList, BarChart3, Database, ExternalLink } from "lucide-react";
import { ActionButton } from "../components/ActionButton.js";
import { StatCard } from "../components/StatCard.js";
import { BackButton } from "../components/BackButton.js";
import { Tooltip } from "../components/Tooltip.js";
import { trpc } from "../trpc.js";
import { useNav, type SubTab } from "../hooks/useNav.js";
import { PositionDetail } from "./PositionDetail.js";
import { WhatIfChart } from "../components/WhatIfChart.js";
import { PortfolioSettings } from "../components/PortfolioSettings.js";
import { fmtDate, fmtMonthYear, fmtUsd, fmtUsdAbs, fmtPctAbs, glColor } from "../fmt.js";
import { getLivePrice, getLiveAlerts, livePortfolioTotals, livePortfolioDayChange, livePositionGL, liveDayChange, avgDownOpportunity, avgDownColor, volatilityColor, gradeColor, signalColor, fmtDividendYield, lastTradingDate, pendingBackfillTickers, shouldPollQuotes } from "../live.js";
import { InfoTip } from "../components/InfoTip.js";
import { MarketMarquee } from "../components/MarketMarquee.js";
import { AddTickersForm, AddLotsForm } from "../components/AddForms.js";
import { BenchmarkChart } from "../components/BenchmarkChart.js";
import { Modal } from "../components/Modal.js";
import { FiftyTwoWeekBar } from "../components/FiftyTwoWeekBar.js";


type Props = {
  portfolioId: string;
  onBack: () => void;
};

export function PortfolioDetail({ portfolioId, onBack }: Props) {
  const { data: portfolio } = trpc.getPortfolio.useQuery({ id: portfolioId });
  const { data: summary } = trpc.getPortfolioSummary.useQuery({ portfolioId });
  const tickers_list = summary?.positions?.map((p) => p.ticker) ?? [];
  const { data: bulkFundamentals } = trpc.getBulkFundamentals.useQuery(
    { symbols: tickers_list },
    { enabled: tickers_list.length > 0, staleTime: 5 * 60 * 1000 },
  );
  const { data: positions } = trpc.getPositionsByPortfolio.useQuery({ portfolioId });
  const backfillMutation = trpc.requestBackfill.useMutation();
  const utils = trpc.useUtils();

  const { route, nav } = useNav();
  const subTab = route.page === "portfolio" ? route.tab : "positions";
  const setSubTab = (tab: SubTab) => nav.toPortfolio(portfolioId, tab);
  const [showSettings, setShowSettings] = useState(false);
  const [analysisMode, setAnalysisMode] = useState<"benchmark" | "whatif">("benchmark");
  const [extraTickers, setExtraTickers] = useState<string[]>([]);
  const [showAdd, setShowAdd] = useState<false | "positions" | "lots">(false);
  const closeAdd = useCallback(() => setShowAdd(false), []);
  const [sortCol, setSortCol] = useState<string>("marketValue");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const toggleSort = (col: string) => {
    if (sortCol === col) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir(col === "ticker" ? "asc" : "desc"); }
  };

  const { data: allTickerData } = trpc.getTickers.useQuery();
  const tickerSymbols = positions?.map((p) => p.ticker).filter(Boolean) ?? [];
  const nonPortfolioTickers = (allTickerData ?? []).filter((t) => !tickerSymbols.includes(t.symbol)).map((t) => t.symbol);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const polling = shouldPollQuotes();
  const INDEX_SYMBOLS = ["^DJI", "^GSPC", "^IXIC"];
  const allSymbols = [...new Set([...tickerSymbols, ...INDEX_SYMBOLS])];
  const { data: liveQuotes, dataUpdatedAt: quotesUpdatedAt } = trpc.getQuotes.useQuery(
    { symbols: allSymbols },
    { enabled: allSymbols.length > 0, refetchInterval: polling ? 300_000 : false }
  );
  const { data: quoteStats } = trpc.getQuoteStats.useQuery(undefined, { refetchInterval: polling ? 300_000 : false });
  const getSortVal = (pos: any, col: string) => {
    if (col === "52wk") { const f = bulkFundamentals?.[pos.ticker]; const lo = f?.fiftyTwoWeekLow ?? 0; const hi = f?.fiftyTwoWeekHigh ?? 0; const price = getLivePrice(liveQuotes, pos.ticker, pos.currentPrice); return hi > lo ? (price - lo) / (hi - lo) : 0; }
    if (col === "unrealizedGL" || col === "unrealizedGLPercent") {
      const price = getLivePrice(liveQuotes, pos.ticker, pos.currentPrice);
      const gl = livePositionGL(pos.totalShares, pos.avgCostBasis, price);
      return col === "unrealizedGL" ? gl.gl : gl.glPct;
    }
    if (col === "marketValue") { const price = getLivePrice(liveQuotes, pos.ticker, pos.currentPrice); return pos.totalShares * price; }
    if (col === "currentPrice") return getLivePrice(liveQuotes, pos.ticker, pos.currentPrice);
    if (col === "pe") return bulkFundamentals?.[pos.ticker]?.trailingPE ?? 0;
    if (col === "yield") return bulkFundamentals?.[pos.ticker]?.dividendYield ?? 0;
    if (col === "volatility") return allTickerData?.find((t: any) => t.symbol === pos.ticker)?.volatility30d ?? 0;
    if (col === "entryGrade") return pos.entryGradeScore ?? 0;
    if (col === "signal") return pos.compositeScore ?? 0;
    return pos[col] ?? 0;
  };
  const sortedPositions = [...(summary?.positions ?? [])].sort((a, b) => {
    const av = getSortVal(a, sortCol);
    const bv = getSortVal(b, sortCol);
    const cmp = typeof av === "string" ? av.localeCompare(bv) : av - bv;
    return sortDir === "asc" ? cmp : -cmp;
  });

  // Backfill state — use earliest lot date across all positions as baseline
  const cutoffDate = portfolio?.cutoffDate || "2024-01-01";
  const earliestLotDate = positions?.reduce((earliest, p) => {
    const lots = (p as any).lots ?? [];
    for (const lot of lots) {
      if (lot.transactionDate && lot.transactionDate < earliest) earliest = lot.transactionDate;
    }
    return earliest;
  }, cutoffDate) ?? cutoffDate;
  const [backfillStatus, setBackfillStatus] = useState<Record<string, { loading: boolean; result?: string }>>({});
  const [backfillingAll, setBackfillingAll] = useState(false);
  const recomputeMutation = trpc.recomputeAllIndicators.useMutation();
  const [backfillFrom, setBackfillFrom] = useState<string | null>(null);
  const effectiveBackfillFrom = backfillFrom ?? earliestLotDate;

  const today = new Date().toISOString().split("T")[0];

  /** Count weekdays between two dates */
  const countWeekdays = (from: string, to: string) => {
    let count = 0;
    const d = new Date(from);
    const end = new Date(to);
    while (d <= end) {
      const dow = d.getDay();
      if (dow !== 0 && dow !== 6) count++;
      d.setDate(d.getDate() + 1);
    }
    return Math.max(1, count);
  };


  const handleBackfill = async (symbol: string) => {
    setBackfillStatus((s) => ({ ...s, [symbol]: { loading: true } }));
    try {
      const today = new Date().toISOString().split("T")[0];
      const result = await backfillMutation.mutateAsync({ symbol, fromDate: effectiveBackfillFrom, toDate: today });
      setBackfillStatus((s) => ({
        ...s,
        [symbol]: { loading: false, result: result.success ? `${result.count} prices` : `Failed` },
      }));
      utils.invalidate();
    } catch (e) {
      setBackfillStatus((s) => ({ ...s, [symbol]: { loading: false, result: `Error` } }));
    }
  };

  const handleBackfillAll = async () => {
    setBackfillingAll(true);
    const tickerList = positions?.map((p) => p.ticker).filter(Boolean) ?? [];
    for (const t of tickerList) await handleBackfill(t);
    // Auto-recompute signals after backfill
    await recomputeMutation.mutateAsync();
    utils.invalidate();
    setBackfillingAll(false);
  };
  const [autoBackfilling, setAutoBackfilling] = useState(false);
  const autoBackfillRan = useRef(false);
  useEffect(() => {
    if (autoBackfillRan.current || !allTickerData || !positions || positions.length === 0) return;
    const pending = pendingBackfillTickers(allTickerData, positions.map((p) => p.ticker).filter(Boolean));
    if (pending.length === 0) return;
    autoBackfillRan.current = true;
    (async () => {
      setAutoBackfilling(true);
      const target = lastTradingDate();
      for (const t of pending) {
        try { await backfillMutation.mutateAsync({ symbol: t, fromDate: target, toDate: target }); } catch {}
      }
      await recomputeMutation.mutateAsync();
      utils.invalidate();
      setAutoBackfilling(false);
    })();
  }, [allTickerData, positions]);
  const anyLoading = backfillingAll || autoBackfilling || Object.values(backfillStatus).some((s) => s.loading);
  const { data: priceRange } = trpc.getPriceDateRange.useQuery();
  const recentCutoff = new Date(new Date(today).getTime() - 3 * 86400000).toISOString().split("T")[0];
  const allFilled = positions && positions.length > 0 && positions.every((p) => {
    const t = allTickerData?.find((td) => td.symbol === p.ticker);
    const coversStart = !!t?.firstPriceDate && t.firstPriceDate <= effectiveBackfillFrom;
    const endDate = t?.lastPriceDate || today;
    const coversEnd = endDate >= today || endDate >= recentCutoff;
    return (t?.priceCount ?? 0) > 0 && coversStart && coversEnd;
  });

  const subTabs: { id: SubTab; label: string; icon: React.ReactNode }[] = [
    { id: "positions", label: "Positions", icon: <LayoutList size={14} /> },
    { id: "analysis", label: "Analysis", icon: <BarChart3 size={14} /> },
    { id: "prices", label: "Price Data", icon: <Database size={14} /> },
  ];

  const livePanel = <MarketMarquee now={now} polling={polling} quotesUpdatedAt={quotesUpdatedAt} quoteStats={quoteStats} autoBackfilling={autoBackfilling} quotes={liveQuotes} />;

  if (route.page === "position" && route.portfolioId === portfolioId) {
    const pos = positions?.find((p) => p.ticker === route.ticker);
    if (!pos) return <div className="text-gray-500">Loading...</div>;
    return (
      <div>
        <div className="flex items-center mb-4 min-w-0">
          <BackButton label={`Back to ${portfolio?.name ?? "portfolio"}`} onClick={() => nav.toPortfolio(portfolioId)} />
          {livePanel}
        </div>
        <PositionDetail positionId={pos.id} portfolioId={portfolioId} ticker={route.ticker} cutoffDate={cutoffDate}
          dipThreshold={portfolio?.dipThreshold ?? 5} />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center mb-4 min-w-0">
        <BackButton label="Back to portfolios" onClick={onBack} />
        {livePanel}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="flex items-end gap-3">
          <div>
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              {portfolio?.name}
              <Tooltip label="Settings">
                <button onClick={() => setShowSettings(true)} className="text-gray-600 hover:text-gray-300 transition-colors">
                  <Settings size={14} />
                </button>
              </Tooltip>
            </h2>
            <div className="flex items-center gap-2">
              <p className="text-xs text-gray-500">
                {portfolio?.description && <>{portfolio.description} &middot; </>}
                {portfolio?.currency}
                {cutoffDate && <> &middot; Since {fmtDate(cutoffDate)}</>}
              </p>
              <nav className="flex gap-0.5">
            {subTabs.map((t) => (
              <button key={t.id} onClick={() => setSubTab(t.id)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1 ${
                  subTab === t.id ? "bg-gray-800 text-white" : "text-gray-500 hover:text-white hover:bg-gray-800/50"
                }`}>
                {t.icon} {t.label}
              </button>
            ))}
              </nav>
            </div>
          </div>
        </div>
        {summary && (() => {
          const live = livePortfolioTotals(summary.positions, liveQuotes);
          const day = livePortfolioDayChange(summary.positions, liveQuotes, allTickerData ?? undefined);
          return (
          <div className="hidden md:flex items-start gap-6 text-center">
            <StatCard label="Cost" value={fmtUsd(summary.totalCost)} />
            <StatCard label="Value" value={fmtUsd(live.totalValue)} />
            <StatCard label="Gain/Loss" value={fmtUsdAbs(live.gl)} color={glColor(live.gl)}
              subValue={<>{fmtUsdAbs(day.chg)} ({fmtPctAbs(day.pct)})</>} subColor={glColor(day.chg)} />
            <StatCard label="Return" value={fmtPctAbs(live.glPct)} color={glColor(live.glPct)}
              subValue={fmtPctAbs(live.totalCost > 0 ? (day.chg / live.totalCost) * 100 : 0)} subColor={glColor(day.chg)} />
          </div>
          );
        })()}
      </div>



      {/* === Positions Tab === */}
      {subTab === "positions" && (
        <>

          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-x-auto">
            <table className="w-full text-base">
              <thead>
                <tr className="border-b border-gray-800">
                  {[
                    { key: "ticker", label: "Ticker", align: "left" },
                    { key: "totalShares", label: "Shares", align: "right" },
                    { key: "avgCostBasis", label: "Avg Cost", align: "right" },
                    { key: "currentPrice", label: "Current", align: "right" },
                    { key: "52wk", label: "52wk Range", align: "center" },
                    { key: "marketValue", label: "Market Value", align: "right" },
                    { key: "unrealizedGL", label: "Gain/Loss", align: "right" },
                    { key: "unrealizedGLPercent", label: "G/L %", align: "right" },
                    { key: "pe", label: "P/E", align: "right" },
                    { key: "yield", label: "Yield", align: "right" },
                  ].map((col) => (
                    <th key={col.key} onClick={() => toggleSort(col.key)}
                      className={`text-${col.align} px-3 py-2 text-xs text-gray-500 uppercase cursor-pointer hover:text-gray-300 select-none whitespace-nowrap`}>
                      {col.label}{sortCol === col.key ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                    </th>
                  ))}
                  <th onClick={() => toggleSort("volatility")}
                    className="text-right px-3 py-2 text-xs text-gray-500 uppercase cursor-pointer hover:text-gray-300 select-none whitespace-nowrap border-l border-gray-800">
                    Risk{sortCol === "volatility" ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                    <InfoTip>
                      <div className="space-y-1.5">
                        <div className="text-gray-300 font-medium">Risk (30-day Volatility)</div>
                        <div className="text-gray-400 text-[11px] leading-tight">Annualized standard deviation of daily returns over 30 days. Higher % = larger daily price swings = more risk.</div>
                        <table className="font-mono text-[11px]">
                          <tbody>
                            <tr><td className="text-emerald-400 pr-2 text-right">&lt;15%</td><td>low risk (stable)</td></tr>
                            <tr><td className="text-amber-400 pr-2 text-right">15–30%</td><td>moderate risk</td></tr>
                            <tr><td className="text-red-400 pr-2 text-right">&gt;30%</td><td>high risk (volatile)</td></tr>
                          </tbody>
                        </table>
                      </div>
                    </InfoTip>
                  </th>
                  <th onClick={() => toggleSort("entryGrade")}
                    className="text-center px-3 py-2 text-xs text-gray-500 uppercase cursor-pointer hover:text-gray-300 select-none whitespace-nowrap">
                    Entry{sortCol === "entryGrade" ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                    <InfoTip>
                      <div className="space-y-1.5">
                        <div className="text-gray-300 font-medium">Entry Grade</div>
                        <div className="text-gray-400 text-[11px] leading-tight">Evaluates entry quality using Minervini/O'Neil trend-following methodology. Qty-weighted average across all lots.</div>
                        <table className="text-[11px] w-full">
                          <tbody>
                            <tr><td className="text-gray-500 pr-2">Trend (40%)</td><td className="text-gray-300">MA50 {'>'} MA200 (golden cross), price above MA50, MA50 rising</td></tr>
                            <tr><td className="text-gray-500 pr-2">Value (30%)</td><td className="text-gray-300">Entry near MA50 support or lower Bollinger band</td></tr>
                            <tr><td className="text-gray-500 pr-2">Timing (30%)</td><td className="text-gray-300">RSI pullback (30-50 ideal), entry near period low</td></tr>
                          </tbody>
                        </table>
                        <table className="font-mono text-[11px] mt-1">
                          <tbody>
                            <tr><td className="text-emerald-400 pr-2">A</td><td>80+ — pullback in confirmed uptrend near support</td></tr>
                            <tr><td className="text-emerald-400 pr-2">B</td><td>65+ — trend-aligned at reasonable price</td></tr>
                            <tr><td className="text-amber-400 pr-2">C</td><td>50+ — some factors favorable</td></tr>
                            <tr><td className="text-red-400 pr-2">D</td><td>35+ — weak trend or poor value</td></tr>
                            <tr><td className="text-red-400 pr-2">F</td><td>&lt;35 — against trend, extended, bad timing</td></tr>
                          </tbody>
                        </table>
                      </div>
                    </InfoTip>
                  </th>
                  <th onClick={() => toggleSort("signal")}
                    className="text-center px-3 py-2 text-xs text-gray-500 uppercase cursor-pointer hover:text-gray-300 select-none whitespace-nowrap">
                    Signal{sortCol === "signal" ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                    <InfoTip>
                      <div className="space-y-2">
                        <div className="text-gray-300 font-medium">Composite Signal</div>
                        <div className="text-gray-400 text-[11px] leading-tight">
                          Weighted composite of 6 indicators: RSI (20%), MACD (25%), Bollinger Bands (15%), MA trend (20%), momentum (10%), volume (10%).
                        </div>
                        <table className="text-[11px] w-full border-spacing-y-1" style={{ borderCollapse: "separate" }}>
                          <tbody>
                            <tr>
                              <td className="text-emerald-400 pr-3 font-bold whitespace-nowrap align-top">STRONG BUY</td>
                              <td className="text-gray-300">Composite score &ge; 1.2 — multiple indicators aligned bullish (oversold RSI, MACD crossover, golden cross, etc.)</td>
                            </tr>
                            <tr>
                              <td className="text-emerald-400 pr-3 font-bold whitespace-nowrap align-top">BUY</td>
                              <td className="text-gray-300">Score 0.4 to 1.2 — majority of indicators bullish</td>
                            </tr>
                            <tr>
                              <td className="text-gray-400 pr-3 font-bold whitespace-nowrap align-top">HOLD</td>
                              <td className="text-gray-300">Score -0.4 to 0.4 — mixed signals, no clear direction</td>
                            </tr>
                            <tr>
                              <td className="text-red-400 pr-3 font-bold whitespace-nowrap align-top">SELL</td>
                              <td className="text-gray-300">Score -1.2 to -0.4 — majority of indicators bearish</td>
                            </tr>
                            <tr>
                              <td className="text-red-400 pr-3 font-bold whitespace-nowrap align-top">STRONG SELL</td>
                              <td className="text-gray-300">Score &le; -1.2 — multiple indicators aligned bearish (overbought RSI, MACD divergence, death cross, etc.)</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </InfoTip>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedPositions.map((pos) => (
                  <tr key={pos.ticker} onClick={() => nav.toPosition(portfolioId, pos.ticker)}
                    className="border-b border-gray-800/50 hover:bg-gray-800/30 cursor-pointer transition-colors">
                    <td className="px-3 py-2">
                      <div className="flex items-baseline gap-1.5">
                        <span className="font-medium text-white">{pos.ticker}</span>
                        <a href={`https://finance.yahoo.com/quote/${pos.ticker}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-gray-600 hover:text-gray-400"><ExternalLink size={10} /></a>
                      </div>
                      {pos.tickerName && <div className="text-[10px] text-gray-600 truncate max-w-[100px]">{pos.tickerName}</div>}
                      {(() => { const lp = getLivePrice(liveQuotes, pos.ticker, pos.currentPrice); const opp = avgDownOpportunity(pos.lastBuyPrice, lp, pos.avgCostBasis, pos.totalShares); const color = opp ? avgDownColor(opp.gapPct, portfolio?.dipThreshold ?? 5) : ""; return opp && color ? <div className={`text-[10px] font-medium ${color}`}>▼ {fmtPctAbs(opp.gapPct)} below last buy</div> : null; })()}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-300">{pos.totalShares.toLocaleString()}<div className="text-[10px] text-gray-600">{pos.lots} lot{pos.lots !== 1 ? "s" : ""}</div></td>
                    <td className="px-3 py-2 text-right text-yellow-200/70">{fmtUsd(pos.avgCostBasis)}</td>
                    {(() => {
                      const td = allTickerData?.find((t) => t.symbol === pos.ticker);
                      const price = getLivePrice(liveQuotes, pos.ticker, pos.currentPrice);
                      const pc = liveQuotes?.[pos.ticker]?.previousClose ?? td?.previousClose ?? 0;
                      const day = liveDayChange(price, pc);
                      const posGL = livePositionGL(pos.totalShares, pos.avgCostBasis, price);
                      const fund = bulkFundamentals?.[pos.ticker];
                      const lo = fund?.fiftyTwoWeekLow ?? 0;
                      const hi = fund?.fiftyTwoWeekHigh ?? 0;
                      return <>
                        <td className={`px-3 py-2 text-right ${glColor(day.chg)}`}>{fmtUsd(price)}<div className="text-[10px]">{pc > 0 ? fmtPctAbs(day.pct) : ""}</div></td>
                        <td className="px-3 py-2">
                          <FiftyTwoWeekBar low={lo} high={hi} current={price} avgCost={pos.avgCostBasis} dayChange={day.chg} />
                        </td>
                        <td className="px-3 py-2 text-right text-gray-300">{fmtUsd(posGL.mv)}</td>
                        <td className={`px-3 py-2 text-right font-medium ${glColor(posGL.gl)}`}>{fmtUsdAbs(posGL.gl)}</td>
                        <td className={`px-3 py-2 text-right font-medium ${glColor(posGL.glPct)}`}>{fmtPctAbs(posGL.glPct)}</td>
                      </>;
                    })()}
                    <td className="px-3 py-2 text-right text-gray-300">{bulkFundamentals?.[pos.ticker]?.trailingPE?.toFixed(1) ?? "—"}</td>
                    <td className="px-3 py-2 text-right text-gray-300">{fmtDividendYield(bulkFundamentals?.[pos.ticker]?.dividendYield)}</td>
                    {(() => { const v = allTickerData?.find((t) => t.symbol === pos.ticker)?.volatility30d ?? 0; return <td className={`px-3 py-2 text-right border-l border-gray-800 ${volatilityColor(v)}`}>{v.toFixed(1)}%</td>; })()}
                    <td className="px-3 py-2 text-center">
                      <span className={`px-1.5 py-0.5 rounded-full font-bold ${gradeColor(pos.entryGrade)}`}>{pos.entryGrade}</span>
                      <div className="text-[10px] text-gray-600">{pos.entryGradeScore.toFixed(0)}</div>
                    </td>
                    {(() => {
                      const td = allTickerData?.find((t) => t.symbol === pos.ticker);
                      const price = getLivePrice(liveQuotes, pos.ticker, pos.currentPrice);
                      const pc = liveQuotes?.[pos.ticker]?.previousClose ?? td?.previousClose ?? 0;
                      const alerts = getLiveAlerts(price, td?.lastClose ?? 0, pc, td?.ma50 ?? 0, td?.ma200 ?? 0);
                      return (
                    <td className="px-3 py-2 text-center">
                      <span className={`px-1.5 py-0.5 rounded-full font-medium ${signalColor(pos.signal)}`}>{pos.signal?.toUpperCase()}</span>
                      <div className="text-[10px] text-gray-600">{pos.compositeScore.toFixed(2)}</div>
                      {alerts.map((a, i) => <div key={i} className={`text-[10px] font-medium mt-0.5 ${a.bullish ? "text-emerald-400" : "text-red-400"}`}>{a.bullish ? "▲" : "▼"}{a.text.replace(/^(Up|Down) /, "")}</div>)}
                    </td>
                      );
                    })()}
                  </tr>
                ))}
              </tbody>
            </table>
            {(!summary?.positions || summary.positions.length === 0) && (
              <p className="text-gray-600 text-center py-8">No positions yet.</p>
            )}
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <ActionButton onClick={() => setShowAdd("lots")}><Plus size={12} /> Add Lots</ActionButton>
            <ActionButton variant="secondary" onClick={() => setShowAdd("positions")}><Plus size={12} /> Add Tickers</ActionButton>
          </div>
          <Modal open={showAdd === "positions"} onClose={closeAdd} title="Add Tickers">
            <AddTickersForm portfolioId={portfolioId} onDone={closeAdd} />
          </Modal>
          <Modal open={showAdd === "lots"} onClose={closeAdd} title="Add Lots">
            <AddLotsForm portfolioId={portfolioId} onDone={closeAdd} />
          </Modal>
        </>
      )}

      {/* === Analysis Tab === */}
      {subTab === "analysis" && (
        <div className="space-y-4">
          <div className="flex gap-2">
            {([
              { id: "benchmark", label: "Benchmark vs S&P 500" },
              { id: "whatif", label: "What-If Single Date" },
            ] as const).map((m) => (
              <button key={m.id} onClick={() => setAnalysisMode(m.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${analysisMode === m.id ? "bg-indigo-600 text-white" : "text-gray-500 hover:text-white hover:bg-gray-800/50"}`}>
                {m.label}
              </button>
            ))}
          </div>
          {analysisMode === "benchmark" && <BenchmarkChart portfolioId={portfolioId} onSelectTicker={(ticker) => nav.toPosition(portfolioId, ticker)} />}
          {analysisMode === "whatif" && <WhatIfChart portfolioId={portfolioId} cutoffDate={cutoffDate} onSelectTicker={(ticker) => nav.toPosition(portfolioId, ticker)} />}
        </div>
      )}


      {/* === Price Data Tab === */}
      {subTab === "prices" && (
        <div className="space-y-4">
          {(() => {
            const minDate = new Date(new Date(cutoffDate).getTime() - 365 * 86400000);
            const maxDate = new Date(today);
            const minTs = minDate.getTime();
            const maxTs = maxDate.getTime();
            // Generate first-of-month tick labels
            const ticks: string[] = [];
            const d = new Date(minDate);
            d.setDate(1);
            d.setMonth(d.getMonth() + 1); // start at next month boundary
            while (d.getTime() <= maxTs) {
              ticks.push(d.toISOString().split("T")[0]);
              d.setMonth(d.getMonth() + 1);
            }
            const curTs = new Date(effectiveBackfillFrom).getTime();
            return (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <div className="flex items-center gap-4">
                  <label className="text-xs text-gray-500 whitespace-nowrap">Backfill from</label>
                  <div className="flex-1">
                    <input type="range"
                      min={minTs} max={maxTs} step={7 * 86400000}
                      value={curTs}
                      onChange={(e) => {
                        const d = new Date(Number(e.target.value));
                        const day = d.getDay();
                        const diff = day === 0 ? -6 : 1 - day; // snap to Monday
                        d.setDate(d.getDate() + diff);
                        setBackfillFrom(d.toISOString().split("T")[0]);
                      }}
                      className="w-full"
                      style={(() => {
                        const range = maxTs - minTs;
                        const greenStart = priceRange?.firstDate ? Math.max(0, ((new Date(priceRange.firstDate).getTime() - minTs) / range) * 100) : 0;
                        const greenEnd = priceRange?.lastDate ? Math.min(100, ((new Date(priceRange.lastDate).getTime() - minTs) / range) * 100) : 0;
                        return {
                          accentColor: "#10b981",
                          background: `linear-gradient(to right, #374151 ${greenStart}%, #10b981 ${greenStart}%, #10b981 ${greenEnd}%, #374151 ${greenEnd}%)`,
                          borderRadius: "9999px", height: "6px", WebkitAppearance: "none" as any, appearance: "none" as any,
                        };
                      })()}
                    />
                    <div className="flex justify-between mt-1">
                      {ticks.map((d) => (
                        <span key={d} className="text-[10px] text-gray-600">{fmtMonthYear(d)}</span>
                      ))}
                    </div>
                  </div>
                  <div className="text-right w-28 shrink-0">
                    {allFilled ? (
                      <span className="text-emerald-400 text-xs">&#10003; All filled</span>
                    ) : (
                      <button onClick={handleBackfillAll} disabled={anyLoading} className="bg-indigo-600 hover:bg-indigo-500 text-white px-2 py-0.5 rounded text-xs font-medium disabled:opacity-50 inline-flex items-center gap-1">
                        {backfillingAll ? "Backfilling..." : <><RefreshCw size={10} /> Backfill All</>}
                      </button>
                    )}
                    <div className="text-xs text-gray-400 mt-0.5">{fmtDate(effectiveBackfillFrom)}</div>
                  </div>
                </div>
              </div>
            );
          })()}
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left px-3 py-2 text-xs text-gray-500 uppercase">Symbol</th>
                <th className="text-right px-3 py-2 text-xs text-gray-500 uppercase">Last Price</th>
                <th className="text-right px-3 py-2 text-xs text-gray-500 uppercase">Last Date</th>
                <th className="text-center px-3 py-2 text-xs text-gray-500 uppercase">Prices</th>
                <th className="text-center px-3 py-2 text-xs text-gray-500 uppercase">Action</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const allSymbols = [...tickerSymbols, ...nonPortfolioTickers, ...extraTickers.filter((s) => !nonPortfolioTickers.includes(s) && !tickerSymbols.includes(s))];
                const unique = [...new Set(allSymbols)].sort();
                return unique.map((sym) => {
                const isPortfolio = tickerSymbols.includes(sym);
                const ticker = allTickerData?.find((t) => t.symbol === sym);
                const bfStatus = backfillStatus[sym];
                const total = ticker?.priceCount ?? 0;
                const firstDate = ticker?.firstPriceDate || "";
                const lastDate = ticker?.lastPriceDate || "";
                const inRange = !!firstDate && firstDate <= effectiveBackfillFrom && (lastDate >= today || lastDate >= recentCutoff);
                const weekdays = countWeekdays(effectiveBackfillFrom, lastDate || today);
                const pct = inRange ? 100 : total === 0 ? 0 : Math.min(99, Math.round(total / weekdays * 100));
                const filled = inRange;
                const barColor = pct === 0 ? "bg-red-500" : filled ? "bg-emerald-500" : "bg-amber-500";
                return (
                  <tr key={sym} className={`border-b border-gray-800/50 ${isPortfolio ? "" : "opacity-50"}`}>
                    <td className="px-3 py-2">
                      <span className={`font-medium ${isPortfolio ? "text-white" : "text-gray-500"}`}>{sym}</span>
                      {ticker?.name && <span className="text-xs text-gray-500 ml-2">{ticker.name}</span>}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-300">
                      {ticker?.lastClose ? `$${ticker.lastClose.toFixed(2)}` : "-"}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-500">{ticker?.lastPriceDate ? fmtDate(ticker.lastPriceDate) : "-"}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-center gap-2">
                          <div className="h-2 w-14 bg-gray-700 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
                          </div>
                          <span className={`text-xs tabular-nums ${pct === 0 ? "text-red-400" : filled ? "text-emerald-400" : "text-amber-400"}`}>
                            {total === 0 ? "No data" : `${total}`}
                          </span>
                        </div>
                      </td>
                      <td className="px-2 py-3 text-center">
                        {filled ? (
                          <span className="text-emerald-400 text-sm">&#10003;</span>
                        ) : (
                          <>
                            <button onClick={() => handleBackfill(sym)} disabled={anyLoading}
                              className="text-indigo-400 hover:text-indigo-300 text-sm disabled:opacity-50 inline-flex items-center gap-1">
                              {bfStatus?.loading ? "Loading..." : <><RefreshCw size={12} /> Backfill</>}
                            </button>
                            {bfStatus?.result && (
                              <span className={`text-xs ml-2 ${bfStatus.result.includes("Error") || bfStatus.result.includes("Failed") ? "text-red-400" : "text-emerald-400"}`}>
                                {bfStatus.result}
                              </span>
                            )}
                          </>
                        )}
                      </td>
                  </tr>
                );
              }); })()}
              {/* Add ticker row */}
              <tr>
                <td colSpan={5} className="px-3 py-2">
                  <form onSubmit={(e) => {
                    e.preventDefault();
                    const input = (e.target as HTMLFormElement).elements.namedItem("addTicker") as HTMLInputElement;
                    const sym = input.value.trim().toUpperCase();
                    if (!sym) return;
                    if (!extraTickers.includes(sym) && !positions?.some((p) => p.ticker === sym)) {
                      setExtraTickers((prev) => [...prev, sym]);
                    }
                    input.value = "";
                  }} className="flex items-center gap-2">
                    <input type="text" name="addTicker" placeholder="Add ticker (e.g. VOO)" autoComplete="off"
                      className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white placeholder-gray-600 uppercase w-48" />
                    <button type="submit" className="text-xs text-gray-500 hover:text-white flex items-center gap-1">+ Add</button>
                  </form>
                </td>
              </tr>
            </tbody>
          </table>
          {(!positions || positions.length === 0) && (
            <p className="text-gray-600 text-center py-8">No positions — add tickers first.</p>
          )}
        </div>
        </div>
      )}

      {/* Settings Dialog */}
      {showSettings && portfolio && (
        <PortfolioSettings
          portfolioId={portfolioId}
          name={portfolio.name}
          description={portfolio.description}
          currency={portfolio.currency}
          cutoffDate={portfolio.cutoffDate ?? ""}
          dipThreshold={portfolio.dipThreshold ?? 5}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}

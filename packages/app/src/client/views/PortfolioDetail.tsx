import { useState, useEffect, useRef } from "react";
import { ArrowLeft, Plus, X, RefreshCw, Trash2, Settings, LayoutList, BarChart3, Database, ExternalLink } from "lucide-react";
import { Tooltip } from "../components/Tooltip.js";
import { trpc } from "../trpc.js";
import { useNav, type SubTab } from "../hooks/useNav.js";
import { PositionDetail } from "./PositionDetail.js";
import { DateInput } from "../components/DateInput.js";
import { WhatIfChart } from "../components/WhatIfChart.js";
import { PortfolioSettings } from "../components/PortfolioSettings.js";
import { fmtDate, fmtMonthYear, fmtUsd, fmtUsdAbs, fmtPctAbs, glColor } from "../fmt.js";
import { getLivePrice, getLiveAlerts, livePortfolioTotals, livePortfolioDayChange, livePositionGL, liveDayChange, avgDownOpportunity, avgDownColor, volatilityColor, gradeColor, signalColor, fmtDividendYield, lastTradingDate, pendingBackfillTickers, isMarketOpen, marketCountdown, fmtCountdown } from "../live.js";
import { InfoTip } from "../components/InfoTip.js";


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
  const openMutation = trpc.openPosition.useMutation();
  const addLotMutation = trpc.addLot.useMutation();
  const backfillMutation = trpc.requestBackfill.useMutation();
  const utils = trpc.useUtils();

  const { route, nav } = useNav();
  const subTab = route.page === "portfolio" ? route.tab : "positions";
  const setSubTab = (tab: SubTab) => nav.toPortfolio(portfolioId, tab);
  const [showSettings, setShowSettings] = useState(false);
  const [showAdd, setShowAdd] = useState<false | "positions" | "lots">(false);
  const [sortCol, setSortCol] = useState<string>("marketValue");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const toggleSort = (col: string) => {
    if (sortCol === col) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir(col === "ticker" ? "asc" : "desc"); }
  };

  const { data: allTickerData } = trpc.getTickers.useQuery();
  const tickerSymbols = positions?.map((p) => p.ticker).filter(Boolean) ?? [];
  const { data: liveQuotes, dataUpdatedAt: quotesUpdatedAt } = trpc.getQuotes.useQuery(
    { symbols: tickerSymbols },
    { enabled: tickerSymbols.length > 0, refetchInterval: 300_000 }
  );
  const { data: quoteStats } = trpc.getQuoteStats.useQuery(undefined, { refetchInterval: 300_000 });
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const getSortVal = (pos: any, col: string) => {
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
  const [tickers, setTickers] = useState("");
  const [adding, setAdding] = useState(false);

  // Lot grid state
  type LotRow = { ticker: string; type: "buy" | "sell"; quantity: string; price: string; fees: string; notes: string };
  const emptyRow = (): LotRow => ({ ticker: "", type: "buy", quantity: "", price: "", fees: "0", notes: "" });
  const [lotDate, setLotDate] = useState(new Date().toISOString().split("T")[0]);
  const [lotRows, setLotRows] = useState<LotRow[]>([emptyRow(), emptyRow(), emptyRow()]);

  // Backfill state
  const cutoffDate = portfolio?.cutoffDate || "2024-01-01";
  const [backfillStatus, setBackfillStatus] = useState<Record<string, { loading: boolean; result?: string }>>({});
  const [backfillingAll, setBackfillingAll] = useState(false);
  const recomputeMutation = trpc.recomputeAllIndicators.useMutation();
  const [backfillFrom, setBackfillFrom] = useState<string | null>(null);
  const effectiveBackfillFrom = backfillFrom ?? cutoffDate;

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

  const updateRow = (i: number, field: keyof LotRow, value: string) => {
    setLotRows((rows) => rows.map((r, idx) => idx === i ? { ...r, [field]: value } : r));
  };

  const handleAddPositions = async (e: React.FormEvent) => {
    e.preventDefault();
    const symbols = tickers.split(/[\s,;]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
    if (symbols.length === 0) return;
    setAdding(true);
    for (const symbol of symbols) {
      try { await openMutation.mutateAsync({ portfolioId, ticker: symbol }); } catch { /* skip */ }
    }
    utils.getPositionsByPortfolio.invalidate();
    utils.getPortfolioSummary.invalidate();
    utils.getTickers.invalidate();
    setAdding(false);
    setShowAdd(false);
    setTickers("");
  };

  const handleSubmitLots = async (e: React.FormEvent) => {
    e.preventDefault();
    const validRows = lotRows.filter((r) => r.ticker.trim() && Number(r.quantity) > 0 && Number(r.price) > 0);
    if (validRows.length === 0) return;
    setAdding(true);
    const uniqueTickers = new Set(validRows.map((r) => r.ticker.trim().toUpperCase()));
    for (const sym of uniqueTickers) {
      try { await openMutation.mutateAsync({ portfolioId, ticker: sym }); } catch { /* already open */ }
    }
    for (const row of validRows) {
      try {
        await addLotMutation.mutateAsync({
          portfolioId, ticker: row.ticker.trim().toUpperCase(),
          lot: { id: `lot-${crypto.randomUUID().slice(0, 8)}`, type: row.type, transaction_date: lotDate, quantity: Number(row.quantity), price: Number(row.price), fees: Number(row.fees || 0), notes: row.notes },
        });
      } catch (err) { console.error(`Failed lot for ${row.ticker}:`, err); }
    }
    utils.getPositionsByPortfolio.invalidate();
    utils.getPortfolioSummary.invalidate();
    utils.getTickers.invalidate();
    setAdding(false);
    setShowAdd(false);
    setLotDate(new Date().toISOString().split("T")[0]);
    setLotRows([emptyRow(), emptyRow(), emptyRow()]);
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
      utils.getTickers.invalidate();
      utils.getTicker.invalidate();
      utils.getTickerPrices.invalidate();
      utils.getMissingPrices.invalidate();
      utils.getPriceDateRange.invalidate();
      utils.getPortfolioSummary.invalidate();
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
    utils.getPortfolioSummary.invalidate();
    utils.getPosition.invalidate();
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
      utils.getTickers.invalidate();
      utils.getTicker.invalidate();
      utils.getQuotes.invalidate();
      utils.getPortfolioSummary.invalidate();
      utils.getPosition.invalidate();
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

  if (route.page === "position" && route.portfolioId === portfolioId) {
    const pos = positions?.find((p) => p.ticker === route.ticker);
    if (!pos) return <div className="text-gray-500">Loading...</div>;
    return (
      <PositionDetail positionId={pos.id} portfolioId={portfolioId} ticker={route.ticker} cutoffDate={cutoffDate}
        dipThreshold={portfolio?.dipThreshold ?? 5} onBack={() => nav.toPortfolio(portfolioId)} />
    );
  }


  const subTabs: { id: SubTab; label: string; icon: React.ReactNode }[] = [
    { id: "positions", label: "Positions", icon: <LayoutList size={14} /> },
    { id: "analysis", label: "Analysis", icon: <BarChart3 size={14} /> },
    { id: "prices", label: "Price Data", icon: <Database size={14} /> },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button onClick={onBack} className="text-sm text-gray-500 hover:text-gray-300 flex items-center gap-1">
          <ArrowLeft size={14} /> Back to portfolios
        </button>
        {(() => {
          const target = lastTradingDate();
          const marketOpen = isMarketOpen();
          const refreshCount = quoteStats?.refreshCount ?? 0;
          const nextUpdateIn = quotesUpdatedAt ? Math.max(0, 300_000 - (now - quotesUpdatedAt)) : 0;
          const lastRefreshAgo = quoteStats?.lastRefreshTs ? now - quoteStats.lastRefreshTs : 0;
          return (
            <div className="flex items-center gap-2 text-[10px]">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-gray-300 font-medium">Live Quotes</span>
                <span className="text-gray-600">every 5 min · next in {fmtCountdown(nextUpdateIn)}</span>
              </div>
              <div className="flex items-center gap-3 ml-2">
                <div><span className="text-gray-600">Refreshes</span> <span className="text-gray-300 ml-0.5">{refreshCount}</span></div>
                {lastRefreshAgo > 0 && <div><span className="text-gray-600">Last</span> <span className="text-gray-300 ml-0.5">{fmtCountdown(lastRefreshAgo)} ago</span></div>}
                {autoBackfilling && <span className="flex items-center gap-0.5 text-amber-400"><RefreshCw size={8} className="animate-spin" /> Syncing...</span>}
              </div>
              {(() => { const mc = marketCountdown(); return (
              <div className="flex items-center gap-3 ml-2">
                <span className={marketOpen ? "text-emerald-400" : "text-gray-600"}>{marketOpen ? "Market open" : "Closed"} · {mc.label} {fmtCountdown(mc.ms)}</span>
                <span><span className="text-gray-600">Last Close</span> <span className="text-gray-300 ml-0.5">{fmtDate(target)}</span></span>
              </div>
              ); })()}
            </div>
          );
        })()}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-xl font-semibold text-white">{portfolio?.name}</h2>
            <p className="text-xs text-gray-500">
              {portfolio?.description && <>{portfolio.description} &middot; </>}
              {portfolio?.currency}
              {cutoffDate && <> &middot; Since {fmtDate(cutoffDate)}</>}
            </p>
          </div>
          <nav className="flex gap-0.5 ml-2">
            {subTabs.map((t) => (
              <button key={t.id} onClick={() => setSubTab(t.id)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1 ${
                  subTab === t.id ? "bg-gray-800 text-white" : "text-gray-500 hover:text-white hover:bg-gray-800/50"
                }`}>
                {t.icon} {t.label}
              </button>
            ))}
          </nav>
          <Tooltip label="Settings">
            <button onClick={() => setShowSettings(true)} className="text-gray-600 hover:text-gray-300 transition-colors ml-1">
              <Settings size={14} />
            </button>
          </Tooltip>
        </div>
        {summary && (() => {
          const live = livePortfolioTotals(summary.positions, liveQuotes);
          const day = livePortfolioDayChange(summary.positions, liveQuotes, allTickerData ?? undefined);
          return (
          <div className="hidden md:flex items-start gap-6 text-right">
            <div>
              <div className="text-sm text-gray-600 uppercase">Cost</div>
              <div className="text-lg font-semibold text-white">{fmtUsd(summary.totalCost)}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600 uppercase">Value</div>
              <div className="text-lg font-semibold text-white">{fmtUsd(live.totalValue)}</div>
              <div className={`text-[10px] ${glColor(day.chg)}`}>{fmtUsdAbs(day.chg)} ({fmtPctAbs(day.pct)})</div>
            </div>
            <div>
              <div className="text-sm text-gray-600 uppercase">G/L</div>
              <div className={`text-lg font-semibold ${glColor(live.gl)}`}>{fmtUsdAbs(live.gl)}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600 uppercase">Return</div>
              <div className={`text-lg font-semibold ${glColor(live.glPct)}`}>{fmtPctAbs(live.glPct)}</div>
            </div>
          </div>
          );
        })()}
      </div>


      {subTab === "positions" && !showAdd && (
        <div className="flex justify-end gap-2 my-auto py-1">
          <button onClick={() => setShowAdd("lots")} className="bg-indigo-600 hover:bg-indigo-500 text-white px-2.5 py-1 rounded-md text-xs font-medium flex items-center gap-1"><Plus size={12} /> Add Lots</button>
          <button onClick={() => setShowAdd("positions")} className="bg-gray-700 hover:bg-gray-600 text-gray-300 px-2.5 py-1 rounded-md text-xs font-medium flex items-center gap-1"><Plus size={12} /> Add Tickers</button>
        </div>
      )}

      {/* === Positions Tab === */}
      {subTab === "positions" && (
        <>
          {showAdd === "positions" && (
            <form onSubmit={handleAddPositions} className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-4 flex flex-wrap gap-3">
              <input type="text" placeholder="Ticker symbols (e.g. AAPL, MSFT, GOOG)" value={tickers} onChange={(e) => setTickers(e.target.value)} autoFocus
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500" required />
              <div className="flex gap-2">
                <button type="submit" disabled={adding} className="bg-indigo-600 hover:bg-indigo-500 text-white px-2.5 py-1 rounded-md text-xs font-medium disabled:opacity-50 flex items-center gap-1">{adding ? "Adding..." : <><Plus size={12} /> Open</>}</button>
                <button type="button" onClick={() => setShowAdd(false)} className="bg-gray-700 hover:bg-gray-600 text-gray-300 px-2.5 py-1 rounded-md text-xs font-medium flex items-center gap-1"><X size={12} /> Cancel</button>
              </div>
            </form>
          )}

          {showAdd === "lots" && (
            <form onSubmit={handleSubmitLots} className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-4 space-y-3 overflow-x-auto">
              <div className="flex items-center gap-3 mb-2">
                <DateInput value={lotDate} onChange={setLotDate} label="Date" />
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-xs text-gray-500 uppercase">
                    <th className="text-left px-1 py-1 w-24">Ticker</th>
                    <th className="text-left px-1 py-1 w-20">Type</th>
                    <th className="text-right px-1 py-1 w-24">Quantity</th>
                    <th className="text-right px-1 py-1 w-24">Price</th>
                    <th className="text-right px-1 py-1 w-20">Fees</th>
                    <th className="text-left px-1 py-1">Notes</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {lotRows.map((row, i) => (
                    <tr key={i}>
                      <td className="px-1 py-1"><input type="text" value={row.ticker} onChange={(e) => updateRow(i, "ticker", e.target.value.toUpperCase())} placeholder="AAPL" autoFocus={i === 0} className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-white placeholder-gray-600" /></td>
                      <td className="px-1 py-1"><select value={row.type} onChange={(e) => updateRow(i, "type", e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-white"><option value="buy">Buy</option><option value="sell">Sell</option></select></td>
                      <td className="px-1 py-1"><input type="number" step="any" value={row.quantity} onChange={(e) => updateRow(i, "quantity", e.target.value)} placeholder="0" className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-white text-right placeholder-gray-600" /></td>
                      <td className="px-1 py-1"><input type="number" step="0.01" value={row.price} onChange={(e) => updateRow(i, "price", e.target.value)} placeholder="0.00" className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-white text-right placeholder-gray-600" /></td>
                      <td className="px-1 py-1"><input type="number" step="0.01" value={row.fees} onChange={(e) => updateRow(i, "fees", e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-white text-right" /></td>
                      <td className="px-1 py-1"><input type="text" value={row.notes} onChange={(e) => updateRow(i, "notes", e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-white placeholder-gray-600" /></td>
                      <td className="px-1 py-1">{lotRows.length > 1 && <button type="button" onClick={() => setLotRows((r) => r.filter((_, idx) => idx !== i))} className="text-gray-600 hover:text-red-400 px-1"><Trash2 size={12} /></button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => setLotRows((r) => [...r, emptyRow()])} className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1"><Plus size={12} /> Add row</button>
                <div className="flex-1" />
                <button type="submit" disabled={adding} className="bg-indigo-600 hover:bg-indigo-500 text-white px-2.5 py-1 rounded-md text-xs font-medium disabled:opacity-50 flex items-center gap-1">{adding ? "Adding..." : <><Plus size={12} /> Submit Lots</>}</button>
                <button type="button" onClick={() => setShowAdd(false)} className="bg-gray-700 hover:bg-gray-600 text-gray-300 px-2.5 py-1 rounded-md text-xs font-medium flex items-center gap-1"><X size={12} /> Cancel</button>
              </div>
            </form>
          )}

          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-x-auto">
            <table className="w-full text-base">
              <thead>
                <tr className="border-b border-gray-800">
                  {[
                    { key: "ticker", label: "Ticker", align: "left" },
                    { key: "totalShares", label: "Shares", align: "right" },
                    { key: "avgCostBasis", label: "Avg Cost", align: "right" },
                    { key: "currentPrice", label: "Current", align: "right" },
                    { key: "marketValue", label: "Mkt Value", align: "right" },
                    { key: "unrealizedGL", label: "G/L", align: "right" },
                    { key: "unrealizedGLPercent", label: "G/L %", align: "right" },
                    { key: "lots", label: "Lots", align: "right" },
                    { key: "pe", label: "P/E", align: "right" },
                    { key: "yield", label: "Yield", align: "right" },
                  ].map((col) => (
                    <th key={col.key} onClick={() => toggleSort(col.key)}
                      className={`text-${col.align} px-3 py-2 text-xs text-gray-500 uppercase cursor-pointer hover:text-gray-300 select-none whitespace-nowrap`}>
                      {col.label}{sortCol === col.key ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                    </th>
                  ))}
                  <th onClick={() => toggleSort("volatility")}
                    className="text-right px-3 py-2 text-xs text-gray-500 uppercase cursor-pointer hover:text-gray-300 select-none whitespace-nowrap">
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
                        <div className="text-gray-400 text-[11px] leading-tight">Composite of RSI, Bollinger, MA trend, timing, and volume at entry</div>
                        <table className="font-mono text-[11px]">
                          <tbody>
                            <tr><td className="text-emerald-400 pr-2">A</td><td>85+ — excellent entry</td></tr>
                            <tr><td className="text-emerald-400 pr-2">B</td><td>70+ — good entry</td></tr>
                            <tr><td className="text-amber-400 pr-2">C</td><td>55+ — average entry</td></tr>
                            <tr><td className="text-red-400 pr-2">D</td><td>40+ — poor entry</td></tr>
                            <tr><td className="text-red-400 pr-2">F</td><td>&lt;40 — bad entry</td></tr>
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
                    <td className="px-3 py-2 text-right text-gray-300">{pos.totalShares.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-gray-300">{fmtUsd(pos.avgCostBasis)}</td>
                    {(() => { const td = allTickerData?.find((t) => t.symbol === pos.ticker); const price = getLivePrice(liveQuotes, pos.ticker, pos.currentPrice); const pc = liveQuotes?.[pos.ticker]?.previousClose ?? td?.previousClose ?? 0; const day = liveDayChange(price, pc); const posGL = livePositionGL(pos.totalShares, pos.avgCostBasis, price); return <><td className={`px-3 py-2 text-right ${glColor(day.chg)}`}>{fmtUsd(price)}<div className="text-[10px]">{pc > 0 ? fmtPctAbs(day.pct) : ""}</div></td><td className="px-3 py-2 text-right text-gray-300">{fmtUsd(posGL.mv)}</td><td className={`px-3 py-2 text-right font-medium ${glColor(posGL.gl)}`}>{fmtUsdAbs(posGL.gl)}</td><td className={`px-3 py-2 text-right font-medium ${glColor(posGL.glPct)}`}>{fmtPctAbs(posGL.glPct)}</td></>; })()}
                    <td className="px-3 py-2 text-right text-gray-500">{pos.lots}</td>
                    <td className="px-3 py-2 text-right text-gray-300">{bulkFundamentals?.[pos.ticker]?.trailingPE?.toFixed(1) ?? "—"}</td>
                    <td className="px-3 py-2 text-right text-gray-300">{fmtDividendYield(bulkFundamentals?.[pos.ticker]?.dividendYield)}</td>
                    {(() => { const v = allTickerData?.find((t) => t.symbol === pos.ticker)?.volatility30d ?? 0; return <td className={`px-3 py-2 text-right ${volatilityColor(v)}`}>{v.toFixed(1)}%</td>; })()}
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
        </>
      )}

      {/* === Analysis Tab === */}
      {subTab === "analysis" && (
        <WhatIfChart portfolioId={portfolioId} cutoffDate={cutoffDate} onSelectTicker={(ticker) => nav.toPosition(portfolioId, ticker)} />
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
              {[...(positions ?? [])].sort((a, b) => {
                const ta = allTickerData?.find((t) => t.symbol === a.ticker);
                const tb = allTickerData?.find((t) => t.symbol === b.ticker);
                const pa = ta?.priceCount ?? 0;
                const pb = tb?.priceCount ?? 0;
                return pa - pb; // unfilled first
              }).map((pos) => {
                const ticker = allTickerData?.find((t) => t.symbol === pos.ticker);
                const bfStatus = backfillStatus[pos.ticker];
                const total = ticker?.priceCount ?? 0;
                const firstDate = ticker?.firstPriceDate || "";
                const lastDate = ticker?.lastPriceDate || "";
                // In range: ticker has data that covers the slider range
                const inRange = !!firstDate && firstDate <= effectiveBackfillFrom && (lastDate >= today || lastDate >= recentCutoff);
                const weekdays = countWeekdays(effectiveBackfillFrom, lastDate || today);
                const pct = inRange ? 100 : total === 0 ? 0 : Math.min(99, Math.round(total / weekdays * 100));
                const filled = inRange;
                const barColor = pct === 0 ? "bg-red-500" : filled ? "bg-emerald-500" : "bg-amber-500";
                return (
                  <tr key={pos.ticker} className="border-b border-gray-800/50">
                    <td className="px-3 py-2">
                      <span className="font-medium text-white">{pos.ticker}</span>
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
                            <button onClick={() => handleBackfill(pos.ticker)} disabled={anyLoading}
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
              })}
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

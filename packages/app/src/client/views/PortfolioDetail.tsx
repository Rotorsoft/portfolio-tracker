import { useState } from "react";
import { trpc } from "../trpc.js";
import { PositionDetail } from "./PositionDetail.js";
import { DateInput } from "../components/DateInput.js";
import { WhatIfChart } from "../components/WhatIfChart.js";
import { PortfolioSettings } from "../components/PortfolioSettings.js";
import { fmtDate, fmtDateShort, fmtMonthYear } from "../fmt.js";
import { InfoTip } from "../components/InfoTip.js";

type SelectedPos = { id: string; ticker: string } | null;

type SubTab = "positions" | "analysis" | "prices";

type Props = {
  portfolioId: string;
  onBack: () => void;
};

export function PortfolioDetail({ portfolioId, onBack }: Props) {
  const { data: portfolio } = trpc.getPortfolio.useQuery({ id: portfolioId });
  const { data: summary } = trpc.getPortfolioSummary.useQuery({ portfolioId });
  const { data: positions } = trpc.getPositionsByPortfolio.useQuery({ portfolioId });
  const openMutation = trpc.openPosition.useMutation();
  const addLotMutation = trpc.addLot.useMutation();
  const backfillMutation = trpc.requestBackfill.useMutation();
  const utils = trpc.useUtils();

  const [subTab, setSubTab] = useState<SubTab>("positions");
  const [selectedPosition, setSelectedPosition] = useState<SelectedPos>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showAdd, setShowAdd] = useState<false | "positions" | "lots">(false);
  const [sortCol, setSortCol] = useState<string>("marketValue");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const toggleSort = (col: string) => {
    if (sortCol === col) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir(col === "ticker" ? "asc" : "desc"); }
  };

  const sortedPositions = [...(summary?.positions ?? [])].sort((a, b) => {
    const av = (a as any)[sortCol] ?? 0;
    const bv = (b as any)[sortCol] ?? 0;
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
    setBackfillingAll(false);
  };
  const anyLoading = backfillingAll || Object.values(backfillStatus).some((s) => s.loading);
  const { data: allTickerData } = trpc.getTickers.useQuery();
  const { data: priceRange } = trpc.getPriceDateRange.useQuery();
  const recentCutoff = new Date(new Date(today).getTime() - 3 * 86400000).toISOString().split("T")[0];
  const allFilled = positions && positions.length > 0 && positions.every((p) => {
    const t = allTickerData?.find((td) => td.symbol === p.ticker);
    const coversStart = !!t?.firstPriceDate && t.firstPriceDate <= effectiveBackfillFrom;
    const endDate = t?.lastPriceDate || today;
    const coversEnd = endDate >= today || endDate >= recentCutoff;
    return (t?.priceCount ?? 0) > 0 && coversStart && coversEnd;
  });

  if (selectedPosition) {
    return (
      <PositionDetail positionId={selectedPosition.id} portfolioId={portfolioId} ticker={selectedPosition.ticker} cutoffDate={cutoffDate}
        onBack={() => setSelectedPosition(null)} />
    );
  }

  const glColor = (val: number) => val >= 0 ? "text-emerald-400" : "text-red-400";
  const fmt = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
  const fmtPct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;

  const subTabs: { id: SubTab; label: string }[] = [
    { id: "positions", label: "Positions" },
    { id: "analysis", label: "Analysis" },
    { id: "prices", label: "Price Data" },
  ];

  return (
    <div>
      <button onClick={onBack} className="text-sm text-gray-500 hover:text-gray-300 mb-4 flex items-center gap-1">
        &larr; Back to portfolios
      </button>

      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-xl font-semibold text-white">{portfolio?.name}</h2>
          <p className="text-sm text-gray-500 mt-1">
            {portfolio?.description && <>{portfolio.description} &middot; </>}
            {portfolio?.currency}
            {cutoffDate && <> &middot; Since {fmtDate(cutoffDate)}</>}
          </p>
        </div>
        <button onClick={() => setShowSettings(true)} className="text-gray-500 hover:text-gray-300 transition-colors" title="Portfolio settings">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
          </svg>
        </button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wider">Total Cost</div>
            <div className="text-lg font-semibold text-white mt-1">{fmt(summary.totalCost)}</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wider">Market Value</div>
            <div className="text-lg font-semibold text-white mt-1">{fmt(summary.totalMarketValue)}</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wider">Unrealized G/L</div>
            <div className={`text-lg font-semibold mt-1 ${glColor(summary.totalUnrealizedGL)}`}>{fmt(summary.totalUnrealizedGL)}</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wider">Return</div>
            <div className={`text-lg font-semibold mt-1 ${glColor(summary.totalUnrealizedGLPercent)}`}>{fmtPct(summary.totalUnrealizedGLPercent)}</div>
          </div>
        </div>
      )}

      {/* Sub-tabs */}
      <div className="flex items-center justify-between mb-4">
        <nav className="flex gap-1">
          {subTabs.map((t) => (
            <button key={t.id} onClick={() => setSubTab(t.id)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                subTab === t.id ? "bg-gray-800 text-white" : "text-gray-500 hover:text-white hover:bg-gray-800/50"
              }`}>
              {t.label}
            </button>
          ))}
        </nav>
        {subTab === "positions" && !showAdd && (
          <div className="flex gap-2">
            <button onClick={() => setShowAdd("lots")} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium">Add Lots</button>
            <button onClick={() => setShowAdd("positions")} className="bg-gray-700 hover:bg-gray-600 text-gray-300 px-4 py-2 rounded-lg text-sm font-medium">Add Tickers</button>
          </div>
        )}
        {subTab === "prices" && (
          allFilled ? (
            <span className="text-emerald-400 text-sm">&#10003; All filled</span>
          ) : (
            <button onClick={handleBackfillAll} disabled={anyLoading} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
              {backfillingAll ? "Backfilling..." : "Backfill All"}
            </button>
          )
        )}
      </div>

      {/* === Positions Tab === */}
      {subTab === "positions" && (
        <>
          {showAdd === "positions" && (
            <form onSubmit={handleAddPositions} className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-4 flex gap-3">
              <input type="text" placeholder="Ticker symbols (e.g. AAPL, MSFT, GOOG)" value={tickers} onChange={(e) => setTickers(e.target.value)} autoFocus
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500" required />
              <div className="flex gap-2">
                <button type="submit" disabled={adding} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">{adding ? "Adding..." : "Open"}</button>
                <button type="button" onClick={() => setShowAdd(false)} className="bg-gray-700 hover:bg-gray-600 text-gray-300 px-4 py-2 rounded-lg text-sm font-medium">Cancel</button>
              </div>
            </form>
          )}

          {showAdd === "lots" && (
            <form onSubmit={handleSubmitLots} className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-4 space-y-3">
              <div className="flex items-center gap-3 mb-2">
                <DateInput value={lotDate} onChange={setLotDate} label="Date" />
              </div>
              <table className="w-full text-sm">
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
                      <td className="px-1 py-1">{lotRows.length > 1 && <button type="button" onClick={() => setLotRows((r) => r.filter((_, idx) => idx !== i))} className="text-gray-600 hover:text-red-400 text-xs px-1">&times;</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => setLotRows((r) => [...r, emptyRow()])} className="text-xs text-gray-500 hover:text-gray-300">+ Add row</button>
                <div className="flex-1" />
                <button type="submit" disabled={adding} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">{adding ? "Adding..." : "Submit Lots"}</button>
                <button type="button" onClick={() => setShowAdd(false)} className="bg-gray-700 hover:bg-gray-600 text-gray-300 px-4 py-2 rounded-lg text-sm font-medium">Cancel</button>
              </div>
            </form>
          )}

          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
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
                  ].map((col) => (
                    <th key={col.key} onClick={() => toggleSort(col.key)}
                      className={`text-${col.align} px-4 py-3 text-xs text-gray-500 uppercase cursor-pointer hover:text-gray-300 select-none whitespace-nowrap`}>
                      {col.label}{sortCol === col.key ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                    </th>
                  ))}
                  <th onClick={() => toggleSort("timingScore")}
                    className="text-center px-4 py-3 text-xs text-gray-500 uppercase cursor-pointer hover:text-gray-300 select-none whitespace-nowrap">
                    Timing{sortCol === "timingScore" ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                    <InfoTip>
                      <div className="space-y-1.5">
                        <div className="text-gray-300 font-medium">Entry timing score</div>
                        <table className="font-mono text-[11px]">
                          <tbody>
                            <tr><td className="text-emerald-400 pr-2 text-right">100%</td><td>bought at period low</td></tr>
                            <tr><td className="text-emerald-400 pr-2 text-right">66%+</td><td>great timing</td></tr>
                            <tr><td className="text-amber-400 pr-2 text-right">33%+</td><td>average timing</td></tr>
                            <tr><td className="text-red-400 pr-2 text-right">&lt;33%</td><td>poor timing</td></tr>
                            <tr><td className="text-red-400 pr-2 text-right">0%</td><td>bought at period high</td></tr>
                          </tbody>
                        </table>
                      </div>
                    </InfoTip>
                  </th>
                  <th onClick={() => toggleSort("dcaSavingsPct")}
                    className="text-right px-4 py-3 text-xs text-gray-500 uppercase cursor-pointer hover:text-gray-300 select-none whitespace-nowrap">
                    vs DCA{sortCol === "dcaSavingsPct" ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                    <InfoTip>
                      <div className="space-y-1.5">
                        <div className="text-gray-300 font-medium">vs Dollar-Cost Averaging</div>
                        <div className="text-gray-400 text-[11px] leading-tight">Your entries vs buying daily from first to last lot</div>
                        <table className="font-mono text-[11px]">
                          <tbody>
                            <tr><td className="text-emerald-400 pr-2 text-right">+2%</td><td>you beat DCA by 2%</td></tr>
                            <tr><td className="text-gray-400 pr-2 text-right">0%</td><td>same as DCA</td></tr>
                            <tr><td className="text-red-400 pr-2 text-right">-3%</td><td>DCA was 3% cheaper</td></tr>
                          </tbody>
                        </table>
                      </div>
                    </InfoTip>
                  </th>
                  <th onClick={() => toggleSort("signal")}
                    className="text-center px-4 py-3 text-xs text-gray-500 uppercase cursor-pointer hover:text-gray-300 select-none whitespace-nowrap">
                    Signal{sortCol === "signal" ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                    <InfoTip>
                      <div className="space-y-2">
                        <div className="text-gray-300 font-medium">Trend Signal</div>
                        <div className="text-gray-400 text-[11px] leading-tight">
                          Combines 50-day and 200-day moving average crossover with current price position to gauge trend strength.
                        </div>
                        <table className="text-[11px] w-full border-spacing-y-1" style={{ borderCollapse: "separate" }}>
                          <tbody>
                            <tr>
                              <td className="text-emerald-400 pr-3 font-bold whitespace-nowrap align-top">STRONG BUY</td>
                              <td className="text-gray-300">Price pulled back &gt;2% below MA50 while MA50 &gt; MA200 (golden cross). Dip-buy opportunity in a confirmed uptrend.</td>
                            </tr>
                            <tr>
                              <td className="text-emerald-400 pr-3 font-bold whitespace-nowrap align-top">BUY</td>
                              <td className="text-gray-300">MA50 &gt; MA200 (golden cross). Uptrend intact — price near or above the 50-day average.</td>
                            </tr>
                            <tr>
                              <td className="text-gray-400 pr-3 font-bold whitespace-nowrap align-top">HOLD</td>
                              <td className="text-gray-300">Moving averages are converging or there is not enough price history. No clear directional signal.</td>
                            </tr>
                            <tr>
                              <td className="text-red-400 pr-3 font-bold whitespace-nowrap align-top">SELL</td>
                              <td className="text-gray-300">MA50 &lt; MA200 (death cross). Downtrend confirmed — price near or below the 50-day average.</td>
                            </tr>
                            <tr>
                              <td className="text-red-400 pr-3 font-bold whitespace-nowrap align-top">STRONG SELL</td>
                              <td className="text-gray-300">Price rallied &gt;2% above MA50 while MA50 &lt; MA200 (death cross). Chasing a bear-market bounce.</td>
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
                  <tr key={pos.ticker} onClick={() => setSelectedPosition({ id: pos.positionId, ticker: pos.ticker })}
                    className="border-b border-gray-800/50 hover:bg-gray-800/30 cursor-pointer transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-medium text-white">{pos.ticker}</span>
                      {pos.tickerName && <div className="text-[10px] text-gray-600 truncate max-w-[200px]">{pos.tickerName}</div>}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-300">{pos.totalShares.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-gray-300">{fmt(pos.avgCostBasis)}</td>
                    <td className="px-4 py-3 text-right text-gray-300">{fmt(pos.currentPrice)}</td>
                    <td className="px-4 py-3 text-right text-gray-300">{fmt(pos.marketValue)}</td>
                    <td className={`px-4 py-3 text-right font-medium ${glColor(pos.unrealizedGL)}`}>{fmt(pos.unrealizedGL)}</td>
                    <td className={`px-4 py-3 text-right font-medium ${glColor(pos.unrealizedGLPercent)}`}>{fmtPct(pos.unrealizedGLPercent)}</td>
                    <td className="px-4 py-3 text-right text-gray-500">{pos.lots}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <div className="w-12 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${
                            pos.timingScore >= 66 ? "bg-emerald-500" : pos.timingScore >= 33 ? "bg-amber-500" : "bg-red-500"
                          }`} style={{ width: `${pos.timingScore}%` }} />
                        </div>
                        <span className="text-xs text-gray-500">{pos.timingScore.toFixed(0)}%</span>
                      </div>
                    </td>
                    <td className={`px-4 py-3 text-right text-xs font-medium ${pos.dcaSavingsPct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {pos.dcaSavingsPct >= 0 ? "+" : ""}{pos.dcaSavingsPct.toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                        pos.signal === "strong buy" ? "bg-emerald-500/20 text-emerald-400" :
                        pos.signal === "buy" ? "bg-emerald-500/10 text-emerald-400" :
                        pos.signal === "strong sell" ? "bg-red-500/20 text-red-400" :
                        pos.signal === "sell" ? "bg-red-500/10 text-red-400" :
                        "bg-gray-700 text-gray-400"
                      }`}>{pos.signal?.toUpperCase()}</span>
                    </td>
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
        <div className="space-y-6">
          <WhatIfChart portfolioId={portfolioId} cutoffDate={cutoffDate} />
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
                  <span className="text-sm text-white w-24 text-right font-medium">{fmtDate(effectiveBackfillFrom)}</span>
                </div>
              </div>
            );
          })()}
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase">Symbol</th>
                <th className="text-right px-4 py-3 text-xs text-gray-500 uppercase">Last Price</th>
                <th className="text-right px-4 py-3 text-xs text-gray-500 uppercase">Last Date</th>
                <th className="text-center px-4 py-3 text-xs text-gray-500 uppercase">Prices</th>
                <th className="text-center px-2 py-3 text-xs text-gray-500 uppercase">Action</th>
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
                    <td className="px-4 py-3">
                      <span className="font-medium text-white">{pos.ticker}</span>
                      {ticker?.name && <span className="text-xs text-gray-500 ml-2">{ticker.name}</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-300">
                      {ticker?.lastClose ? `$${ticker.lastClose.toFixed(2)}` : "-"}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500">{ticker?.lastPriceDate ? fmtDate(ticker.lastPriceDate) : "-"}</td>
                      <td className="px-4 py-3">
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
                              className="text-indigo-400 hover:text-indigo-300 text-sm disabled:opacity-50">
                              {bfStatus?.loading ? "Loading..." : "Backfill"}
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
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}

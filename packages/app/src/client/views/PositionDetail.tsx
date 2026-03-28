import { useState } from "react";
import { ArrowLeft, Plus, Upload, Trash2, X } from "lucide-react";
import { Tooltip } from "../components/Tooltip.js";
import { trpc } from "../trpc.js";
import { TickerChart } from "../components/TickerChart.js";
import { DateInput } from "../components/DateInput.js";
import { fmtDate } from "../fmt.js";

type Props = { positionId: string; portfolioId: string; ticker: string; cutoffDate?: string; onBack: () => void };



export function PositionDetail({ positionId, portfolioId, ticker, cutoffDate, onBack }: Props) {
  const { data: position } = trpc.getPosition.useQuery({ positionId });
  const { data: tickerInfo } = trpc.getTicker.useQuery({ symbol: ticker });
  const { data: entry } = trpc.getEntryAnalysis.useQuery({ positionId });
  const { data: overlays } = trpc.getChartOverlays.useQuery({ symbol: ticker });
  const { data: fundamentals } = trpc.getFundamentals.useQuery({ symbol: ticker }, { staleTime: 5 * 60 * 1000 });
  const addMutation = trpc.addLot.useMutation();
  const removeMutation = trpc.removeLot.useMutation();
  const utils = trpc.useUtils();
  const [showAdd, setShowAdd] = useState(false);
  const [addMode, setAddMode] = useState<"single" | "bulk">("single");
  const [lotForm, setLotForm] = useState({
    type: "buy" as "buy" | "sell",
    transaction_date: new Date().toISOString().split("T")[0],
    quantity: "",
    price: "",
    fees: "0",
    notes: "",
  });
  const [bulkText, setBulkText] = useState("");
  const [adding, setAdding] = useState(false);

  const handleAddLot = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdding(true);
    try {
      await addMutation.mutateAsync({
        portfolioId,
        ticker,
        lot: {
          id: `lot-${crypto.randomUUID().slice(0, 8)}`,
          type: lotForm.type,
          transaction_date: lotForm.transaction_date,
          quantity: Number(lotForm.quantity),
          price: Number(lotForm.price),
          fees: Number(lotForm.fees),
          notes: lotForm.notes,
        },
      });
      utils.getPosition.invalidate();
      utils.getPortfolioSummary.invalidate();
      utils.getEntryAnalysis.invalidate();
      setLotForm({ type: "buy", transaction_date: new Date().toISOString().split("T")[0], quantity: "", price: "", fees: "0", notes: "" });
    } catch (err) {
      console.error("Failed to add lot:", err);
    }
    setAdding(false);
  };

  const handleBulkAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    // Parse lines: type, date, quantity, price[, fees[, notes]]
    // Example: buy, 2024-01-15, 100, 150.50, 4.99, Initial buy
    const lines = bulkText.split("\n").map((l) => l.trim()).filter(Boolean);
    setAdding(true);
    for (const line of lines) {
      const parts = line.split(/[,\t]+/).map((p) => p.trim());
      if (parts.length < 4) continue;
      const [type, date, qty, price, fees, ...notesParts] = parts;
      const lotType = type.toLowerCase() === "sell" ? "sell" : "buy";
      try {
        await addMutation.mutateAsync({
          portfolioId,
          ticker,
          lot: {
            id: `lot-${crypto.randomUUID().slice(0, 8)}`,
            type: lotType as "buy" | "sell",
            date,
            quantity: Number(qty),
            price: Number(price),
            fees: Number(fees || 0),
            notes: notesParts.join(", "),
          },
        });
      } catch (err) {
        console.error(`Failed to add lot from line: ${line}`, err);
      }
    }
    utils.getPosition.invalidate();
    utils.getPortfolioSummary.invalidate();
    utils.getEntryAnalysis.invalidate();
    setBulkText("");
    setAdding(false);
    setShowAdd(false);
  };

  const handleRemoveLot = async (lotId: string) => {
    await removeMutation.mutateAsync({ portfolioId, ticker, lotId });
    utils.getPosition.invalidate();
    utils.getPortfolioSummary.invalidate();
    utils.getEntryAnalysis.invalidate();
  };

  if (!position) return <div className="text-gray-500">Loading...</div>;

  const fmt = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
  const glColor = (val: number) => val >= 0 ? "text-emerald-400" : "text-red-400";

  // Grade: crossover is primary factor, price vs MA50 is secondary
  // Uptrend (golden cross): A = dip below MA50, B = near/above MA50
  // No trend: C
  // Downtrend (death cross): D = below MA50 (falling knife), F = above MA50 (chasing)
  const ma50Map = new Map(overlays?.ma50?.map((m) => [m.date, m.value]) ?? []);
  const ma200Map = new Map(overlays?.ma200?.map((m) => [m.date, m.value]) ?? []);
  const computeGrade = (price: number, ma50: number, ma200: number) => {
    const vsMa50 = ((price - ma50) / ma50) * 100;
    const goldenCross = ma50 > ma200 && ma200 > 0;
    const deathCross = ma50 < ma200 && ma200 > 0;
    if (goldenCross && vsMa50 < -2) return "A";  // dip buy in uptrend
    if (goldenCross) return "B";                   // buying in uptrend
    if (deathCross && vsMa50 > 2) return "F";      // chasing in downtrend
    if (deathCross) return "D";                     // buying in downtrend
    return "C";                                     // no clear trend
  };
  const lotGrade = (lot: { type: string; transactionDate: string; price: number }) => {
    if (lot.type !== "buy") return null;
    const ma50 = ma50Map.get(lot.transactionDate);
    if (!ma50) return null;
    const ma200 = ma200Map.get(lot.transactionDate) ?? 0;
    return computeGrade(lot.price, ma50, ma200);
  };
  const currentGrade = (lot: { type: string; price: number }) => {
    if (lot.type !== "buy") return null;
    const ma50 = tickerInfo?.ma50;
    if (!ma50) return null;
    const ma200 = tickerInfo?.ma200 ?? 0;
    return computeGrade(lot.price, ma50, ma200);
  };
  const gradeColor = (g: string) =>
    g === "A" ? "bg-emerald-500/20 text-emerald-400" :
    g === "B" ? "bg-emerald-500/10 text-emerald-400" :
    g === "C" ? "bg-amber-500/10 text-amber-400" :
    g === "D" ? "bg-red-500/10 text-red-400" :
    "bg-red-500/20 text-red-400";
  const gradeLabel = (g: string) =>
    g === "A" ? "Dip buy in uptrend" :
    g === "B" ? "Buying in uptrend" :
    g === "C" ? "No clear trend" :
    g === "D" ? "Buying in downtrend" :
    "Chasing in downtrend";

  return (
    <div>
      <button onClick={onBack} className="text-sm text-gray-500 hover:text-gray-300 mb-4 flex items-center gap-1">
        <ArrowLeft size={14} /> Back to portfolio
      </button>

      {(() => {
        const shares = position.totalShares ?? 0;
        const cost = position.totalCost ?? 0;
        const avgCost = position.avgCostBasis ?? 0;
        const currentPrice = tickerInfo?.lastClose ?? 0;
        const marketValue = shares * currentPrice;
        const unrealizedGL = marketValue - cost;
        const glPct = cost > 0 ? (unrealizedGL / cost) * 100 : 0;
        const fmtCap = (n: number) => n >= 1e12 ? `$${(n / 1e12).toFixed(1)}T` : n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(0)}M` : `$${n.toLocaleString()}`;
        const a = entry?.analysis;
        const f = fundamentals;
        const ti = tickerInfo;
        const vsMa50 = ti && ti.ma50 > 0 ? ((currentPrice - ti.ma50) / ti.ma50 * 100) : 0;
        const vsMa200 = ti && ti.ma200 > 0 ? ((currentPrice - ti.ma200) / ti.ma200 * 100) : 0;
        const goldenCross = ti ? ti.ma50 > ti.ma200 && ti.ma200 > 0 : false;
        const deathCross = ti ? ti.ma50 < ti.ma200 && ti.ma200 > 0 : false;
        const signalColor =
          ti?.signal === "strong buy" ? "bg-emerald-500/20 text-emerald-400" :
          ti?.signal === "buy" ? "bg-emerald-500/10 text-emerald-400" :
          ti?.signal === "strong sell" ? "bg-red-500/20 text-red-400" :
          ti?.signal === "sell" ? "bg-red-500/10 text-red-400" :
          "bg-gray-700 text-gray-400";
        const recommendation =
          ti?.signal === "strong buy" ? `Dip buy — price ${Math.abs(vsMa50).toFixed(1)}% below MA50 in uptrend` :
          ti?.signal === "buy" ? `Uptrend — golden cross, ${Math.abs(vsMa50).toFixed(1)}% vs MA50` :
          ti?.signal === "strong sell" ? `Bear rally — ${Math.abs(vsMa50).toFixed(1)}% above MA50 in downtrend` :
          ti?.signal === "sell" ? `Downtrend — death cross, ${Math.abs(vsMa50).toFixed(1)}% vs MA50` :
          "MAs converging — no clear trend";

        const hasFundamentals = f && (f.trailingPE != null || f.epsTrailing != null || f.dividendYield != null || f.marketCap != null || f.sector);

        return (
          <div className="mb-3">
            {/* Title row with signal + recommendation */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold text-white">
                  {position.ticker}
                  {ti?.name && <span className="text-sm font-normal text-gray-400 ml-2">{ti.name}</span>}
                </h2>
                {ti && <>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${signalColor}`}>{ti.signal?.toUpperCase()}</span>
                  <span className={`text-xs ${ti.signal?.includes("buy") ? "text-emerald-400" : ti.signal?.includes("sell") ? "text-red-400" : "text-gray-500"}`}>{recommendation}</span>
                </>}
              </div>
              <button
                onClick={() => setShowAdd(!showAdd)}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-2.5 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1"
              >
                {showAdd ? <><X size={12} /> Cancel</> : <><Plus size={12} /> Add Lot</>}
              </button>
            </div>
            {/* Stats groups */}
            <div className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3">
              <div className="flex justify-between">
                {/* Position */}
                <div className="pr-5 border-r border-gray-800 flex-1">
                  <div className="text-[10px] text-gray-500 font-medium uppercase tracking-wider mb-1.5">Position</div>
                  <div className="flex justify-between">
                    <div className="text-center"><div className="text-[11px] text-gray-500">Shares</div><div className="text-sm font-semibold text-white">{shares.toLocaleString()}</div><div className="text-[11px] text-gray-600">Avg {fmt(avgCost)}</div></div>
                    <div className="text-center"><div className="text-[11px] text-gray-500">Cost</div><div className="text-sm font-semibold text-white">{fmt(cost)}</div></div>
                    <div className="text-center"><div className="text-[11px] text-gray-500">Value</div><div className="text-sm font-semibold text-white">{currentPrice > 0 ? fmt(marketValue) : "—"}</div>{currentPrice > 0 && <div className="text-[11px] text-gray-600">@ {fmt(currentPrice)}</div>}</div>
                    <div className="text-center"><div className="text-[11px] text-gray-500">G/L</div><div className={`text-sm font-semibold ${glColor(unrealizedGL)}`}>{currentPrice > 0 ? fmt(unrealizedGL) : "—"}</div>{currentPrice > 0 && <div className={`text-[11px] ${glColor(glPct)}`}>{Math.abs(glPct).toFixed(1)}%</div>}</div>
                  </div>
                </div>
                {/* Market Data (technicals + fundamentals) */}
                {ti && (
                  <div className="px-5 border-r border-gray-800 shrink-0">
                    <div className="text-[10px] text-gray-500 font-medium uppercase tracking-wider mb-1.5">Market</div>
                    <div className="flex gap-4">
                      <div className="text-center"><div className="text-[11px] text-gray-500">Price</div><div className="text-sm font-semibold text-white">{fmt(currentPrice)}</div></div>
                      <div className="text-center"><div className="text-[11px] text-gray-500">52wk</div><div className="text-sm text-white whitespace-nowrap">${ti.yearlyLow.toFixed(2)} – ${ti.yearlyHigh.toFixed(2)}</div><div className="text-[11px] text-gray-600">Vol {ti.volatility30d.toFixed(1)}%</div></div>
                      {hasFundamentals && <>
                        {f.trailingPE != null && <div className="text-center"><div className="text-[11px] text-gray-500">P/E</div><div className="text-sm text-white">{f.trailingPE.toFixed(1)}</div>{f.forwardPE != null && <div className="text-[11px] text-gray-600">Fwd {f.forwardPE.toFixed(1)}</div>}</div>}
                        {f.epsTrailing != null && <div className="text-center"><div className="text-[11px] text-gray-500">EPS</div><div className="text-sm text-white">${f.epsTrailing.toFixed(2)}</div>{f.epsForward != null && <div className="text-[11px] text-gray-600">Fwd ${f.epsForward.toFixed(2)}</div>}</div>}
                        {f.dividendYield != null && <div className="text-center"><div className="text-[11px] text-gray-500">Yield</div><div className="text-sm text-white">{(f.dividendYield * 100).toFixed(2)}%</div></div>}
                        {f.marketCap != null && <div className="text-center"><div className="text-[11px] text-gray-500">Mkt Cap</div><div className="text-sm text-white">{fmtCap(f.marketCap)}</div></div>}
                        {f.sector && <div className="text-center"><div className="text-[11px] text-gray-500">Sector</div><div className="text-sm text-gray-300">{f.sector}</div>{f.industry && <div className="text-[11px] text-gray-600">{f.industry}</div>}</div>}
                      </>}
                    </div>
                  </div>
                )}
                {/* Timing */}
                {a && ti && (() => {
                  const grade = computeGrade(avgCost, ti.ma50, ti.ma200);
                  const gradeBg = grade === "A" ? "bg-emerald-500/10 border-emerald-500/20" : grade === "B" ? "bg-emerald-500/5 border-emerald-500/10" : grade === "C" ? "bg-amber-500/5 border-amber-500/10" : "bg-red-500/5 border-red-500/10";
                  const gradeText = grade === "A" || grade === "B" ? "text-emerald-400" : grade === "C" ? "text-amber-400" : "text-red-400";
                  return (
                  <div className={`pl-5 flex-1 -my-3 -mr-4 py-3 pr-4 rounded-r-lg border-l ${gradeBg}`}>
                    <div className="text-[10px] text-gray-500 font-medium uppercase tracking-wider mb-1.5">Grade <Tooltip label={`${grade}: ${grade === "A" ? "Dip buy in uptrend — entry below MA50 during golden cross" : grade === "B" ? "Buying in uptrend — golden cross confirmed" : grade === "C" ? "No clear trend — MAs converging" : grade === "D" ? "Buying in downtrend — death cross confirmed" : "Chasing in downtrend — entry above MA50 during death cross"}`} icon><span className={`text-sm font-bold ${gradeText}`}>{grade}</span></Tooltip></div>
                    <div className="flex justify-between">
                      <div className="text-center"><Tooltip label="Price vs 50/200-day MAs" icon><span className="text-[11px] text-gray-500">MAs</span></Tooltip><div className="text-sm"><span className={`font-medium ${vsMa50 >= 0 ? "text-emerald-400" : "text-red-400"}`}>{Math.abs(vsMa50).toFixed(1)}%</span><span className="text-gray-600"> / </span><span className={`font-medium ${vsMa200 >= 0 ? "text-emerald-400" : "text-red-400"}`}>{ti.ma200 > 0 ? `${Math.abs(vsMa200).toFixed(1)}%` : "—"}</span></div></div>
                      <div className="text-center"><Tooltip label="Golden Cross = uptrend, Death Cross = downtrend" icon><span className="text-[11px] text-gray-500">Cross</span></Tooltip><div className={`text-sm font-medium ${goldenCross ? "text-emerald-400" : deathCross ? "text-red-400" : "text-gray-400"}`}>{goldenCross ? "Golden ↑" : deathCross ? "Death ↓" : "—"}</div></div>
                      <div className="text-center"><Tooltip label="100% = bought at low, 0% = at high" icon><span className="text-[11px] text-gray-500">Score</span></Tooltip><div className={`text-sm font-semibold ${a.timingScore >= 66 ? "text-emerald-400" : a.timingScore >= 33 ? "text-amber-400" : "text-red-400"}`}>{a.timingScore.toFixed(0)}%</div></div>
                      <div className="text-center"><Tooltip label="Your entry vs dollar-cost averaging" icon><span className="text-[11px] text-gray-500">DCA</span></Tooltip><div className={`text-sm font-semibold ${glColor(a.dcaSavingsPct)}`}>{Math.abs(a.dcaSavingsPct).toFixed(1)}%</div></div>
                      <div className="text-center"><Tooltip label="Max drawdown / days underwater" icon><span className="text-[11px] text-gray-500">DD</span></Tooltip><div className="text-sm"><span className="font-semibold text-red-400">{position.maxDrawdown > 0 ? `${position.maxDrawdown.toFixed(1)}%` : "—"}</span><span className="text-gray-600"> {position.daysUnderwater}d</span></div></div>
                      <div className="text-center"><Tooltip label="Entry price vs MA50 at time of purchase" icon><span className="text-[11px] text-gray-500">Entry</span></Tooltip><div className={`text-sm font-medium ${position.entryVsMa50 <= 0 ? "text-emerald-400" : "text-amber-400"}`}>{Math.abs(position.entryVsMa50).toFixed(1)}%</div></div>
                    </div>
                  </div>
                  );
                })()}
              </div>
            </div>
          </div>
        );
      })()}

      <TickerChart symbol={position.ticker} lots={position.lots ?? []} cutoffDate={cutoffDate} />

      {showAdd && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6 space-y-3">
          <div className="flex gap-2 mb-2">
            <button onClick={() => setAddMode("single")}
              className={`text-xs px-3 py-1 rounded-md ${addMode === "single" ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-white"}`}>
              Single
            </button>
            <button onClick={() => setAddMode("bulk")}
              className={`text-xs px-3 py-1 rounded-md ${addMode === "bulk" ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-white"}`}>
              Bulk (CSV)
            </button>
          </div>

          {addMode === "single" ? (
            <form onSubmit={handleAddLot} className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <select value={lotForm.type} onChange={(e) => setLotForm({ ...lotForm, type: e.target.value as "buy" | "sell" })}
                  className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white">
                  <option value="buy">Buy</option>
                  <option value="sell">Sell</option>
                </select>
                <DateInput value={lotForm.transaction_date} onChange={(v) => setLotForm({ ...lotForm, transaction_date: v })} />
                <input type="number" placeholder="Quantity" step="any" value={lotForm.quantity}
                  onChange={(e) => setLotForm({ ...lotForm, quantity: e.target.value })}
                  className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500" required />
                <input type="number" placeholder="Price" step="0.01" value={lotForm.price}
                  onChange={(e) => setLotForm({ ...lotForm, price: e.target.value })}
                  className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input type="number" placeholder="Fees" step="0.01" value={lotForm.fees}
                  onChange={(e) => setLotForm({ ...lotForm, fees: e.target.value })}
                  className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500" />
                <input type="text" placeholder="Notes" value={lotForm.notes}
                  onChange={(e) => setLotForm({ ...lotForm, notes: e.target.value })}
                  className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500" />
              </div>
              <button type="submit" disabled={adding}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-2.5 py-1 rounded-md text-xs font-medium disabled:opacity-50 flex items-center gap-1">
                {adding ? "Adding..." : <><Plus size={12} /> Add Lot</>}
              </button>
            </form>
          ) : (
            <form onSubmit={handleBulkAdd} className="space-y-3">
              <textarea
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                placeholder={"Paste lots, one per line:\nbuy, 2024-01-15, 100, 150.50, 4.99, Initial buy\nsell, 2024-06-01, 50, 180.00, 4.99, Took profits"}
                rows={6}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
              />
              <p className="text-xs text-gray-600">Format: type, date, quantity, price, fees, notes</p>
              <button type="submit" disabled={adding}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-2.5 py-1 rounded-md text-xs font-medium disabled:opacity-50 flex items-center gap-1">
                {adding ? "Adding..." : <><Upload size={12} /> Add All Lots</>}
              </button>
            </form>
          )}
        </div>
      )}

      {/* Lots Table — consolidated with entry analysis */}
      {(() => {
        const entryMap = new Map(entry?.analysis?.lots.map((a) => [a.lotId, a]) ?? []);
        return (
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden mb-6">
            <div className="px-4 py-3 border-b border-gray-800">
              <h3 className="font-medium text-white">Lots</h3>
            </div>
            <table className="w-full text-sm">
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
                {(position.lots ?? []).map((lot) => {
                  const a = entryMap.get(lot.id);
                  return (
                    <tr key={lot.id} className="border-b border-gray-800/50">
                      <td className="px-3 py-2">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                          lot.type === "buy" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                        }`}>{lot.type.toUpperCase()}</span>
                      </td>
                      <td className="px-3 py-2 text-gray-300">{fmtDate(lot.transactionDate)}</td>
                      <td className="px-3 py-2 text-right text-gray-300">{lot.quantity}</td>
                      <td className="px-3 py-2 text-right text-gray-300">{fmt(lot.price)}</td>
                      <td className="px-3 py-2 text-right text-white font-medium">{fmt(lot.quantity * lot.price + lot.fees)}</td>
                      <td className="px-3 py-2 text-center">
                        {(() => {
                          const entry = lotGrade(lot);
                          const now = currentGrade(lot);
                          if (!entry && !now) return <span className="text-gray-600">—</span>;
                          return (
                            <div className="flex items-center justify-center gap-1">
                              {entry && <span title={`Entry: ${gradeLabel(entry)}`} className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${gradeColor(entry)}`}>{entry}</span>}
                              {entry && now && <span className="text-gray-600 text-[10px]">→</span>}
                              {now && <span title={`Now: ${gradeLabel(now)}`} className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${gradeColor(now)}`}>{now}</span>}
                            </div>
                          );
                        })()}
                      </td>
                      <td className={`px-3 py-2 text-right text-xs ${a ? glColor(-a.vsAvg) : "text-gray-600"}`}>
                        {a ? `${a.vsAvg >= 0 ? "+" : ""}${a.vsAvgPct.toFixed(1)}%` : "—"}
                      </td>
                      <td className="px-3 py-2">
                        {a ? (
                          <div className="flex items-center justify-center gap-1">
                            <div className="w-12 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${
                                a.timingScore >= 66 ? "bg-emerald-500" : a.timingScore >= 33 ? "bg-amber-500" : "bg-red-500"
                              }`} style={{ width: `${a.timingScore}%` }} />
                            </div>
                            <span className="text-xs text-gray-500">{a.timingScore.toFixed(0)}%</span>
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
    </div>
  );
}

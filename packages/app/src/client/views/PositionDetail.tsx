import { useState } from "react";
import { trpc } from "../trpc.js";
import { TickerChart } from "../components/TickerChart.js";
import { DateInput } from "../components/DateInput.js";
import { fmtDate } from "../fmt.js";

type Props = { positionId: string; portfolioId: string; ticker: string; cutoffDate?: string; onBack: () => void };

export function PositionDetail({ positionId, portfolioId, ticker, cutoffDate, onBack }: Props) {
  const { data: position } = trpc.getPosition.useQuery({ positionId });
  const { data: tickerInfo } = trpc.getTicker.useQuery({ symbol: ticker });
  const { data: entry } = trpc.getEntryAnalysis.useQuery({ positionId });
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

  return (
    <div>
      <button onClick={onBack} className="text-sm text-gray-500 hover:text-gray-300 mb-4 flex items-center gap-1">
        &larr; Back to portfolio
      </button>

      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-xl font-semibold text-white">
            {position.ticker}
            {tickerInfo?.name && <span className="text-sm font-normal text-gray-400 ml-2">{tickerInfo.name}</span>}
          </h2>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          {showAdd ? "Cancel" : "Add Lot"}
        </button>
      </div>

      {(() => {
        const shares = position.totalShares ?? 0;
        const cost = position.totalCost ?? 0;
        const avgCost = position.avgCostBasis ?? 0;
        const currentPrice = tickerInfo?.lastClose ?? 0;
        const marketValue = shares * currentPrice;
        const unrealizedGL = marketValue - cost;
        const glPct = cost > 0 ? (unrealizedGL / cost) * 100 : 0;
        return (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
              <div className="text-xs text-gray-500 uppercase">Shares</div>
              <div className="text-lg font-semibold text-white mt-1">{shares.toLocaleString()}</div>
              <div className="text-xs text-gray-500">Avg {fmt(avgCost)}</div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
              <div className="text-xs text-gray-500 uppercase">Total Cost</div>
              <div className="text-lg font-semibold text-white mt-1">{fmt(cost)}</div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
              <div className="text-xs text-gray-500 uppercase">Market Value</div>
              <div className="text-lg font-semibold text-white mt-1">{currentPrice > 0 ? fmt(marketValue) : "-"}</div>
              <div className="text-xs text-gray-500">{currentPrice > 0 ? `@ ${fmt(currentPrice)}` : ""}</div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
              <div className="text-xs text-gray-500 uppercase">Unrealized G/L</div>
              <div className={`text-lg font-semibold mt-1 ${glColor(unrealizedGL)}`}>
                {currentPrice > 0 ? fmt(unrealizedGL) : "-"}
              </div>
              {currentPrice > 0 && (
                <div className={`text-xs ${glColor(glPct)}`}>{glPct >= 0 ? "+" : ""}{glPct.toFixed(1)}%</div>
              )}
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
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
                {adding ? "Adding..." : "Add Lot"}
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
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
                {adding ? "Adding..." : "Add All Lots"}
              </button>
            </form>
          )}
        </div>
      )}

      {/* Lots Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden mb-6">
        <div className="px-4 py-3 border-b border-gray-800">
          <h3 className="font-medium text-white">Lots</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="text-left px-4 py-2 text-xs text-gray-500 uppercase">Type</th>
              <th className="text-left px-4 py-2 text-xs text-gray-500 uppercase">Date</th>
              <th className="text-right px-4 py-2 text-xs text-gray-500 uppercase">Qty</th>
              <th className="text-right px-4 py-2 text-xs text-gray-500 uppercase">Price</th>
              <th className="text-right px-4 py-2 text-xs text-gray-500 uppercase">Fees</th>
              <th className="text-right px-4 py-2 text-xs text-gray-500 uppercase">Total</th>
              <th className="text-left px-4 py-2 text-xs text-gray-500 uppercase">Notes</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {(position.lots ?? []).map((lot) => (
              <tr key={lot.id} className="border-b border-gray-800/50">
                <td className="px-4 py-2">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                    lot.type === "buy" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                  }`}>{lot.type.toUpperCase()}</span>
                </td>
                <td className="px-4 py-2 text-gray-300">{fmtDate(lot.transactionDate)}</td>
                <td className="px-4 py-2 text-right text-gray-300">{lot.quantity}</td>
                <td className="px-4 py-2 text-right text-gray-300">{fmt(lot.price)}</td>
                <td className="px-4 py-2 text-right text-gray-500">{fmt(lot.fees)}</td>
                <td className="px-4 py-2 text-right text-white font-medium">{fmt(lot.quantity * lot.price + lot.fees)}</td>
                <td className="px-4 py-2 text-gray-500 truncate max-w-[120px]">{lot.notes}</td>
                <td className="px-4 py-2 text-right">
                  <button onClick={() => handleRemoveLot(lot.id)} className="text-red-400 hover:text-red-300 text-xs">Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Entry Analysis */}
      {entry?.analysis && (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
              <div className="text-xs text-gray-500 uppercase">Your Avg Entry</div>
              <div className="text-lg font-semibold text-white mt-1">{fmt(entry.analysis.actualAvgEntry)}</div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
              <div className="text-xs text-gray-500 uppercase">Period Avg Price</div>
              <div className="text-lg font-semibold text-white mt-1">{fmt(entry.analysis.periodAvg)}</div>
              <div className="text-xs text-gray-500">
                {fmt(entry.analysis.periodLow)} &ndash; {fmt(entry.analysis.periodHigh)}
              </div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
              <div className="text-xs text-gray-500 uppercase">vs DCA</div>
              <div className={`text-lg font-semibold mt-1 ${glColor(entry.analysis.dcaSavings)}`}>
                {entry.analysis.dcaSavings >= 0 ? "+" : ""}{fmt(entry.analysis.dcaSavings)}
              </div>
              <div className={`text-xs ${glColor(entry.analysis.dcaSavingsPct)}`}>
                {entry.analysis.dcaSavingsPct >= 0 ? "Better" : "Worse"} than DCA by {Math.abs(entry.analysis.dcaSavingsPct).toFixed(1)}%
              </div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
              <div className="text-xs text-gray-500 uppercase">Timing Score</div>
              <div className="flex items-center gap-2 mt-1">
                <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${
                    entry.analysis.timingScore >= 66 ? "bg-emerald-500" : entry.analysis.timingScore >= 33 ? "bg-amber-500" : "bg-red-500"
                  }`} style={{ width: `${entry.analysis.timingScore}%` }} />
                </div>
                <span className={`text-sm font-semibold ${
                  entry.analysis.timingScore >= 66 ? "text-emerald-400" : entry.analysis.timingScore >= 33 ? "text-amber-400" : "text-red-400"
                }`}>
                  {entry.analysis.timingScore.toFixed(0)}%
                </span>
              </div>
              <div className="text-xs text-gray-600 mt-1">100% = bought at low, 0% = at high</div>
            </div>
          </div>

          {/* Per-lot breakdown */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-800">
              <h3 className="font-medium text-white text-sm">Entry Points</h3>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left px-4 py-2 text-xs text-gray-500 uppercase">Date</th>
                  <th className="text-right px-4 py-2 text-xs text-gray-500 uppercase">Qty</th>
                  <th className="text-right px-4 py-2 text-xs text-gray-500 uppercase">Price</th>
                  <th className="text-right px-4 py-2 text-xs text-gray-500 uppercase">vs Avg</th>
                  <th className="text-center px-4 py-2 text-xs text-gray-500 uppercase">Timing</th>
                </tr>
              </thead>
              <tbody>
                {entry.analysis.lots.map((a) => (
                  <tr key={a.lotId} className="border-b border-gray-800/50">
                    <td className="px-4 py-2 text-gray-300">{fmtDate(a.date)}</td>
                    <td className="px-4 py-2 text-right text-gray-300">{a.quantity}</td>
                    <td className="px-4 py-2 text-right text-white">{fmt(a.entryPrice)}</td>
                    <td className={`px-4 py-2 text-right ${glColor(-a.vsAvg)}`}>
                      {a.vsAvg >= 0 ? "+" : ""}{fmt(a.vsAvg)} ({a.vsAvgPct >= 0 ? "+" : ""}{a.vsAvgPct.toFixed(1)}%)
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center justify-center gap-1">
                        <div className="w-16 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${
                            a.timingScore >= 66 ? "bg-emerald-500" : a.timingScore >= 33 ? "bg-amber-500" : "bg-red-500"
                          }`} style={{ width: `${a.timingScore}%` }} />
                        </div>
                        <span className="text-xs text-gray-500">{a.timingScore.toFixed(0)}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

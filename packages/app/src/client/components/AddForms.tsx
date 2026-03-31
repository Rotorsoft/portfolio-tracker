import { useState, useRef, memo } from "react";
import { Plus, X, Trash2, Upload } from "lucide-react";
import { trpc } from "../trpc.js";
import { ActionButton } from "./ActionButton.js";
import { DateInput } from "./DateInput.js";

let lastLotDate = new Date().toISOString().split("T")[0];

type AddFormsProps = {
  portfolioId: string;
  onDone: () => void;
};

export const AddTickersForm = memo(function AddTickersForm({ portfolioId, onDone }: AddFormsProps) {
  const [adding, setAdding] = useState(false);
  const openMutation = trpc.openPosition.useMutation();
  const utils = trpc.useUtils();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const tickers = (form.elements.namedItem("tickers") as HTMLInputElement).value;
    const symbols = tickers.split(/[\s,;]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
    if (symbols.length === 0) return;
    setAdding(true);
    for (const symbol of symbols) {
      try { await openMutation.mutateAsync({ portfolioId, ticker: symbol }); } catch { /* skip */ }
    }
    utils.getPositionsByPortfolio.invalidate();
    utils.getPortfolioSummary.invalidate();
    utils.getTickers.invalidate();
    utils.getTicker.invalidate();
    setAdding(false);
    onDone();
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap gap-3">
      <input type="text" name="tickers" placeholder="Ticker symbols (e.g. AAPL, MSFT, GOOG)" autoFocus autoComplete="off"
        className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500" required />
      <div className="flex gap-2">
        <ActionButton type="submit" disabled={adding}>{adding ? "Adding..." : <><Plus size={12} /> Open</>}</ActionButton>
        <ActionButton type="button" variant="secondary" onClick={onDone}><X size={12} /> Cancel</ActionButton>
      </div>
    </form>
  );
});

export const AddLotsForm = memo(function AddLotsForm({ portfolioId, onDone }: AddFormsProps) {
  const [lotDate, setLotDateState] = useState(lastLotDate);
  const setLotDate = (v: string) => { lastLotDate = v; setLotDateState(v); };
  const [rowCount, setRowCount] = useState(3);
  const [adding, setAdding] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const openMutation = trpc.openPosition.useMutation();
  const addLotMutation = trpc.addLot.useMutation();
  const recomputeMutation = trpc.recomputeAllIndicators.useMutation();
  const utils = trpc.useUtils();

  const invalidateAll = () => {
    utils.invalidate();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const form = formRef.current!;
    const rows: { ticker: string; type: "buy" | "sell"; quantity: number; price: number; fees: number; notes: string }[] = [];
    for (let i = 0; i < rowCount; i++) {
      const ticker = (form.elements.namedItem(`ticker-${i}`) as HTMLInputElement)?.value?.trim().toUpperCase() ?? "";
      const type = (form.elements.namedItem(`type-${i}`) as HTMLSelectElement)?.value as "buy" | "sell";
      const quantity = Number((form.elements.namedItem(`quantity-${i}`) as HTMLInputElement)?.value || 0);
      const price = Number((form.elements.namedItem(`price-${i}`) as HTMLInputElement)?.value || 0);
      const fees = Number((form.elements.namedItem(`fees-${i}`) as HTMLInputElement)?.value || 0);
      const notes = (form.elements.namedItem(`notes-${i}`) as HTMLInputElement)?.value ?? "";
      if (ticker && quantity > 0 && price > 0) rows.push({ ticker, type, quantity, price, fees, notes });
    }
    if (rows.length === 0) return;
    setAdding(true);
    const uniqueTickers = new Set(rows.map((r) => r.ticker));
    for (const sym of uniqueTickers) {
      try { await openMutation.mutateAsync({ portfolioId, ticker: sym }); } catch { /* already open */ }
    }
    for (const row of rows) {
      try {
        await addLotMutation.mutateAsync({
          portfolioId, ticker: row.ticker,
          lot: { id: `lot-${crypto.randomUUID().slice(0, 8)}`, type: row.type, transaction_date: lotDate, quantity: row.quantity, price: row.price, fees: row.fees, notes: row.notes },
        });
      } catch (err) { console.error(`Failed lot for ${row.ticker}:`, err); }
    }
    invalidateAll();
    try { await recomputeMutation.mutateAsync(); } catch {}
    invalidateAll();
    setAdding(false);
    onDone();
  };

  const removeRow = (idx: number) => {
    if (rowCount <= 1) return;
    const form = formRef.current!;
    // Shift values from rows after the removed one
    for (let i = idx; i < rowCount - 1; i++) {
      const next = i + 1;
      (form.elements.namedItem(`ticker-${i}`) as HTMLInputElement).value = (form.elements.namedItem(`ticker-${next}`) as HTMLInputElement).value;
      (form.elements.namedItem(`type-${i}`) as HTMLSelectElement).value = (form.elements.namedItem(`type-${next}`) as HTMLSelectElement).value;
      (form.elements.namedItem(`quantity-${i}`) as HTMLInputElement).value = (form.elements.namedItem(`quantity-${next}`) as HTMLInputElement).value;
      (form.elements.namedItem(`price-${i}`) as HTMLInputElement).value = (form.elements.namedItem(`price-${next}`) as HTMLInputElement).value;
      (form.elements.namedItem(`fees-${i}`) as HTMLInputElement).value = (form.elements.namedItem(`fees-${next}`) as HTMLInputElement).value;
      (form.elements.namedItem(`notes-${i}`) as HTMLInputElement).value = (form.elements.namedItem(`notes-${next}`) as HTMLInputElement).value;
    }
    setRowCount((c) => c - 1);
  };

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-3 overflow-x-auto">
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
          {Array.from({ length: rowCount }, (_, i) => (
            <tr key={i}>
              <td className="px-1 py-1"><input type="text" name={`ticker-${i}`} placeholder="AAPL" autoFocus={i === 0} autoComplete="off" onInput={(e) => { (e.target as HTMLInputElement).value = (e.target as HTMLInputElement).value.toUpperCase(); }} className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-white placeholder-gray-600" /></td>
              <td className="px-1 py-1"><select name={`type-${i}`} defaultValue="buy" className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-white"><option value="buy">Buy</option><option value="sell">Sell</option></select></td>
              <td className="px-1 py-1"><input type="number" name={`quantity-${i}`} step="any" min="0.0001" placeholder="Qty" autoComplete="off" className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-white text-right placeholder-gray-600" /></td>
              <td className="px-1 py-1"><input type="number" name={`price-${i}`} step="0.01" min="0.01" placeholder="Price" autoComplete="off" className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-white text-right placeholder-gray-600" /></td>
              <td className="px-1 py-1"><input type="number" name={`fees-${i}`} step="0.01" min="0" placeholder="Fees" autoComplete="off" className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-white text-right placeholder-gray-600" /></td>
              <td className="px-1 py-1"><input type="text" name={`notes-${i}`} autoComplete="off" className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-white placeholder-gray-600" /></td>
              <td className="px-1 py-1">{rowCount > 1 && <button type="button" onClick={() => removeRow(i)} className="text-gray-600 hover:text-red-400 px-1"><Trash2 size={12} /></button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => setRowCount((c) => c + 1)} className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1"><Plus size={12} /> Add row</button>
        <div className="flex-1" />
        <ActionButton type="submit" disabled={adding}>{adding ? "Adding..." : <><Plus size={12} /> Submit Lots</>}</ActionButton>
        <ActionButton type="button" variant="secondary" onClick={onDone}><X size={12} /> Cancel</ActionButton>
      </div>
    </form>
  );
});

type AddSingleLotFormProps = { portfolioId: string; ticker: string; onDone: () => void };

export const AddSingleLotForm = memo(function AddSingleLotForm({ portfolioId, ticker, onDone }: AddSingleLotFormProps) {
  const [addMode, setAddMode] = useState<"single" | "bulk">("single");
  const [adding, setAdding] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [bulkText, setBulkText] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const addMutation = trpc.addLot.useMutation();
  const recomputeMutation = trpc.recomputeAllIndicators.useMutation();
  const utils = trpc.useUtils();

  const invalidateAll = () => {
    utils.invalidate();
  };

  const invalidateAndRecompute = async () => {
    invalidateAll();
    try { await recomputeMutation.mutateAsync(); } catch {}
    invalidateAll();
  };

  const handleAddLot = async (e: React.FormEvent) => {
    e.preventDefault();
    const form = formRef.current!;
    const type = (form.elements.namedItem("type") as HTMLSelectElement).value as "buy" | "sell";
    const transaction_date = (form.elements.namedItem("transaction_date") as HTMLInputElement).value;
    const quantity = Number((form.elements.namedItem("quantity") as HTMLInputElement).value);
    const price = Number((form.elements.namedItem("price") as HTMLInputElement).value);
    const fees = Number((form.elements.namedItem("fees") as HTMLInputElement).value || 0);
    const notes = (form.elements.namedItem("notes") as HTMLInputElement).value;
    if (quantity <= 0 || price <= 0) return;
    setAdding(true);
    setFeedback(null);
    try {
      await addMutation.mutateAsync({
        portfolioId, ticker,
        lot: { id: `lot-${crypto.randomUUID().slice(0, 8)}`, type, transaction_date, quantity, price, fees, notes },
      });
      setFeedback({ type: "success", message: `Added ${type} ${quantity} × $${price.toFixed(2)} on ${transaction_date}` });
      form.reset();
      await invalidateAndRecompute();
    } catch (err) {
      setFeedback({ type: "error", message: "Failed to add lot" });
      console.error("Failed to add lot:", err);
    }
    setAdding(false);
  };

  const handleBulkAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const lines = bulkText.split("\n").map((l) => l.trim()).filter(Boolean);
    setAdding(true);
    setFeedback(null);
    let added = 0;
    for (const line of lines) {
      const parts = line.split(/[,\t]+/).map((p) => p.trim());
      if (parts.length < 4) continue;
      const [type, date, qty, price, fees, ...notesParts] = parts;
      const lotType = type.toLowerCase() === "sell" ? "sell" : "buy";
      try {
        await addMutation.mutateAsync({
          portfolioId, ticker,
          lot: { id: `lot-${crypto.randomUUID().slice(0, 8)}`, type: lotType as "buy" | "sell", transaction_date: date, quantity: Number(qty), price: Number(price), fees: Number(fees || 0), notes: notesParts.join(", ") },
        });
        added++;
      } catch (err) { console.error(`Failed lot: ${line}`, err); }
    }
    setFeedback({ type: added > 0 ? "success" : "error", message: added > 0 ? `Added ${added} lot${added > 1 ? "s" : ""}` : "No valid lots found" });
    setBulkText("");
    setAdding(false);
    if (added > 0) await invalidateAndRecompute();
  };

  return (
    <div>
      {feedback && (
        <div className={`mb-3 px-3 py-2 rounded-lg text-xs font-medium ${feedback.type === "success" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
          {feedback.type === "success" ? "✓" : "✗"} {feedback.message}
        </div>
      )}
      <div className="flex gap-2 mb-3">
        <button onClick={() => setAddMode("single")} className={`text-xs px-3 py-1 rounded-md ${addMode === "single" ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-white"}`}>Single</button>
        <button onClick={() => setAddMode("bulk")} className={`text-xs px-3 py-1 rounded-md ${addMode === "bulk" ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-white"}`}>Bulk (CSV)</button>
      </div>
      {addMode === "single" ? (
        <form ref={formRef} onSubmit={handleAddLot} className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <select name="type" defaultValue="buy" className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"><option value="buy">Buy</option><option value="sell">Sell</option></select>
            <input type="date" name="transaction_date" defaultValue={lastLotDate} onChange={(e) => { lastLotDate = e.target.value; }} className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white" />
            <input type="number" name="quantity" placeholder="Quantity" step="any" min="0.0001" autoComplete="off" className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500" required />
            <input type="number" name="price" placeholder="Price" step="0.01" min="0.01" autoComplete="off" className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input type="number" name="fees" placeholder="Fees (optional)" step="0.01" min="0" autoComplete="off" className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500" />
            <input type="text" name="notes" placeholder="Notes (optional)" autoComplete="off" className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500" />
          </div>
          <ActionButton type="submit" disabled={adding}>{adding ? "Adding..." : <><Plus size={12} /> Add Lot</>}</ActionButton>
        </form>
      ) : (
        <form onSubmit={handleBulkAdd} className="space-y-3">
          <textarea name="bulkLots" value={bulkText} onChange={(e) => setBulkText(e.target.value)}
            placeholder={"Paste lots, one per line:\nbuy, 2024-01-15, 100, 150.50, 4.99, Initial buy\nsell, 2024-06-01, 50, 180.00, 4.99, Took profits"}
            rows={6} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono" />
          <p className="text-xs text-gray-600">Format: type, date, quantity, price, fees, notes</p>
          <ActionButton type="submit" disabled={adding}>{adding ? "Adding..." : <><Upload size={12} /> Add All Lots</>}</ActionButton>
        </form>
      )}
    </div>
  );
});

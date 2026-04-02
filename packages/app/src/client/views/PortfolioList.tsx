import { useState, useEffect } from "react";
import { Plus } from "lucide-react";
import { Modal } from "../components/Modal.js";
import { MarketMarquee } from "../components/MarketMarquee.js";
import { trpc } from "../trpc.js";
import { fmtUsd, fmtUsdAbs, fmtPctAbs, glColor } from "../fmt.js";
import { shouldPollQuotes, livePortfolioTotals, livePortfolioDayChange } from "../live.js";
import { FormInput } from "../components/FormInput.js";
import { ActionButton } from "../components/ActionButton.js";

export function PortfolioList({ onSelect }: { onSelect: (id: string) => void }) {
  const { data: portfolios, isLoading } = trpc.getPortfolios.useQuery();
  const { data: allTickers } = trpc.getTickers.useQuery();
  const polling = shouldPollQuotes();
  const INDEX_SYMBOLS = ["^DJI", "^GSPC", "^IXIC"];
  const allSymbols = [...new Set([...(allTickers?.map((t) => t.symbol) ?? []), ...INDEX_SYMBOLS])];
  const { data: liveQuotes, dataUpdatedAt: quotesUpdatedAt } = trpc.getQuotes.useQuery(
    { symbols: allSymbols },
    { enabled: allSymbols.length > 0, refetchInterval: polling ? 300_000 : false }
  );
  const { data: quoteStats } = trpc.getQuoteStats.useQuery(undefined, { refetchInterval: polling ? 300_000 : false });
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const createMutation = trpc.createPortfolio.useMutation();
  const utils = trpc.useUtils();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [cutoffDate, setCutoffDate] = useState(new Date().toISOString().split("T")[0]);
  const [dipThreshold, setDipThreshold] = useState(5);
  const [refreshInterval, setRefreshInterval] = useState(300);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await createMutation.mutateAsync({ name: name.trim(), description: description.trim(), cutoffDate, dipThreshold, refreshInterval });
      utils.getPortfolios.invalidate();
      setShowCreate(false);
      setName("");
      setDescription("");
      setDipThreshold(5);
      setRefreshInterval(300);
    } catch (err) {
      console.error("Failed to create portfolio:", err);
    }
  };

  if (isLoading) return <div className="text-gray-500">Loading portfolios...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-white">Portfolios</h2>
        <MarketMarquee now={now} polling={polling} quotesUpdatedAt={quotesUpdatedAt} quoteStats={quoteStats} autoBackfilling={false} quotes={liveQuotes} />
      </div>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Portfolio">
        <form onSubmit={handleCreate} className="space-y-4">
          <FormInput label="Name" type="text" placeholder="Portfolio name" value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
          <FormInput label="Description" type="text" placeholder="Optional" value={description} onChange={(e) => setDescription(e.target.value)} />
          <FormInput label="Cutoff Date" type="date" value={cutoffDate} onChange={(e) => setCutoffDate(e.target.value)}
            hint="Earliest date for price backfills, charts, and analytics" />
          <FormInput label="Dip Threshold (%)" type="number" min={0} max={50} step={1} value={dipThreshold}
            onChange={(e) => setDipThreshold(Number(e.target.value))}
            hint="Price drop % below last buy to highlight avg-down opportunities" />
          <div>
            <label className="block text-xs text-gray-400 mb-1">Live Refresh Interval</label>
            <div className="flex flex-wrap gap-1.5">
              {[
                { value: 10, label: "10s" }, { value: 30, label: "30s" }, { value: 60, label: "1 min" },
                { value: 120, label: "2 min" }, { value: 300, label: "5 min" }, { value: 600, label: "10 min" },
                { value: 900, label: "15 min" }, { value: 1800, label: "30 min" }, { value: 3600, label: "1 hour" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setRefreshInterval(opt.value)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    refreshInterval === opt.value
                      ? "bg-indigo-500/20 text-indigo-400 ring-1 ring-indigo-500/40"
                      : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-300"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-gray-600 mt-1">How often live quotes refresh during market hours</p>
          </div>
          <div className="flex gap-2 pt-1">
            <ActionButton type="submit"><Plus size={14} /> Create</ActionButton>
            <ActionButton variant="secondary" type="button" onClick={() => setShowCreate(false)}>Cancel</ActionButton>
          </div>
        </form>
      </Modal>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {portfolios?.map((p) => (
          <PortfolioCard key={p.id} portfolio={p} onSelect={onSelect} liveQuotes={liveQuotes} allTickers={allTickers} />
        ))}
        <button
          onClick={() => setShowCreate(true)}
          className="group rounded-xl border border-dashed border-gray-700 p-5 flex flex-col items-center justify-center gap-3 min-h-[140px] hover:border-indigo-500/60 hover:bg-indigo-500/5 transition-all"
        >
          <div className="w-10 h-10 rounded-full bg-gray-800 group-hover:bg-indigo-500/20 flex items-center justify-center transition-colors">
            <Plus size={20} className="text-gray-500 group-hover:text-indigo-400 transition-colors" />
          </div>
          <span className="text-sm text-gray-500 group-hover:text-indigo-400 transition-colors font-medium">New Portfolio</span>
        </button>
      </div>
    </div>
  );
}

function PortfolioCard({ portfolio: p, onSelect, liveQuotes, allTickers }: { portfolio: any; onSelect: (id: string) => void; liveQuotes: any; allTickers: any }) {
  const { data: summary } = trpc.getPortfolioSummary.useQuery({ portfolioId: p.id }, { staleTime: 60_000 });
  const posCount = summary?.positions?.length ?? 0;
  const live = summary ? livePortfolioTotals(summary.positions, liveQuotes) : null;
  const day = summary ? livePortfolioDayChange(summary.positions, liveQuotes, allTickers ?? undefined) : null;
  const totalCost = live?.totalCost ?? summary?.totalCost ?? 0;
  const totalValue = live?.totalValue ?? summary?.totalMarketValue ?? 0;
  const gl = totalValue - totalCost;
  const glPct = totalCost > 0 ? (gl / totalCost) * 100 : 0;

  return (
    <button
      onClick={() => onSelect(p.id)}
      className="bg-gray-900 border border-gray-800 rounded-xl p-5 text-left hover:border-indigo-500/50 transition-colors group"
    >
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white group-hover:text-indigo-400 transition-colors">
            {p.name}
          </h3>
          <p className="text-sm text-gray-500 mt-1">{p.description || "\u00A0"}</p>
        </div>
        {summary && posCount > 0 && (() => {
          const alpha = summary.portfolioAlphaPct ?? 0;
          return (
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${alpha >= 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
              {alpha >= 0 ? "+" : ""}{fmtPctAbs(alpha)} α
            </span>
          );
        })()}
      </div>
      {summary && posCount > 0 && (
        <div className="mt-3 flex items-end justify-between">
          <div className="flex gap-8">
            <div className="text-center">
              <div className="text-[10px] text-gray-600 uppercase">Value</div>
              <div className="text-base text-white font-semibold">{fmtUsd(totalValue)}</div>
              {day && (day.chg !== 0) && (
                <div className="text-[10px] mt-0.5 flex flex-col items-center">
                  <div className={`flex items-center gap-0.5 ${glColor(day.chg)}`}>
                    <span className="text-[9px] blink-arrow">{day.chg >= 0 ? "↑" : "↓"}</span>
                    <span>{fmtUsdAbs(day.chg)}</span>
                  </div>
                  <div className={glColor(day.chg)}>{fmtPctAbs(day.pct)}</div>
                </div>
              )}
            </div>
            <div className="text-center">
              <div className="text-[10px] text-gray-600 uppercase">G/L</div>
              <div className={`text-base font-semibold ${glColor(gl)}`}>{fmtUsdAbs(gl)}</div>
              <div className={`text-[10px] ${glColor(gl)}`}>{fmtPctAbs(glPct)}</div>
            </div>
          </div>
          <span className="text-xs text-gray-600">{posCount} position{posCount !== 1 ? "s" : ""}</span>
        </div>
      )}
    </button>
  );
}

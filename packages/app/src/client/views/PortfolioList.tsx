import { useState } from "react";
import { Plus } from "lucide-react";
import { Modal } from "../components/Modal.js";
import { trpc } from "../trpc.js";
import { fmtUsd, fmtUsdAbs, fmtPctAbs, glColor } from "../fmt.js";
import { shouldPollQuotes, livePortfolioTotals, livePortfolioDayChange } from "../live.js";
import { FormInput } from "../components/FormInput.js";
import { ActionButton } from "../components/ActionButton.js";

export function PortfolioList({ onSelect }: { onSelect: (id: string) => void }) {
  const { data: portfolios, isLoading } = trpc.getPortfolios.useQuery();
  const { data: allTickers } = trpc.getTickers.useQuery();
  const polling = shouldPollQuotes();
  const allSymbols = allTickers?.map((t) => t.symbol) ?? [];
  const { data: liveQuotes } = trpc.getQuotes.useQuery(
    { symbols: allSymbols },
    { enabled: allSymbols.length > 0, refetchInterval: polling ? 300_000 : false }
  );
  const createMutation = trpc.createPortfolio.useMutation();
  const utils = trpc.useUtils();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [cutoffDate, setCutoffDate] = useState(new Date().toISOString().split("T")[0]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await createMutation.mutateAsync({ name: name.trim(), description: description.trim(), cutoffDate });
      utils.getPortfolios.invalidate();
      setShowCreate(false);
      setName("");
      setDescription("");
    } catch (err) {
      console.error("Failed to create portfolio:", err);
    }
  };

  if (isLoading) return <div className="text-gray-500">Loading portfolios...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-white">Portfolios</h2>
        <ActionButton onClick={() => setShowCreate(true)}>
          <Plus size={14} /> New Portfolio
        </ActionButton>
      </div>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Portfolio">
        <form onSubmit={handleCreate} className="space-y-3">
          <FormInput type="text" placeholder="Portfolio name" value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
          <FormInput type="text" placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
          <FormInput type="date" label="Cutoff Date" value={cutoffDate} onChange={(e) => setCutoffDate(e.target.value)} />
          <div className="flex gap-2">
            <ActionButton type="submit"><Plus size={14} /> Create</ActionButton>
            <ActionButton variant="secondary" type="button" onClick={() => setShowCreate(false)}>Cancel</ActionButton>
          </div>
        </form>
      </Modal>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {portfolios?.map((p) => (
          <PortfolioCard key={p.id} portfolio={p} onSelect={onSelect} liveQuotes={liveQuotes} allTickers={allTickers} />
        ))}
        {(!portfolios || portfolios.length === 0) && (
          <p className="text-gray-600 col-span-full text-center py-12">
            No portfolios yet. Create one to get started.
          </p>
        )}
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

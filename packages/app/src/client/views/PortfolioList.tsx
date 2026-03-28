import { useState } from "react";
import { Plus, X } from "lucide-react";
import { trpc } from "../trpc.js";
import { fmtDate } from "../fmt.js";

export function PortfolioList({ onSelect }: { onSelect: (id: string) => void }) {
  const { data: portfolios, isLoading } = trpc.getPortfolios.useQuery();
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
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-2.5 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1"
        >
          {showCreate ? <><X size={14} /> Cancel</> : <><Plus size={14} /> New Portfolio</>}
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6 space-y-3">
          <input
            type="text"
            placeholder="Portfolio name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            autoFocus
            required
          />
          <input
            type="text"
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">Cutoff Date</label>
            <input type="date" value={cutoffDate} onChange={(e) => setCutoffDate(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white" />
          </div>
          <button type="submit" className="bg-indigo-600 hover:bg-indigo-500 text-white px-2.5 py-1 rounded-md text-xs font-medium flex items-center gap-1">
            <Plus size={14} /> Create
          </button>
        </form>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {portfolios?.map((p) => (
          <button
            key={p.id}
            onClick={() => onSelect(p.id)}
            className="bg-gray-900 border border-gray-800 rounded-xl p-5 text-left hover:border-indigo-500/50 transition-colors group"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-white group-hover:text-indigo-400 transition-colors">
                  {p.name}
                </h3>
                {p.description && (
                  <p className="text-sm text-gray-500 mt-1">{p.description}</p>
                )}
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                p.status === "active"
                  ? "bg-emerald-500/10 text-emerald-400"
                  : "bg-gray-700 text-gray-400"
              }`}>
                {p.status}
              </span>
            </div>
            <div className="mt-3 text-xs text-gray-600">
              {p.currency}
              {p.cutoffDate && <> &middot; Since {fmtDate(p.cutoffDate)}</>}
              {" "}&middot; Created {fmtDate(p.createdAt?.split("T")[0] ?? "")}
            </div>
          </button>
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

import { useState } from "react";
import { trpc } from "../trpc.js";

type Props = {
  portfolioId: string;
  name: string;
  description: string;
  currency: string;
  cutoffDate: string;
  dipThreshold: number;
  onClose: () => void;
};

export function PortfolioSettings({ portfolioId, name: initName, description: initDesc, currency: initCurrency, cutoffDate: initCutoff, dipThreshold: initDip, onClose }: Props) {
  const [name, setName] = useState(initName);
  const [description, setDescription] = useState(initDesc);
  const [currency, setCurrency] = useState(initCurrency);
  const [cutoffDate, setCutoffDate] = useState(initCutoff);
  const [dipThreshold, setDipThreshold] = useState(initDip);
  const [saving, setSaving] = useState(false);
  const updateMutation = trpc.updatePortfolio.useMutation();
  const utils = trpc.useUtils();

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateMutation.mutateAsync({ id: portfolioId, name, description, currency, cutoffDate, dipThreshold });
      utils.getPortfolio.invalidate();
      onClose();
    } catch (err) {
      console.error("Failed to update portfolio:", err);
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-white">Portfolio Settings</h3>

        <div>
          <label className="text-xs text-gray-500 block mb-1">Name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>

        <div>
          <label className="text-xs text-gray-500 block mb-1">Description</label>
          <input type="text" value={description} onChange={(e) => setDescription(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Currency</label>
            <input type="text" value={currency} onChange={(e) => setCurrency(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Cutoff Date</label>
            <input type="date" value={cutoffDate} onChange={(e) => setCutoffDate(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
        </div>

        <div>
          <label className="text-xs text-gray-500 block mb-1">Dip Threshold (%)</label>
          <input type="number" min={0} max={50} step={1} value={dipThreshold} onChange={(e) => setDipThreshold(Number(e.target.value))}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          <p className="text-[10px] text-gray-600 mt-1">Price drop % below last buy to highlight avg-down opportunities</p>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="bg-gray-700 hover:bg-gray-600 text-gray-300 px-4 py-2 rounded-lg text-sm font-medium">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving || !name.trim()}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

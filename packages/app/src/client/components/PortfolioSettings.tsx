import { useState } from "react";
import { trpc } from "../trpc.js";
import { Modal } from "./Modal.js";
import { FormInput } from "./FormInput.js";
import { ActionButton } from "./ActionButton.js";

const REFRESH_OPTIONS = [
  { value: 10, label: "10s" },
  { value: 30, label: "30s" },
  { value: 60, label: "1 min" },
  { value: 120, label: "2 min" },
  { value: 300, label: "5 min" },
  { value: 600, label: "10 min" },
  { value: 900, label: "15 min" },
  { value: 1800, label: "30 min" },
  { value: 3600, label: "1 hour" },
];

type Props = {
  portfolioId: string;
  name: string;
  description: string;
  currency: string;
  cutoffDate: string;
  dipThreshold: number;
  refreshInterval: number;
  onClose: () => void;
};

export function PortfolioSettings({ portfolioId, name: initName, description: initDesc, currency: initCurrency, cutoffDate: initCutoff, dipThreshold: initDip, refreshInterval: initRefresh, onClose }: Props) {
  const [name, setName] = useState(initName);
  const [description, setDescription] = useState(initDesc);
  const [currency, setCurrency] = useState(initCurrency);
  const [cutoffDate, setCutoffDate] = useState(initCutoff);
  const [dipThreshold, setDipThreshold] = useState(initDip);
  const [refreshInterval, setRefreshInterval] = useState(initRefresh);
  const [saving, setSaving] = useState(false);
  const updateMutation = trpc.updatePortfolio.useMutation();
  const utils = trpc.useUtils();

  const handleSave = async () => {
    setSaving(true);
    try {
      const patch: Record<string, unknown> = { id: portfolioId };
      if (name !== initName) patch.name = name;
      if (description !== initDesc) patch.description = description;
      if (currency !== initCurrency) patch.currency = currency;
      if (cutoffDate !== initCutoff) patch.cutoffDate = cutoffDate;
      if (dipThreshold !== initDip) patch.dipThreshold = dipThreshold;
      if (refreshInterval !== initRefresh) patch.refreshInterval = refreshInterval;
      await updateMutation.mutateAsync(patch as any);
      utils.getPortfolio.invalidate();
      onClose();
    } catch (err) {
      console.error("Failed to update portfolio:", err);
    }
    setSaving(false);
  };

  return (
    <Modal open onClose={onClose} title="Portfolio Settings">
      <div className="space-y-4">
        <FormInput label="Name" type="text" value={name} onChange={(e) => setName(e.target.value)} />
        <FormInput label="Description" type="text" value={description} onChange={(e) => setDescription(e.target.value)} />
        <div className="grid grid-cols-2 gap-4">
          <FormInput label="Currency" type="text" value={currency} onChange={(e) => setCurrency(e.target.value)} />
          <FormInput label="Cutoff Date" type="date" value={cutoffDate} onChange={(e) => setCutoffDate(e.target.value)} />
        </div>
        <FormInput label="Dip Threshold (%)" type="number" min={0} max={50} step={1} value={dipThreshold}
          onChange={(e) => setDipThreshold(Number(e.target.value))}
          hint="Price drop % below last buy to highlight avg-down opportunities" />
        <div>
          <label className="block text-xs text-gray-400 mb-1">Live Refresh Interval</label>
          <div className="flex flex-wrap gap-1.5">
            {REFRESH_OPTIONS.map((opt) => (
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
        <div className="flex justify-end gap-2 pt-2">
          <ActionButton variant="secondary" onClick={onClose}>Cancel</ActionButton>
          <ActionButton onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? "Saving..." : "Save"}
          </ActionButton>
        </div>
      </div>
    </Modal>
  );
}

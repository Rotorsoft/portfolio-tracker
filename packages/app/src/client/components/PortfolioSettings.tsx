import { useState } from "react";
import { trpc } from "../trpc.js";
import { Modal } from "./Modal.js";
import { FormInput } from "./FormInput.js";
import { ActionButton } from "./ActionButton.js";

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

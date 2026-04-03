import { useState } from "react";
import { Download, Trash2, Save, Calendar } from "lucide-react";
import { trpc } from "../trpc.js";
import { ActionButton } from "./ActionButton.js";
import { Modal } from "./Modal.js";

type Holiday = { date: string; name: string; status?: string };

export function HolidayManager({ onClose }: { onClose: () => void }) {
  const { data: saved, refetch } = trpc.getMarketHolidays.useQuery({});
  const fetchMutation = trpc.fetchNYSEHolidays.useQuery(undefined, { enabled: false });
  const syncMutation = trpc.syncMarketHolidays.useMutation();
  const [draft, setDraft] = useState<Holiday[] | null>(null);
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filterYear, setFilterYear] = useState<number | null>(null);

  const handleFetch = async () => {
    setFetching(true);
    try {
      const result = await fetchMutation.refetch();
      if (result.data) {
        // Merge with existing: keep saved ones, add new from NYSE
        const savedDates = new Set(saved?.map((h) => h.date) ?? []);
        const merged = [...(saved ?? []).map((h) => ({ date: h.date, name: h.name, status: "closed" as string }))];
        for (const h of result.data) {
          if (!savedDates.has(h.date)) merged.push({ date: h.date, name: h.name, status: h.status });
        }
        merged.sort((a, b) => a.date.localeCompare(b.date));
        setDraft(merged);
      }
    } catch (err) {
      console.error("Failed to fetch NYSE holidays:", err);
    }
    setFetching(false);
  };

  const handleSave = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      await syncMutation.mutateAsync(draft.map((h) => ({ date: h.date, name: h.name })));
      await refetch();
      setDraft(null);
    } catch (err) {
      console.error("Failed to save holidays:", err);
    }
    setSaving(false);
  };

  const updateDraft = (idx: number, field: keyof Holiday, value: string) => {
    if (!draft) return;
    const next = [...draft];
    next[idx] = { ...next[idx], [field]: value };
    setDraft(next);
  };

  const removeDraft = (idx: number) => {
    if (!draft) return;
    setDraft(draft.filter((_, i) => i !== idx));
  };

  const addDraft = () => {
    const today = new Date().toISOString().split("T")[0];
    setDraft([...(draft ?? saved?.map((h) => ({ ...h, status: "closed" })) ?? []), { date: today, name: "", status: "closed" }]);
  };

  const display = draft ?? saved?.map((h) => ({ ...h, status: "closed" })) ?? [];
  const years = [...new Set(display.map((h) => parseInt(h.date.slice(0, 4))))].sort();
  const filtered = filterYear ? display.filter((h) => h.date.startsWith(`${filterYear}`)) : display;

  return (
    <Modal open onClose={onClose} title="Market Holidays">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-1.5">
            {years.map((y) => (
              <button
                key={y}
                onClick={() => setFilterYear(filterYear === y ? null : y)}
                className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                  filterYear === y
                    ? "bg-indigo-500/20 text-indigo-400 ring-1 ring-indigo-500/40"
                    : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                }`}
              >
                {y}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <ActionButton onClick={handleFetch} disabled={fetching}>
              <Download size={13} /> {fetching ? "Fetching..." : "Fetch NYSE"}
            </ActionButton>
            <ActionButton variant="secondary" onClick={addDraft}>
              <Calendar size={13} /> Add
            </ActionButton>
          </div>
        </div>

        <div className="max-h-[400px] overflow-y-auto space-y-1">
          {filtered.length === 0 && (
            <p className="text-gray-600 text-center py-8 text-sm">No holidays. Click "Fetch NYSE" to load from NYSE.</p>
          )}
          {filtered.map((h, i) => {
            const realIdx = display.indexOf(h);
            const isPast = h.date < new Date().toISOString().split("T")[0];
            return (
              <div key={h.date + i} className={`flex items-center gap-2 rounded-lg px-3 py-1.5 ${isPast ? "opacity-50" : ""} ${draft ? "bg-gray-800/50" : "bg-gray-900"}`}>
                {draft ? (
                  <>
                    <input
                      type="date"
                      value={h.date}
                      onChange={(e) => updateDraft(realIdx, "date", e.target.value)}
                      className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white w-[130px] focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <input
                      type="text"
                      value={h.name}
                      onChange={(e) => updateDraft(realIdx, "name", e.target.value)}
                      className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white flex-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      placeholder="Holiday name"
                    />
                    <button onClick={() => removeDraft(realIdx)} className="text-gray-600 hover:text-red-400 transition-colors p-1">
                      <Trash2 size={13} />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="text-xs text-gray-500 w-[90px] shrink-0">{h.date}</span>
                    <span className="text-xs text-white flex-1">{h.name}</span>
                  </>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex justify-between pt-2 border-t border-gray-800">
          <span className="text-[10px] text-gray-600">Source: NYSE Hours & Calendars</span>
          <div className="flex gap-2">
            {draft && (
              <>
                <ActionButton variant="secondary" onClick={() => setDraft(null)}>Cancel</ActionButton>
                <ActionButton onClick={handleSave} disabled={saving}>
                  <Save size={13} /> {saving ? "Saving..." : `Save ${draft.length} holidays`}
                </ActionButton>
              </>
            )}
            {!draft && <ActionButton variant="secondary" onClick={onClose}>Close</ActionButton>}
          </div>
        </div>
      </div>
    </Modal>
  );
}

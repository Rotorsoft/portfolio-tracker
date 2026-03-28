const TODAY = () => new Date().toISOString().split("T")[0];

export function DateInput({ value, onChange, label, className }: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-1 ${className ?? ""}`}>
      {label && <label className="text-xs text-gray-500">{label}</label>}
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white"
      />
      <button
        type="button"
        onClick={() => onChange(TODAY())}
        className="text-xs text-gray-500 hover:text-indigo-400 px-1.5 py-1 rounded hover:bg-gray-800 transition-colors"
        title="Set to today"
      >
        Today
      </button>
    </div>
  );
}

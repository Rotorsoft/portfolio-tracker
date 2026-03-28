import { useState } from "react";
import type { EventEntry } from "../types.js";
import { fmtDate } from "../fmt.js";

export function EventLog({ events }: { events: EventEntry[] }) {
  const [filter, setFilter] = useState("");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const filtered = filter
    ? events.filter(
        (e) =>
          e.name.toLowerCase().includes(filter.toLowerCase()) ||
          e.stream.toLowerCase().includes(filter.toLowerCase())
      )
    : events;

  const sorted = [...filtered].reverse();

  const toggleExpand = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const eventColor = (name: string) => {
    if (name.startsWith("Portfolio")) return "text-indigo-400 bg-indigo-500/10";
    if (name.startsWith("Position") || name.startsWith("Lot")) return "text-emerald-400 bg-emerald-500/10";
    if (name.startsWith("Ticker") || name.startsWith("Prices") || name.startsWith("Backfill")) return "text-amber-400 bg-amber-500/10";
    return "text-gray-400 bg-gray-500/10";
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-white">Event Log</h2>
        <span className="text-sm text-gray-500">{events.length} events</span>
      </div>

      <input
        type="text"
        placeholder="Filter by event name or stream..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-4"
      />

      <div className="space-y-1">
        {sorted.slice(0, 200).map((e) => (
          <div
            key={e.id}
            className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden"
          >
            <button
              onClick={() => toggleExpand(e.id)}
              className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-gray-800/50 transition-colors"
            >
              <span className="text-xs text-gray-600 font-mono w-8">#{e.id}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${eventColor(e.name)}`}>
                {e.name}
              </span>
              <span className="text-xs text-gray-500 truncate flex-1">{e.stream}</span>
              <span className="text-xs text-gray-600">v{e.version}</span>
              <span className="text-xs text-gray-600">
                {fmtDate(e.created.split("T")[0])} {e.created.split("T")[1]?.slice(0, 8)}
              </span>
            </button>
            {expanded.has(e.id) && (
              <div className="px-4 py-3 border-t border-gray-800 bg-gray-950/50">
                <pre className="text-xs text-gray-400 overflow-auto max-h-48">
                  {JSON.stringify(e.data, null, 2)}
                </pre>
                {e.meta?.causation && (
                  <div className="mt-2 text-xs text-gray-600">
                    Correlation: {e.meta.correlation?.slice(0, 8)}...
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {sorted.length === 0 && (
          <p className="text-gray-600 text-center py-12">
            No events yet. Events will appear here as you interact with the app.
          </p>
        )}
        {sorted.length > 200 && (
          <p className="text-gray-600 text-center py-4 text-sm">
            Showing 200 of {sorted.length} events
          </p>
        )}
      </div>
    </div>
  );
}

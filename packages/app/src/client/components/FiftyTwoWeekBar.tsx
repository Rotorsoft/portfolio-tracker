import { fmtUsd } from "../fmt.js";

type Props = {
  low: number;
  high: number;
  current: number;
  avgCost?: number;
  dayChange: number;
  width?: string;
};

export function FiftyTwoWeekBar({ low, high, current, avgCost, dayChange, width = "w-full" }: Props) {
  const range = high - low;
  if (range <= 0 || low <= 0 || high <= 0) return <span className="text-gray-600">—</span>;

  const pct = Math.max(0, Math.min(100, ((current - low) / range) * 100));
  const costPct = avgCost != null && range > 0 ? Math.max(0, Math.min(100, ((avgCost - low) / range) * 100)) : null;
  const dotColor = dayChange > 0 ? "bg-emerald-400" : dayChange < 0 ? "bg-red-400" : "bg-gray-400";

  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="flex items-center justify-between w-full text-[9px] text-gray-600">
        <span>{fmtUsd(low)}</span>
        <span>{fmtUsd(high)}</span>
      </div>
      <div className={`relative ${width} h-1.5 bg-gray-800 rounded-full`}>
        <div className="absolute top-0 left-0 h-full bg-gray-700 rounded-full" style={{ width: `${pct}%` }} />
        {costPct != null && avgCost! >= low && avgCost! <= high && (
          <div className="absolute w-[2px] bg-yellow-200/70 z-10" style={{ left: `${costPct}%`, top: "-3px", bottom: "-3px", transform: "translateX(-50%)" }} />
        )}
        <div className={`absolute w-2 h-2 rounded-full shadow ${dotColor}`} style={{ left: `calc(${pct}% - 4px)`, top: "-1.25px" }} />
      </div>
    </div>
  );
}

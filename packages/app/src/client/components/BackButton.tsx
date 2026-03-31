import { ArrowLeft } from "lucide-react";

export function BackButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-sm text-gray-500 hover:text-gray-300 flex items-center gap-1 flex-shrink-0 whitespace-nowrap">
      <ArrowLeft size={14} /> {label}
    </button>
  );
}

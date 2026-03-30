import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";

export function Tooltip({ label, children, className, icon }: {
  label: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  icon?: boolean;
}) {
  const [show, setShow] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const rect = show && ref.current ? ref.current.getBoundingClientRect() : null;
  const isRich = typeof label !== "string";
  const isLong = typeof label === "string" && label.length > 80;

  return (
    <span
      ref={ref}
      className={`inline-flex items-start ${icon ? "gap-px" : ""} ${className ?? ""}`}
      onMouseEnter={() => !icon && setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {icon && (
        <span
          onClick={(e) => { e.stopPropagation(); setShow((s) => !s); }}
          className="cursor-help shrink-0 mt-px"
        >
          <Info size={8} className="text-gray-600 hover:text-gray-400" />
        </span>
      )}
      {show && rect && createPortal(
        <div
          className="fixed z-[9999] pointer-events-none"
          style={{ top: rect.bottom + 6, left: rect.left + rect.width / 2, transform: "translateX(-50%)" }}
        >
          <div className={`relative bg-gray-800 border border-gray-700 rounded-md shadow-xl ${isRich || isLong ? "max-w-md px-3 py-2.5 text-xs text-gray-300 leading-relaxed" : "px-2.5 py-1.5 text-xs text-gray-300 whitespace-nowrap"}`}>
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-800 border-l border-t border-gray-700 rotate-45" />
            {label}
          </div>
        </div>,
        document.body
      )}
    </span>
  );
}

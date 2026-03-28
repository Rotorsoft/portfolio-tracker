import { useRef, useState } from "react";
import { createPortal } from "react-dom";

export function Tooltip({ label, children, className }: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [show, setShow] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const rect = show && ref.current ? ref.current.getBoundingClientRect() : null;

  return (
    <span
      ref={ref}
      className={`inline-flex ${className ?? ""}`}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && rect && createPortal(
        <div
          className="fixed z-[9999] pointer-events-none"
          style={{ top: rect.bottom + 6, left: rect.left + rect.width / 2, transform: "translateX(-50%)" }}
        >
          <div className="relative bg-gray-800 border border-gray-700 rounded-md px-2.5 py-1.5 text-xs text-gray-300 shadow-xl whitespace-nowrap">
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-800 border-l border-t border-gray-700 rotate-45" />
            {label}
          </div>
        </div>,
        document.body
      )}
    </span>
  );
}

import { useRef, useState } from "react";
import { createPortal } from "react-dom";

export function InfoTip({ text, children }: { text?: string; children?: React.ReactNode }) {
  const [show, setShow] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  const rect = show && ref.current ? ref.current.getBoundingClientRect() : null;

  return (
    <span className="relative inline-block ml-0.5 -top-1" ref={ref}>
      <span
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        className="inline-flex items-center justify-center w-3 h-3 rounded-full border border-gray-600 text-[8px] text-gray-500 cursor-help select-none hover:border-gray-400 hover:text-gray-400 transition-colors"
      >
        ?
      </span>
      {show && rect && createPortal(
        <div
          className="fixed z-[9999] pointer-events-none"
          style={{ top: rect.bottom + 6, left: rect.left + rect.width / 2, transform: "translateX(-50%)" }}
        >
          <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300 font-normal normal-case w-80 shadow-xl leading-relaxed">
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-800 border-l border-t border-gray-700 rotate-45" />
            {children ?? <span className="whitespace-pre-line font-mono">{text}</span>}
          </div>
        </div>,
        document.body
      )}
    </span>
  );
}

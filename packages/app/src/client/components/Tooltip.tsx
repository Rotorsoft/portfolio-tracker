import { useRef, useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";

export function Tooltip({ label, children, className, icon, block }: {
  label: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  icon?: boolean;
  block?: boolean;
}) {
  const [show, setShow] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const triggerHover = useRef(false);
  const portalHover = useRef(false);
  const ref = useRef<HTMLDivElement>(null);
  const isRich = typeof label !== "string";
  const isLong = typeof label === "string" && label.length > 80;
  const Tag = block ? "div" : "span";

  const check = useCallback(() => {
    if (!triggerHover.current && !portalHover.current) setShow(false);
  }, []);

  const open = useCallback(() => {
    if (ref.current) setRect(ref.current.getBoundingClientRect());
    setShow(true);
  }, []);

  // Update rect on scroll/resize while visible
  useEffect(() => {
    if (!show) return;
    const update = () => { if (ref.current) setRect(ref.current.getBoundingClientRect()); };
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => { window.removeEventListener("scroll", update, true); window.removeEventListener("resize", update); };
  }, [show]);

  return (
    <Tag
      ref={ref as any}
      className={`${block ? "flex" : "inline-flex"} items-start ${icon ? "gap-px" : ""} ${className ?? ""}`}
      onMouseEnter={() => { if (!icon) { triggerHover.current = true; open(); } }}
      onMouseLeave={() => { if (!icon) { triggerHover.current = false; check(); } }}
    >
      {children}
      {icon && (
        <span
          onMouseEnter={() => { triggerHover.current = true; open(); }}
          onMouseLeave={() => { triggerHover.current = false; requestAnimationFrame(check); }}
          onClick={(e) => { e.stopPropagation(); show ? setShow(false) : open(); }}
          className="cursor-help shrink-0 mt-px"
        >
          <Info size={10} className="text-gray-500 hover:text-gray-300" />
        </span>
      )}
      {show && rect && createPortal(
        <div
          className="fixed z-[9999]"
          style={{ top: rect.bottom, left: rect.left + rect.width / 2, transform: "translateX(-50%)" }}
          onMouseEnter={() => { portalHover.current = true; }}
          onMouseLeave={() => { portalHover.current = false; check(); }}
        >
          <div className="pt-1.5">
            <div className={`relative bg-gray-800 border border-gray-700 rounded-md shadow-xl ${isRich || isLong ? "max-w-md px-3 py-2.5 text-xs text-gray-300 leading-relaxed" : "px-2.5 py-1.5 text-xs text-gray-300 whitespace-nowrap"}`}>
              <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-800 border-l border-t border-gray-700 rotate-45" />
              {label}
            </div>
          </div>
        </div>,
        document.body
      )}
    </Tag>
  );
}

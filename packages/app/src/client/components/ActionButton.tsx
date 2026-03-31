type ActionButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary";
};

export function ActionButton({ variant = "primary", children, className, ...props }: ActionButtonProps) {
  const base = variant === "primary"
    ? "bg-indigo-600 hover:bg-indigo-500 text-white"
    : "bg-gray-700 hover:bg-gray-600 text-gray-300";
  return (
    <button
      {...props}
      className={`${base} px-2.5 py-1 rounded-md text-xs font-medium disabled:opacity-50 flex items-center gap-1 transition-colors ${className ?? ""}`}
    >
      {children}
    </button>
  );
}

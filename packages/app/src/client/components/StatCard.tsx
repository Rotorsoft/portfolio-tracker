type StatCardProps = {
  label: string;
  value: React.ReactNode;
  subValue?: React.ReactNode;
  size?: "sm" | "lg";
  color?: string;
  subColor?: string;
};

export function StatCard({ label, value, subValue, size = "lg", color, subColor }: StatCardProps) {
  const labelSize = size === "lg" ? "text-sm" : "text-[10px]";
  const valueSize = size === "lg" ? "text-lg" : "text-sm";
  return (
    <div>
      <div className={`${labelSize} text-gray-600 uppercase`}>{label}</div>
      <div className={`${valueSize} font-semibold ${color ?? "text-white"}`}>{value}</div>
      {subValue && <div className={`text-[10px] ${subColor ?? ""}`}>{subValue}</div>}
    </div>
  );
}

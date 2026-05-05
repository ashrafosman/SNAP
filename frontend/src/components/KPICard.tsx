import type { LucideIcon } from 'lucide-react';

interface Props {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  color?: string;
  trend?: string;
}

export default function KPICard({ title, value, subtitle, icon: Icon, color = 'text-[#6366f1]', trend }: Props) {
  return (
    <div className="bg-[#16161e] border border-[#27272a] rounded-xl p-5">
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs text-[#71717a] font-medium uppercase tracking-wider">{title}</p>
        <Icon className={`w-4 h-4 ${color}`} />
      </div>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {subtitle && <p className="text-xs text-[#71717a] mt-1">{subtitle}</p>}
      {trend && <p className="text-xs text-[#71717a] mt-1">{trend}</p>}
    </div>
  );
}

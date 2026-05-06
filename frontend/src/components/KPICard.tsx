import type { LucideIcon } from 'lucide-react';

interface Props {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  color?: string;
  trend?: string;
}

export default function KPICard({ title, value, subtitle, icon: Icon, color = 'text-[#2e4e84]', trend }: Props) {
  return (
    <div className="bg-white border border-[#D7D7D7] rounded-xl p-5" style={{ borderLeft: '4px solid #f1ad02' }}>
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs text-[#4a5260] font-semibold uppercase tracking-wider">{title}</p>
        <Icon className={`w-4 h-4 ${color}`} />
      </div>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {subtitle && <p className="text-xs text-[#4a5260] mt-1">{subtitle}</p>}
      {trend && <p className="text-xs text-[#4a5260] mt-1">{trend}</p>}
    </div>
  );
}

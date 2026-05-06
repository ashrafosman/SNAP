interface Props { severity: 'HIGH' | 'MEDIUM' | 'LOW'; }

const styles: Record<string, string> = {
  HIGH:   'bg-red-50 text-red-700 border-red-200',
  MEDIUM: 'bg-amber-50 text-amber-700 border-amber-200',
  LOW:    'bg-slate-100 text-slate-600 border-slate-200',
};

export default function SeverityBadge({ severity }: Props) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border ${styles[severity] || styles.LOW}`}>
      {severity}
    </span>
  );
}

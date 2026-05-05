interface Props { severity: 'HIGH' | 'MEDIUM' | 'LOW'; }

const styles: Record<string, string> = {
  HIGH: 'bg-red-500/15 text-red-400 border-red-500/30',
  MEDIUM: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  LOW: 'bg-zinc-700/40 text-zinc-400 border-zinc-600/40',
};

export default function SeverityBadge({ severity }: Props) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border ${styles[severity] || styles.LOW}`}>
      {severity}
    </span>
  );
}

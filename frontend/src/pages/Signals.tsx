import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  GitBranch, Skull, Unlink, Baby, Activity, Receipt,
  ChevronLeft, ChevronRight, CheckCircle2,
} from 'lucide-react';
import { api, type Signal, type SignalsResponse } from '../lib/api';

/* ─── Signal type metadata ─── */
const SIGNAL_META: Record<
  Signal['signal_type'],
  { label: string; color: string; bg: string; border: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  death_match:      { label: 'Death Match',      color: '#dc2626', bg: '#fef2f2', border: '#fecaca', Icon: Skull },
  medicaid_gap:     { label: 'Medicaid Gap',      color: '#d97706', bg: '#fffbeb', border: '#fde68a', Icon: Unlink },
  unreported_birth: { label: 'Unreported Birth',  color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe', Icon: Baby },
  adt_trigger:      { label: 'ADT Trigger',       color: '#0891b2', bg: '#ecfeff', border: '#a5f3fc', Icon: Activity },
  missed_deduction: { label: 'Missed Deduction',  color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', Icon: Receipt },
};

/* ─── Severity badge ─── */
const SEV_STYLES: Record<Signal['severity'], string> = {
  HIGH:   'bg-red-50 text-red-700 border border-red-200',
  MEDIUM: 'bg-amber-50 text-amber-700 border border-amber-200',
  LOW:    'bg-slate-100 text-slate-600 border border-slate-200',
};

/* ─── Status badge ─── */
const STATUS_STYLES: Record<Signal['status'], string> = {
  open:      'bg-blue-50 text-blue-700 border border-blue-200',
  reviewed:  'bg-green-50 text-green-700 border border-green-200',
  dismissed: 'bg-gray-100 text-gray-500 border border-gray-200',
};
const STATUS_LABELS: Record<Signal['status'], string> = {
  open: 'Open',
  reviewed: 'Reviewed',
  dismissed: 'Dismissed',
};

/* ─── Currency formatter ─── */
function fmtUsd(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

/* ─── Skeleton card ─── */
function SkeletonCard() {
  return (
    <div className="bg-white border border-[#D7D7D7] rounded-xl p-5 animate-pulse" style={{ borderLeft: '4px solid #D7D7D7' }}>
      <div className="flex items-center gap-2 mb-3">
        <div className="h-5 w-28 bg-[#F4F4F4] rounded-full" />
        <div className="h-5 w-14 bg-[#F4F4F4] rounded-full" />
        <div className="h-5 w-16 bg-[#F4F4F4] rounded-full" />
        <div className="ml-auto h-4 w-24 bg-[#F4F4F4] rounded" />
      </div>
      <div className="flex items-center gap-3 mb-2">
        <div className="h-5 w-40 bg-[#F4F4F4] rounded" />
        <div className="h-4 w-24 bg-[#F4F4F4] rounded" />
      </div>
      <div className="h-4 w-full bg-[#F4F4F4] rounded mb-3" />
      <div className="flex gap-2">
        <div className="h-5 w-20 bg-[#F4F4F4] rounded" />
        <div className="h-5 w-24 bg-[#F4F4F4] rounded" />
      </div>
    </div>
  );
}

/* ─── Signal card ─── */
function SignalCard({
  signal,
  onUpdateStatus,
}: {
  signal: Signal;
  onUpdateStatus: (id: string, status: 'reviewed' | 'dismissed') => void;
}) {
  const meta = SIGNAL_META[signal.signal_type];
  const { Icon } = meta;

  return (
    <div
      className="bg-white border border-[#D7D7D7] rounded-xl p-5 hover:shadow-[0_4px_14px_rgba(2,37,105,.09)] transition-shadow"
      style={{ borderLeft: `4px solid ${meta.color}` }}
    >
      {/* Row 1: badges + date */}
      <div className="flex flex-wrap items-center gap-2 mb-2.5">
        {/* Type badge */}
        <span
          className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold px-2.5 py-0.5 rounded-full border"
          style={{ color: meta.color, background: meta.bg, borderColor: meta.border }}
        >
          <Icon className="w-3 h-3" />
          {meta.label}
        </span>

        {/* Severity badge */}
        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${SEV_STYLES[signal.severity]}`}>
          {signal.severity}
        </span>

        {/* Status badge */}
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLES[signal.status]}`}>
          {STATUS_LABELS[signal.status]}
        </span>

        {/* Date — right-aligned */}
        <span className="ml-auto text-[11px] text-[#9ca3af] font-medium shrink-0">
          {new Date(signal.detected_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </span>
      </div>

      {/* Row 2: case name + location + error amount */}
      <div className="flex flex-wrap items-center gap-2 mb-1.5">
        <Link
          to={`/cases/${signal.case_id}`}
          className="text-[14px] font-bold text-[#022569] hover:underline"
        >
          {signal.case_name}
        </Link>
        <span className="text-[12.5px] text-[#4a5260]">{signal.city}, {signal.state}</span>
        {signal.error_amount > 0 && (
          <span className="text-[12.5px] font-semibold text-amber-600">{fmtUsd(signal.error_amount)}</span>
        )}
      </div>

      {/* Description */}
      <p className="text-[13px] text-[#4a5260] leading-relaxed mb-3">{signal.description}</p>

      {/* Row 3: source dataset chips + actions */}
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex flex-wrap gap-1.5">
          {signal.source_datasets.map(ds => (
            <span
              key={ds}
              className="text-[10.5px] font-mono bg-[#eaf0f9] text-[#2e4e84] px-2 py-0.5 rounded"
            >
              {ds}
            </span>
          ))}
        </div>

        {signal.status === 'open' && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onUpdateStatus(signal.id, 'reviewed')}
              className="text-[12px] font-semibold text-[#2e4e84] border border-[#2e4e84] bg-[#eaf0f9] hover:bg-[#2e4e84] hover:text-white px-3 py-1 rounded-lg transition-colors"
            >
              Mark Reviewed
            </button>
            <button
              type="button"
              onClick={() => onUpdateStatus(signal.id, 'dismissed')}
              className="text-[12px] font-semibold text-[#4a5260] border border-[#D7D7D7] bg-white hover:bg-[#F4F4F4] px-3 py-1 rounded-lg transition-colors"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Stat card ─── */
function StatCard({
  label,
  value,
  sub,
  leftBorderColor,
  valueCls,
}: {
  label: string;
  value: string | number;
  sub?: string;
  leftBorderColor: string;
  valueCls?: string;
}) {
  return (
    <div
      className="bg-white border border-[#D7D7D7] rounded-xl p-5"
      style={{ borderLeft: `4px solid ${leftBorderColor}` }}
    >
      <p className="text-[11.5px] font-semibold text-[#4a5260] uppercase tracking-[.06em] mb-1">{label}</p>
      <p className={`text-2xl font-extrabold text-[#022569] ${valueCls ?? ''}`}>{value}</p>
      {sub && <p className="text-[11.5px] text-[#9ca3af] mt-0.5">{sub}</p>}
    </div>
  );
}

/* ─── Main page ─── */
export default function Signals() {
  const [data, setData] = useState<SignalsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [signalType, setSignalType] = useState('');
  const [severity, setSeverity] = useState('');
  const [status, setStatus] = useState('open');
  const [page, setPage] = useState(1);

  const load = useCallback(() => {
    setLoading(true);
    api.signals
      .list({
        signal_type: signalType || undefined,
        severity: severity || undefined,
        status: status || undefined,
        page,
        page_size: 20,
      })
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [signalType, severity, status, page]);

  useEffect(() => { load(); }, [load]);

  const handleUpdateStatus = async (id: string, newStatus: 'reviewed' | 'dismissed') => {
    // Optimistic update
    setData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        signals: prev.signals.map(s =>
          s.id === id ? { ...s, status: newStatus } : s
        ),
        summary: {
          ...prev.summary,
          open: Math.max(0, prev.summary.open - 1),
          [newStatus]: prev.summary[newStatus] + 1,
        },
      };
    });
    try {
      await api.signals.updateStatus(id, newStatus);
      load();
    } catch {
      load(); // revert on error
    }
  };

  const summary = data?.summary;

  /* Derived stats */
  const openSignals = data?.signals ?? [];
  const uniqueCases = new Set(openSignals.map(s => s.case_id)).size;
  const openExposure = openSignals
    .filter(s => s.status === 'open')
    .reduce((acc, s) => acc + s.error_amount, 0);
  const highCount = summary?.by_severity?.['HIGH'] ?? 0;

  const start = data ? (data.page - 1) * data.page_size + 1 : 0;
  const end = data ? Math.min(data.page * data.page_size, data.total) : 0;

  const selectCls =
    'bg-white border border-[#D7D7D7] rounded-lg px-3 py-2 text-sm text-[#1f2330] focus:outline-none focus:border-[#2e4e84]';

  return (
    <div className="p-8 max-w-[1300px]">

      {/* ── Hero ── */}
      <div
        className="rounded-2xl px-8 py-7 mb-7 flex flex-wrap items-center gap-6"
        style={{ background: 'linear-gradient(135deg, #022569 0%, #2e4e84 100%)' }}
      >
        <div className="w-14 h-14 rounded-xl bg-[#f1ad02] flex items-center justify-center shrink-0">
          <GitBranch className="w-7 h-7 text-[#1f1611]" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-extrabold text-white mb-1">Cross-Dataset Signals</h1>
          <p className="text-[13.5px] text-white/70 leading-relaxed">
            Anomalies detected by joining SNAP eligibility against ADT encounters, vital records,
            Medicaid enrollment, and clinical diagnoses
          </p>
        </div>
        {summary && (
          <div className="flex flex-wrap gap-3 shrink-0">
            <span className="inline-flex items-center gap-1.5 bg-[#f1ad02] text-[#1f1611] text-[12.5px] font-extrabold px-4 py-2 rounded-full">
              {summary.open} Open
            </span>
            <span className="inline-flex items-center gap-1.5 bg-green-100 text-green-800 text-[12.5px] font-bold px-4 py-2 rounded-full">
              {summary.reviewed} Reviewed
            </span>
            <span className="inline-flex items-center gap-1.5 bg-white/20 text-white text-[12.5px] font-bold px-4 py-2 rounded-full">
              {summary.dismissed} Dismissed
            </span>
          </div>
        )}
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Total Open"
          value={summary?.open ?? '—'}
          sub="signals requiring review"
          leftBorderColor="#f1ad02"
        />
        <StatCard
          label="High Severity"
          value={highCount}
          sub="critical findings"
          leftBorderColor="#dc2626"
        />
        <StatCard
          label="Cases Affected"
          value={uniqueCases}
          sub="unique case IDs on this page"
          leftBorderColor="#2e4e84"
        />
        <StatCard
          label="Est. Exposure"
          value={fmtUsd(openExposure)}
          sub="open signal error amounts"
          leftBorderColor="#16a34a"
        />
      </div>

      {/* ── Filter bar ── */}
      <div className="flex flex-wrap items-center gap-3 mb-6 bg-white border border-[#D7D7D7] rounded-xl px-5 py-4">
        <select
          value={signalType}
          onChange={e => { setSignalType(e.target.value); setPage(1); }}
          className={selectCls}
        >
          <option value="">All Types</option>
          <option value="death_match">Death Match</option>
          <option value="medicaid_gap">Medicaid Gap</option>
          <option value="unreported_birth">Unreported Birth</option>
          <option value="adt_trigger">ADT Trigger</option>
          <option value="missed_deduction">Missed Deduction</option>
        </select>

        <select
          value={severity}
          onChange={e => { setSeverity(e.target.value); setPage(1); }}
          className={selectCls}
        >
          <option value="">All Severities</option>
          <option value="HIGH">HIGH</option>
          <option value="MEDIUM">MEDIUM</option>
          <option value="LOW">LOW</option>
        </select>

        <select
          value={status}
          onChange={e => { setStatus(e.target.value); setPage(1); }}
          className={selectCls}
        >
          <option value="open">Open</option>
          <option value="reviewed">Reviewed</option>
          <option value="dismissed">Dismissed</option>
          <option value="">All Statuses</option>
        </select>

        {data && (
          <span className="ml-auto text-[12.5px] text-[#4a5260]">
            Showing <strong className="text-[#022569]">{start}–{end}</strong> of{' '}
            <strong className="text-[#022569]">{data.total}</strong> signals
          </span>
        )}
      </div>

      {/* ── Signal list ── */}
      <div className="flex flex-col gap-3">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)
        ) : !data || data.signals.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-20 text-center">
            <CheckCircle2 className="w-12 h-12 text-green-500" />
            <p className="text-[15px] font-bold text-[#022569]">No signals match your filters</p>
            <p className="text-[13px] text-[#4a5260]">Try adjusting the type, severity, or status filters above.</p>
          </div>
        ) : (
          data.signals.map(signal => (
            <SignalCard key={signal.id} signal={signal} onUpdateStatus={handleUpdateStatus} />
          ))
        )}
      </div>

      {/* ── Pagination ── */}
      {data && data.pages > 1 && (
        <div className="flex items-center justify-between mt-6">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage(p => p - 1)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-[#022569] border border-[#D7D7D7] rounded-lg bg-white hover:bg-[#eaf0f9] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </button>

          <span className="text-[13px] text-[#4a5260]">
            Page <strong className="text-[#022569]">{page}</strong> of{' '}
            <strong className="text-[#022569]">{data.pages}</strong>
          </span>

          <button
            type="button"
            disabled={page >= data.pages}
            onClick={() => setPage(p => p + 1)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-[#022569] border border-[#D7D7D7] rounded-lg bg-white hover:bg-[#eaf0f9] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

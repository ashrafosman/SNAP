import { useEffect, useState } from 'react';
import { BarChart3, Download, Printer, AlertTriangle } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  api,
  type OverviewMetrics,
  type ErrorTypeMetric,
  type CityMetric,
  type SignalsResponse,
  type Signal,
} from '../lib/api';

// ─── helpers ────────────────────────────────────────────────────────────────

const SIGNAL_COLORS: Record<string, string> = {
  death_match:      '#dc2626',
  medicaid_gap:     '#d97706',
  unreported_birth: '#7c3aed',
  adt_trigger:      '#0891b2',
  missed_deduction: '#16a34a',
};

const SIGNAL_LABELS: Record<string, string> = {
  death_match:      'Death Match',
  medicaid_gap:     'Medicaid Gap',
  unreported_birth: 'Unreported Birth',
  adt_trigger:      'ADT Trigger',
  missed_deduction: 'Missed Deduction',
};

function fmt$(n: number) {
  return '$' + Math.round(n).toLocaleString();
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

// ─── chart tooltip ────────────────────────────────────────────────────────

const ChartTip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-[#D7D7D7] rounded-lg px-3 py-2 shadow-xl">
      {label && <p className="text-xs text-[#4a5260] mb-1">{label}</p>}
      {payload.map((p: any, i: number) => (
        <p key={i} className="text-sm font-medium" style={{ color: p.color || '#1f2330' }}>
          {p.name}: {typeof p.value === 'number' ? p.value.toLocaleString() : p.value}
        </p>
      ))}
    </div>
  );
};

// ─── loading skeleton ────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="p-8 max-w-[1400px] space-y-6">
      <div className="h-36 bg-white border border-[#D7D7D7] rounded-2xl animate-pulse" />
      <div className="grid grid-cols-4 gap-4">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="h-24 bg-white border border-[#D7D7D7] rounded-xl animate-pulse" />
        ))}
      </div>
      <div className="h-64 bg-white border border-[#D7D7D7] rounded-xl animate-pulse" />
    </div>
  );
}

// ─── export helpers ──────────────────────────────────────────────────────

function downloadCsv(rows: string[][], filename: string) {
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

type Tab = 'summary' | 'errors' | 'geographic' | 'signals';

// ─── Tab 1: QC Summary ───────────────────────────────────────────────────

function QCSummaryTab({ overview }: { overview: OverviewMetrics }) {
  const riskData = [
    { name: 'High Risk',   value: overview.high_risk,   fill: '#dc2626' },
    { name: 'Medium Risk', value: overview.medium_risk, fill: '#d97706' },
    { name: 'Low Risk',    value: overview.low_risk,    fill: '#64748b' },
  ];

  const tableRows = [
    ['Total Cases Sampled',        overview.total_cases.toLocaleString()],
    ['High Risk Cases',            overview.high_risk.toString()],
    ['Cases Flagged for Review',   overview.flagged_cases.toString()],
    ['Average Error Amount',       fmt$(overview.avg_error_dollars)],
    ['HM Exposure',                fmt$(overview.hm_exposure_dollars)],
    ['Penalty Savings Potential',  fmt$(overview.penalty_savings_potential)],
    ['Penalty Additional Risk',    fmt$(overview.penalty_additional_risk)],
  ];

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-[#D7D7D7] rounded-xl p-5 border-l-4 border-l-[#f1ad02]">
          <p className="text-xs text-[#4a5260] uppercase tracking-wider mb-1">Error Rate</p>
          <p className="text-2xl font-bold text-[#1f2330]">{overview.error_rate_pct}%</p>
          <p className="text-xs text-[#4a5260] mt-1">of sampled cases</p>
        </div>
        <div className="bg-white border border-[#D7D7D7] rounded-xl p-5 border-l-4 border-l-red-500">
          <p className="text-xs text-[#4a5260] uppercase tracking-wider mb-1">Total Exposure</p>
          <p className="text-2xl font-bold text-[#1f2330]">{fmt$(overview.total_exposure_dollars)}</p>
          <p className="text-xs text-[#4a5260] mt-1">QC payment corrections</p>
        </div>
        <div className="bg-white border border-[#D7D7D7] rounded-xl p-5 border-l-4 border-l-[#2e4e84]">
          <p className="text-xs text-[#4a5260] uppercase tracking-wider mb-1">Cases Reviewed</p>
          <p className="text-2xl font-bold text-[#1f2330]">{overview.reviewed_cases} / {overview.total_cases}</p>
          <p className="text-xs text-[#4a5260] mt-1">sample cases</p>
        </div>
        <div className="bg-white border border-[#D7D7D7] rounded-xl p-5 border-l-4 border-l-green-500">
          <p className="text-xs text-[#4a5260] uppercase tracking-wider mb-1">Penalty Savings Potential</p>
          <p className="text-2xl font-bold text-[#1f2330]">{fmt$(overview.penalty_savings_potential)}</p>
          <p className="text-xs text-[#4a5260] mt-1">if H+M corrected</p>
        </div>
      </div>

      {/* Risk distribution bar chart */}
      <div className="bg-white border border-[#D7D7D7] rounded-xl p-5">
        <h3 className="text-sm font-semibold text-[#1f2330] mb-1">Risk Distribution</h3>
        <p className="text-xs text-[#4a5260] mb-4">Cases by risk level</p>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={riskData} layout="vertical" margin={{ left: 10, right: 30, top: 0, bottom: 0 }}>
            <XAxis type="number" tick={{ fill: '#4a5260', fontSize: 11 }} />
            <YAxis dataKey="name" type="category" tick={{ fill: '#4a5260', fontSize: 12 }} width={90} />
            <Tooltip content={<ChartTip />} />
            <Bar dataKey="value" name="Cases" radius={[0, 4, 4, 0]}>
              {riskData.map((entry, i) => (
                <rect key={i} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Summary table */}
      <div className="bg-white border border-[#D7D7D7] rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[#D7D7D7]">
          <h3 className="text-sm font-semibold text-[#1f2330]">QC Summary Metrics</h3>
        </div>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="bg-[#eaf0f9]">
              <th className="text-left px-5 py-2.5 font-semibold text-[#022569]">Metric</th>
              <th className="text-right px-5 py-2.5 font-semibold text-[#022569]">Value</th>
            </tr>
          </thead>
          <tbody>
            {tableRows.map(([metric, value], i) => (
              <tr key={metric} className={i % 2 === 0 ? 'bg-white' : 'bg-[#fafafa]'}>
                <td className="px-5 py-2.5 text-[#1f2330]">{metric}</td>
                <td className="px-5 py-2.5 text-right font-medium text-[#1f2330]">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Tab 2: Error Analysis ────────────────────────────────────────────────

function ErrorAnalysisTab({ errorTypes, totalCases }: { errorTypes: ErrorTypeMetric[]; totalCases: number }) {
  return (
    <div className="space-y-6">
      {/* Error type bar chart */}
      <div className="bg-white border border-[#D7D7D7] rounded-xl p-5">
        <h3 className="text-sm font-semibold text-[#1f2330] mb-1">Error Type Distribution</h3>
        <p className="text-xs text-[#4a5260] mb-4">Case count and dollar exposure by error type</p>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={errorTypes} margin={{ top: 5, right: 20, bottom: 60, left: 0 }}>
            <XAxis
              dataKey="error_type"
              tick={{ fill: '#4a5260', fontSize: 10 }}
              angle={-35}
              textAnchor="end"
              interval={0}
              tickFormatter={(v: string) => truncate(v, 18)}
            />
            <YAxis tick={{ fill: '#4a5260', fontSize: 11 }} />
            <Tooltip content={<ChartTip />} />
            <Bar dataKey="count" name="Cases" fill="#2e4e84" radius={[3, 3, 0, 0]} />
            <Bar dataKey="total_exposure" name="$ Exposure" fill="#f1ad02" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Error type detail table */}
      <div className="bg-white border border-[#D7D7D7] rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[#D7D7D7]">
          <h3 className="text-sm font-semibold text-[#1f2330]">Error Type Detail</h3>
        </div>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="bg-[#eaf0f9]">
              <th className="text-left px-5 py-2.5 font-semibold text-[#022569]">Error Type</th>
              <th className="text-right px-5 py-2.5 font-semibold text-[#022569]">Cases</th>
              <th className="text-right px-5 py-2.5 font-semibold text-[#022569]">Exposure</th>
              <th className="text-right px-5 py-2.5 font-semibold text-[#022569]">% of Total</th>
            </tr>
          </thead>
          <tbody>
            {errorTypes.map((et, i) => (
              <tr key={et.error_type} className={i % 2 === 0 ? 'bg-white' : 'bg-[#fafafa]'}>
                <td className="px-5 py-2.5" style={{ borderLeft: '3px solid #2e4e84' }}>
                  {et.error_type}
                </td>
                <td className="px-5 py-2.5 text-right font-medium text-[#1f2330]">{et.count}</td>
                <td className="px-5 py-2.5 text-right font-medium text-[#1f2330]">
                  {et.total_exposure > 0 ? fmt$(et.total_exposure) : '—'}
                </td>
                <td className="px-5 py-2.5 text-right font-medium text-[#1f2330]">
                  {totalCases > 0 ? ((et.count / totalCases) * 100).toFixed(1) + '%' : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Tab 3: Geographic ────────────────────────────────────────────────────

function GeographicTab({ cities }: { cities: CityMetric[] }) {
  const sorted = [...cities].sort((a, b) => b.exposure - a.exposure);

  return (
    <div className="space-y-6">
      {/* City exposure bar chart */}
      <div className="bg-white border border-[#D7D7D7] rounded-xl p-5">
        <h3 className="text-sm font-semibold text-[#1f2330] mb-1">Dollar Exposure by City</h3>
        <p className="text-xs text-[#4a5260] mb-4">Cities ranked by QC payment correction amount</p>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={sorted} layout="vertical" margin={{ left: 10, right: 40, top: 0, bottom: 0 }}>
            <XAxis type="number" tick={{ fill: '#4a5260', fontSize: 10 }} tickFormatter={(v: number) => `$${v.toLocaleString()}`} />
            <YAxis dataKey="city" type="category" tick={{ fill: '#4a5260', fontSize: 11 }} width={100} />
            <Tooltip content={<ChartTip />} />
            <Bar dataKey="exposure" name="$ Exposure" fill="#2e4e84" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* City table */}
      <div className="bg-white border border-[#D7D7D7] rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[#D7D7D7]">
          <h3 className="text-sm font-semibold text-[#1f2330]">City Breakdown</h3>
        </div>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="bg-[#eaf0f9]">
              <th className="text-left px-5 py-2.5 font-semibold text-[#022569]">City</th>
              <th className="text-right px-5 py-2.5 font-semibold text-[#022569]">Cases</th>
              <th className="text-right px-5 py-2.5 font-semibold text-[#022569]">High Risk</th>
              <th className="text-right px-5 py-2.5 font-semibold text-[#022569]">Exposure</th>
              <th className="text-right px-5 py-2.5 font-semibold text-[#022569]">Avg Error</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((c, i) => {
              const avg = c.count > 0 ? c.exposure / c.count : 0;
              return (
                <tr key={c.city} className={i % 2 === 0 ? 'bg-white' : 'bg-[#fafafa]'}>
                  <td className="px-5 py-2.5 font-medium text-[#1f2330]">{c.city}</td>
                  <td className="px-5 py-2.5 text-right text-[#1f2330]">{c.count}</td>
                  <td className="px-5 py-2.5 text-right">
                    {c.high > 0 ? (
                      <span className="inline-flex items-center gap-1">
                        {c.high}
                        <span className="bg-red-100 text-red-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">HIGH</span>
                      </span>
                    ) : (
                      <span className="text-[#4a5260]">—</span>
                    )}
                  </td>
                  <td className="px-5 py-2.5 text-right font-medium text-[#1f2330]">
                    {c.exposure > 0 ? fmt$(c.exposure) : '—'}
                  </td>
                  <td className="px-5 py-2.5 text-right text-[#4a5260]">{avg > 0 ? fmt$(avg) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Tab 4: Signals ──────────────────────────────────────────────────────

function SignalsTab({ signals }: { signals: Signal[] }) {
  const total = signals.length;

  // Count by type
  const byType: Record<string, { open: number; reviewed: number; dismissed: number; total: number }> = {};
  for (const s of signals) {
    if (!byType[s.signal_type]) byType[s.signal_type] = { open: 0, reviewed: 0, dismissed: 0, total: 0 };
    byType[s.signal_type][s.status]++;
    byType[s.signal_type].total++;
  }

  const open = signals.filter(s => s.status === 'open').length;
  const reviewed = signals.filter(s => s.status === 'reviewed').length;
  const dismissed = signals.filter(s => s.status === 'dismissed').length;

  // Top 10 open by error_amount
  const topOpen = [...signals]
    .filter(s => s.status === 'open')
    .sort((a, b) => b.error_amount - a.error_amount)
    .slice(0, 10);

  return (
    <div className="space-y-6">
      {/* Resolution summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border border-[#D7D7D7] rounded-xl p-5 text-center">
          <p className="text-xs text-[#4a5260] uppercase tracking-wider mb-2">Open Signals</p>
          <p className="text-3xl font-bold text-amber-600">{open}</p>
          <p className="text-xs text-[#4a5260] mt-1">awaiting action</p>
        </div>
        <div className="bg-white border border-[#D7D7D7] rounded-xl p-5 text-center">
          <p className="text-xs text-[#4a5260] uppercase tracking-wider mb-2">Reviewed</p>
          <p className="text-3xl font-bold text-green-700">{reviewed}</p>
          <p className="text-xs text-[#4a5260] mt-1">resolved</p>
        </div>
        <div className="bg-white border border-[#D7D7D7] rounded-xl p-5 text-center">
          <p className="text-xs text-[#4a5260] uppercase tracking-wider mb-2">Dismissed</p>
          <p className="text-3xl font-bold text-[#4a5260]">{dismissed}</p>
          <p className="text-xs text-[#4a5260] mt-1">no action needed</p>
        </div>
      </div>

      {/* Signal type breakdown — horizontal progress bars */}
      <div className="bg-white border border-[#D7D7D7] rounded-xl p-5">
        <h3 className="text-sm font-semibold text-[#1f2330] mb-4">Signal Type Breakdown</h3>
        <div className="space-y-4">
          {Object.entries(byType).map(([type, counts]) => {
            const color = SIGNAL_COLORS[type] ?? '#6b7280';
            const label = SIGNAL_LABELS[type] ?? type;
            const pct = total > 0 ? (counts.total / total) * 100 : 0;
            return (
              <div key={type}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
                    <span className="text-[13px] font-medium text-[#1f2330]">{label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] bg-[#eaf0f9] text-[#2e4e84] font-bold px-2 py-0.5 rounded-full">{counts.total}</span>
                    {counts.open > 0 && (
                      <span className="text-[10px] bg-amber-100 text-amber-700 font-semibold px-1.5 py-0.5 rounded-full">
                        {counts.open} open
                      </span>
                    )}
                    {counts.reviewed > 0 && (
                      <span className="text-[10px] bg-green-100 text-green-700 font-semibold px-1.5 py-0.5 rounded-full">
                        {counts.reviewed} reviewed
                      </span>
                    )}
                    {counts.dismissed > 0 && (
                      <span className="text-[10px] bg-[#F4F4F4] text-[#4a5260] font-semibold px-1.5 py-0.5 rounded-full">
                        {counts.dismissed} dismissed
                      </span>
                    )}
                  </div>
                </div>
                <div className="w-full h-2 bg-[#eaf0f9] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${pct}%`, background: color }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Top open signals by exposure */}
      <div className="bg-white border border-[#D7D7D7] rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[#D7D7D7]">
          <h3 className="text-sm font-semibold text-[#1f2330]">Top Open Signals by Exposure</h3>
          <p className="text-xs text-[#4a5260] mt-0.5">Highest financial risk signals awaiting review</p>
        </div>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="bg-[#eaf0f9]">
              <th className="text-left px-5 py-2.5 font-semibold text-[#022569]">Signal Type</th>
              <th className="text-left px-5 py-2.5 font-semibold text-[#022569]">Case</th>
              <th className="text-left px-5 py-2.5 font-semibold text-[#022569]">Severity</th>
              <th className="text-right px-5 py-2.5 font-semibold text-[#022569]">Exposure</th>
              <th className="text-right px-5 py-2.5 font-semibold text-[#022569]">Detected</th>
            </tr>
          </thead>
          <tbody>
            {topOpen.map((s, i) => {
              const color = SIGNAL_COLORS[s.signal_type] ?? '#6b7280';
              const severityColors: Record<string, string> = {
                HIGH:   'bg-red-100 text-red-700',
                MEDIUM: 'bg-amber-100 text-amber-700',
                LOW:    'bg-slate-100 text-slate-600',
              };
              return (
                <tr key={s.id} className={i % 2 === 0 ? 'bg-white' : 'bg-[#fafafa]'}>
                  <td className="px-5 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                      <span className="text-[#1f2330]">{SIGNAL_LABELS[s.signal_type] ?? s.signal_type}</span>
                    </div>
                  </td>
                  <td className="px-5 py-2.5 text-[#2e4e84] font-medium">{s.case_name}</td>
                  <td className="px-5 py-2.5">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${severityColors[s.severity] ?? ''}`}>
                      {s.severity}
                    </span>
                  </td>
                  <td className="px-5 py-2.5 text-right font-medium text-[#1f2330]">
                    {s.error_amount > 0 ? fmt$(s.error_amount) : '—'}
                  </td>
                  <td className="px-5 py-2.5 text-right text-[#4a5260]">
                    {new Date(s.detected_at).toLocaleDateString()}
                  </td>
                </tr>
              );
            })}
            {topOpen.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-[#4a5260] text-sm">
                  No open signals found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────

export default function Reports() {
  const [activeTab, setActiveTab] = useState<Tab>('summary');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<OverviewMetrics | null>(null);
  const [errorTypes, setErrorTypes] = useState<ErrorTypeMetric[]>([]);
  const [cities, setCities] = useState<CityMetric[]>([]);
  const [signalsResp, setSignalsResp] = useState<SignalsResponse | null>(null);

  useEffect(() => {
    Promise.all([
      api.metrics.overview(),
      api.metrics.errorTypes(),
      api.metrics.cities(),
      api.signals.list({ page_size: 200 }),
    ])
      .then(([ov, et, ci, sr]) => {
        setOverview(ov as OverviewMetrics);
        setErrorTypes(et as ErrorTypeMetric[]);
        setCities(ci as CityMetric[]);
        setSignalsResp(sr as SignalsResponse);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message ?? 'Failed to load report data');
        setLoading(false);
      });
  }, []);

  // ── export CSV ──────────────────────────────────────────────────────────
  const handleExportCsv = () => {
    const today = new Date().toISOString().slice(0, 10);
    const filename = `snap-qc-report-${activeTab}-${today}.csv`;

    if (activeTab === 'summary' && overview) {
      const rows = [
        ['Metric', 'Value'],
        ['Total Cases Sampled', overview.total_cases.toString()],
        ['High Risk Cases', overview.high_risk.toString()],
        ['Cases Flagged for Review', overview.flagged_cases.toString()],
        ['Average Error Amount', overview.avg_error_dollars.toFixed(2)],
        ['HM Exposure', overview.hm_exposure_dollars.toFixed(2)],
        ['Penalty Savings Potential', overview.penalty_savings_potential.toFixed(2)],
        ['Penalty Additional Risk', overview.penalty_additional_risk.toFixed(2)],
      ];
      downloadCsv(rows, filename);
    } else if (activeTab === 'errors') {
      const total = overview?.total_cases ?? 1;
      const rows = [
        ['Error Type', 'Cases', 'Exposure', '% of Total'],
        ...errorTypes.map(et => [
          et.error_type,
          et.count.toString(),
          et.total_exposure.toFixed(2),
          ((et.count / total) * 100).toFixed(1) + '%',
        ]),
      ];
      downloadCsv(rows, filename);
    } else if (activeTab === 'geographic') {
      const sorted = [...cities].sort((a, b) => b.exposure - a.exposure);
      const rows = [
        ['City', 'Cases', 'High Risk', 'Exposure', 'Avg Error'],
        ...sorted.map(c => [
          c.city,
          c.count.toString(),
          c.high.toString(),
          c.exposure.toFixed(2),
          c.count > 0 ? (c.exposure / c.count).toFixed(2) : '0',
        ]),
      ];
      downloadCsv(rows, filename);
    } else if (activeTab === 'signals' && signalsResp) {
      const topOpen = [...signalsResp.signals]
        .filter(s => s.status === 'open')
        .sort((a, b) => b.error_amount - a.error_amount)
        .slice(0, 10);
      const rows = [
        ['Signal Type', 'Case', 'Severity', 'Exposure', 'Detected'],
        ...topOpen.map(s => [
          SIGNAL_LABELS[s.signal_type] ?? s.signal_type,
          s.case_name,
          s.severity,
          s.error_amount.toFixed(2),
          new Date(s.detected_at).toLocaleDateString(),
        ]),
      ];
      downloadCsv(rows, filename);
    }
  };

  if (loading) return <LoadingSkeleton />;

  if (error || !overview) {
    return (
      <div className="p-8 max-w-[1400px]">
        <div className="bg-white border border-red-200 rounded-xl p-6 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-600">Failed to load report data</p>
            <p className="text-xs text-[#4a5260] mt-1">{error ?? 'Unknown error'}</p>
          </div>
        </div>
      </div>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'summary',    label: 'QC Summary' },
    { id: 'errors',     label: 'Error Analysis' },
    { id: 'geographic', label: 'Geographic' },
    { id: 'signals',    label: 'Signals' },
  ];

  return (
    <>
      {/* Print stylesheet */}
      <style>{`
        @media print {
          header, .no-print { display: none !important; }
          .print-stack > * { page-break-inside: avoid; margin-bottom: 1.5rem; }
          body { background: white; }
        }
      `}</style>

      <div className="p-8 max-w-[1400px] space-y-6 print-stack">

        {/* Hero */}
        <div className="bg-[#2e4e84] rounded-2xl p-8 flex items-start justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#f1ad02] flex items-center justify-center shrink-0">
              <BarChart3 className="w-6 h-6 text-[#1f1611]" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Reports &amp; Analytics</h1>
              <p className="text-sm text-white/70 mt-1 max-w-xl">
                QC performance summary, error analysis, and geographic breakdown for state reporting
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 no-print">
            <button
              type="button"
              onClick={handleExportCsv}
              className="flex items-center gap-2 bg-white/10 border border-white/25 text-white text-[13px] font-semibold px-4 py-2 rounded-lg hover:bg-white/20 transition-colors"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-2 bg-[#f1ad02] text-[#1f1611] text-[13px] font-semibold px-4 py-2 rounded-lg hover:bg-[#e6a200] transition-colors"
            >
              <Printer className="w-4 h-4" />
              Print Report
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-0 border-b border-[#D7D7D7] no-print">
          {tabs.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-3 text-[13.5px] font-semibold transition-colors relative whitespace-nowrap ${
                activeTab === tab.id
                  ? 'text-[#022569]'
                  : 'text-[#4a5260] hover:text-[#1f2330]'
              }`}
            >
              {tab.label}
              {activeTab === tab.id && (
                <span className="absolute bottom-0 left-0 right-0 h-[3px] bg-[#f1ad02] rounded-t-full" />
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'summary' && (
          <QCSummaryTab overview={overview} />
        )}
        {activeTab === 'errors' && (
          <ErrorAnalysisTab errorTypes={errorTypes} totalCases={overview.total_cases} />
        )}
        {activeTab === 'geographic' && (
          <GeographicTab cities={cities} />
        )}
        {activeTab === 'signals' && signalsResp && (
          <SignalsTab signals={signalsResp.signals} />
        )}
      </div>
    </>
  );
}

import { useEffect, useState, useMemo } from 'react';
import { AlertTriangle, DollarSign, CheckCircle2, TrendingUp, Activity, ShieldCheck, Calculator } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, PieChart, Pie, Cell,
} from 'recharts';
import KPICard from '../components/KPICard';
import { api, type OverviewMetrics } from '../lib/api';

const PIE_COLORS = ['#ef4444', '#f59e0b', '#2e4e84', '#22c55e', '#8b5cf6', '#06b6d4'];

const ChartTip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-[#D7D7D7] rounded-lg px-3 py-2 shadow-xl">
      {label && <p className="text-xs text-[#4a5260] mb-1">{label}</p>}
      {payload.map((p: any, i: number) => (
        <p key={i} className="text-sm font-medium" style={{ color: p.color || '#fafafa' }}>
          {p.name}: {typeof p.value === 'number' ? p.value.toLocaleString() : p.value}
        </p>
      ))}
    </div>
  );
};

function ROICalculator({ metrics }: { metrics: OverviewMetrics }) {
  const [targetRate, setTargetRate] = useState(9);
  const currentRate = metrics.error_rate_pct;

  // Federal tolerance threshold — below this, NO penalties
  const TOLERANCE = 6;

  const roi = useMemo(() => {
    const totalCases = metrics.total_cases;
    const avgError = metrics.avg_error_dollars;

    const currentErrorCases = Math.round(totalCases * (currentRate / 100));
    const targetErrorCases = Math.round(totalCases * (targetRate / 100));
    const casesAvoided = Math.max(0, currentErrorCases - targetErrorCases);

    // Penalty only applies to error cases ABOVE the federal tolerance threshold
    // Below 6% = $0 penalty (safe zone)
    const currentPenaltyCases = Math.max(0, Math.round(totalCases * (Math.max(0, currentRate - TOLERANCE) / 100)));
    const targetPenaltyCases = Math.max(0, Math.round(totalCases * (Math.max(0, targetRate - TOLERANCE) / 100)));

    // Current penalty at 50/50 cost-share
    const currentPenalty5050 = currentPenaltyCases * avgError * 0.5;
    const targetPenalty5050 = targetPenaltyCases * avgError * 0.5;
    const savings5050 = currentPenalty5050 - targetPenalty5050;

    // Post Oct 2026 penalty at 75/25 cost-share
    const currentPenalty7525 = currentPenaltyCases * avgError * 0.75;
    const targetPenalty7525 = targetPenaltyCases * avgError * 0.75;
    const savings7525 = currentPenalty7525 - targetPenalty7525;

    const hr1Uplift = savings7525 - savings5050;
    const belowThreshold = targetRate <= TOLERANCE;

    return {
      casesAvoided,
      currentPenalty5050,
      targetPenalty5050,
      savings5050,
      currentPenalty7525,
      targetPenalty7525,
      savings7525,
      hr1Uplift,
      targetErrorCases,
      currentErrorCases,
      belowThreshold,
      currentPenaltyCases,
      targetPenaltyCases,
    };
  }, [targetRate, currentRate, metrics]);

  const markers = [
    { value: 6, label: '6% No Penalty' },
    { value: 9, label: '9% Short-term' },
  ];

  return (
    <div className="bg-white border border-[#D7D7D7] rounded-xl p-6">
      <div className="flex items-center gap-2 mb-1">
        <Calculator className="w-4 h-4 text-[#2e4e84]" />
        <h3 className="text-sm font-semibold">Error Rate Reduction ROI Calculator</h3>
      </div>
      <p className="text-xs text-[#4a5260] mb-5">
        Drag the slider to see projected savings at different error rate targets
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Slider */}
        <div className="lg:col-span-1 flex flex-col justify-center">
          <div className="mb-4">
            <div className="flex justify-between items-baseline mb-2">
              <span className="text-xs text-[#4a5260]">Current Rate</span>
              <span className="text-lg font-bold text-red-400">{currentRate}%</span>
            </div>
            <div className="flex justify-between items-baseline mb-4">
              <span className="text-xs text-[#4a5260]">Target Rate</span>
              <span className="text-lg font-bold text-green-400">{targetRate}%</span>
            </div>
          </div>

          <input
            type="range"
            min={1}
            max={Math.max(Math.floor(currentRate), 2)}
            step={1}
            value={targetRate}
            onChange={e => setTargetRate(Number(e.target.value))}
            className="w-full h-2 rounded-full appearance-none cursor-pointer accent-[#2e4e84] bg-[#e5e7eb]"
          />
          <div className="flex justify-between mt-2">
            <span className="text-[10px] text-[#6b7280]">1%</span>
            {markers.filter(m => m.value <= currentRate).map(m => (
              <button key={m.value} onClick={() => setTargetRate(m.value)} className="text-[10px] text-[#2e4e84] hover:text-white transition-colors">
                {m.label}
              </button>
            ))}
            <span className="text-[10px] text-[#6b7280]">{Math.floor(currentRate)}%</span>
          </div>

          <div className="mt-4 text-xs text-[#4a5260]">
            Reducing from <strong className="text-white">{currentRate}%</strong> → <strong className="text-white">{targetRate}%</strong> avoids{' '}
            <strong className="text-white">{roi.casesAvoided}</strong> error cases
          </div>

          {roi.belowThreshold && (
            <div className="mt-3 bg-green-500/10 border border-green-500/30 rounded-lg px-3 py-2">
              <p className="text-[11px] text-green-300 font-medium">Below {TOLERANCE}% — No federal penalties</p>
              <p className="text-[10px] text-[#4a5260]">State is in the safe zone at this target rate</p>
            </div>
          )}
        </div>

        {/* Savings cards */}
        <div className="lg:col-span-2 grid grid-cols-3 gap-4">
          <div className="bg-[#F4F4F4] border border-[#D7D7D7] rounded-xl p-4 flex flex-col items-center justify-center text-center">
            <p className="text-[10px] text-[#4a5260] uppercase tracking-wider mb-1">Current Penalty (50/50)</p>
            <p className="text-lg font-bold text-red-400">${roi.currentPenalty5050.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
            <p className="text-[10px] text-[#6b7280] mt-0.5">at {currentRate}% error rate</p>
            <div className="mt-2 pt-2 border-t border-[#D7D7D7] w-full">
              <p className="text-[10px] text-[#4a5260]">At target ({targetRate}%)</p>
              <p className={`text-sm font-bold ${roi.belowThreshold ? 'text-green-400' : 'text-amber-400'}`}>
                {roi.belowThreshold ? '$0' : `$${roi.targetPenalty5050.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
              </p>
            </div>
            <p className="text-xs font-semibold text-green-400 mt-2">
              Save ${roi.savings5050.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
          </div>

          <div className="bg-[#F4F4F4] border border-green-500/20 rounded-xl p-4 flex flex-col items-center justify-center text-center">
            <p className="text-[10px] text-[#4a5260] uppercase tracking-wider mb-1">Post Oct 2026 (75/25)</p>
            <p className="text-lg font-bold text-red-400">${roi.currentPenalty7525.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
            <p className="text-[10px] text-[#6b7280] mt-0.5">at {currentRate}% error rate</p>
            <div className="mt-2 pt-2 border-t border-[#D7D7D7] w-full">
              <p className="text-[10px] text-[#4a5260]">At target ({targetRate}%)</p>
              <p className={`text-sm font-bold ${roi.belowThreshold ? 'text-green-400' : 'text-amber-400'}`}>
                {roi.belowThreshold ? '$0' : `$${roi.targetPenalty7525.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
              </p>
            </div>
            <p className="text-xs font-semibold text-green-400 mt-2">
              Save ${roi.savings7525.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
          </div>

          <div className="bg-[#F4F4F4] border border-[#2e4e84]/20 rounded-xl p-4 flex flex-col items-center justify-center text-center">
            <p className="text-[10px] text-[#4a5260] uppercase tracking-wider mb-1">HR1 Cost-Share Uplift</p>
            <p className="text-2xl font-bold text-[#2e4e84]">+${roi.hr1Uplift.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
            <p className="text-[10px] text-[#6b7280] mt-1">extra penalty avoided by acting before Oct 2026</p>
            <div className="mt-2 pt-2 border-t border-[#D7D7D7] w-full">
              <p className="text-[10px] text-[#4a5260]">Total savings at target</p>
              <p className="text-sm font-bold text-green-400">
                ${roi.savings7525.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </p>
            </div>
          </div>

          <div className="col-span-3 bg-[#F4F4F4] border border-[#D7D7D7] rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-[#4a5260]">Penalty zone: errors above {TOLERANCE}% threshold</span>
              <span className="text-xs font-medium text-white">{roi.currentPenaltyCases} → {roi.targetPenaltyCases} penalized cases</span>
            </div>
            <div className="w-full h-3 bg-[#e5e7eb] rounded-full overflow-hidden relative">
              {/* Threshold marker */}
              <div
                className="absolute top-0 h-full w-0.5 bg-green-400 z-10"
                style={{ left: `${(TOLERANCE / currentRate) * 100}%` }}
              />
              {/* Penalty zone (red) */}
              <div
                className="h-full bg-red-500/50 transition-all duration-300 absolute right-0"
                style={{ width: `${Math.max(0, ((currentRate - TOLERANCE) / currentRate) * 100)}%` }}
              />
              {/* Saved portion (green) */}
              <div
                className="h-full bg-green-500 transition-all duration-300 absolute"
                style={{
                  left: `${(Math.max(targetRate, TOLERANCE) / currentRate) * 100}%`,
                  width: `${Math.max(0, ((currentRate - Math.max(targetRate, TOLERANCE)) / currentRate) * 100)}%`,
                }}
              />
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[10px] text-green-400">
                {roi.belowThreshold ? 'Target below threshold — $0 penalty' : `${roi.currentPenaltyCases - roi.targetPenaltyCases} penalty cases eliminated`}
              </span>
              <span className="text-[10px] text-[#6b7280]">{TOLERANCE}% federal threshold</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [metrics, setMetrics] = useState<OverviewMetrics | null>(null);
  const [errorTypes, setErrorTypes] = useState<any[]>([]);
  const [trend, setTrend] = useState<any[]>([]);
  const [cities, setCities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.allSettled([
      api.metrics.overview(),
      api.metrics.errorTypes(),
      api.metrics.trend(),
      api.metrics.cities(),
    ]).then(([m, et, tr, ci]) => {
      if (m.status === 'fulfilled') setMetrics(m.value);
      if (et.status === 'fulfilled') setErrorTypes(et.value);
      if (tr.status === 'fulfilled') setTrend(tr.value);
      if (ci.status === 'fulfilled') setCities(ci.value);
      setLoading(false);
    });
  }, []);

  if (loading || !metrics) {
    return (
      <div className="flex items-center justify-center h-full">
        <Activity className="w-5 h-5 text-[#2e4e84] animate-pulse mr-2" />
        <span className="text-[#4a5260]">Loading QC metrics...</span>
      </div>
    );
  }

  const reviewProgress = metrics.total_cases > 0
    ? Math.round((metrics.reviewed_cases / metrics.total_cases) * 100)
    : 0;

  return (
    <div className="p-8 space-y-8 max-w-[1400px]">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">SNAP QC Early Warning Dashboard</h1>
        <p className="text-sm text-[#4a5260] mt-1">
          Michigan — {metrics.total_cases} QC sample cases reviewed · {metrics.flagged_cases} flagged with data warnings
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard
          title="High-Risk Cases"
          value={metrics.high_risk}
          icon={AlertTriangle}
          color="text-red-400"
          subtitle={`${metrics.medium_risk} medium-risk`}
        />
        <KPICard
          title="$ QC Exposure"
          value={`$${metrics.total_exposure_dollars.toLocaleString()}`}
          icon={DollarSign}
          color="text-amber-400"
          subtitle={`Avg $${metrics.avg_error_dollars.toFixed(0)}/case`}
        />
        <KPICard
          title="Error Rate"
          value={`${metrics.error_rate_pct}%`}
          icon={TrendingUp}
          color="text-[#2e4e84]"
          subtitle="of sampled cases"
        />
        <KPICard
          title="Cases Reviewed"
          value={`${reviewProgress}%`}
          icon={CheckCircle2}
          color="text-green-400"
          subtitle={`${metrics.reviewed_cases} of ${metrics.total_cases}`}
        />
      </div>

      {/* Penalty Avoidance Banner */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 bg-white border border-green-500/25 rounded-xl p-5 flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-green-500/15 border border-green-500/30 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5 text-green-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-green-300">Penalty Avoidance Opportunity — Act Before Oct 2026</p>
            <p className="text-xs text-[#4a5260] mt-1 leading-relaxed">
              Michigan's cost-share shifts from <strong className="text-white">50% → 75%</strong> of each QC error dollar on Oct 1, 2026.
              Correcting the <strong className="text-white">{metrics.high_risk + metrics.medium_risk} HIGH/MEDIUM cases</strong> before QC review saves Michigan{' '}
              <strong className="text-green-300">${metrics.penalty_savings_potential.toLocaleString()}</strong> in state cost-share.
              Inaction adds <strong className="text-red-300">${metrics.penalty_additional_risk.toLocaleString()}</strong> in new exposure from the 25pp rate increase alone.
            </p>
          </div>
        </div>
        <div className="bg-white border border-[#D7D7D7] rounded-xl p-5 flex flex-col justify-center items-center text-center">
          <p className="text-xs text-[#4a5260] uppercase tracking-wider mb-2">Projected Penalty Savings</p>
          <p className="text-3xl font-bold text-green-400">${metrics.penalty_savings_potential.toLocaleString()}</p>
          <p className="text-xs text-[#4a5260] mt-1">if HIGH+MEDIUM corrected @ new 75% rate</p>
          <div className="mt-3 w-full bg-[#e5e7eb] rounded-full h-1.5">
            <div
              className="bg-green-500 h-1.5 rounded-full"
              style={{ width: `${Math.min(100, (metrics.penalty_savings_potential / metrics.total_exposure_dollars) * 100)}%` }}
            />
          </div>
          <p className="text-[10px] text-[#6b7280] mt-1">
            {Math.round((metrics.hm_exposure_dollars / metrics.total_exposure_dollars) * 100)}% of total exposure is in HIGH/MEDIUM cases
          </p>
        </div>
      </div>

      {/* ROI Calculator */}
      <ROICalculator metrics={metrics} />

      {/* Row 1: Error types pie + trend bars */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-2 bg-white border border-[#D7D7D7] rounded-xl p-6">
          <h3 className="text-sm font-semibold mb-1">Error Type Distribution</h3>
          <p className="text-xs text-[#4a5260] mb-4">Top causes of SNAP QC payment errors</p>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={errorTypes.slice(0, 6)}
                dataKey="count"
                nameKey="error_type"
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={3}
                label={({ percent }: { percent?: number }) => (percent ?? 0) > 0.07 ? `${((percent ?? 0) * 100).toFixed(0)}%` : ''}
                labelLine={false}
              >
                {errorTypes.slice(0, 6).map((_: any, i: number) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: '#fff', border: '1px solid #D7D7D7', borderRadius: 8 }}
                labelStyle={{ color: '#4a5260' }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="grid grid-cols-1 gap-1 mt-2">
            {errorTypes.slice(0, 6).map((et: any, i: number) => (
              <div key={et.error_type} className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: PIE_COLORS[i] }} />
                <span className="text-xs text-[#4a5260] truncate">{et.error_type}</span>
                <span className="text-xs font-medium ml-auto">{et.count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-3 bg-white border border-[#D7D7D7] rounded-xl p-6">
          <h3 className="text-sm font-semibold mb-1">Risk Distribution by Certification Period</h3>
          <p className="text-xs text-[#4a5260] mb-4">Cases bucketed by certification length (months)</p>
          <ResponsiveContainer width="100%" height={310}>
            <BarChart data={trend} margin={{ top: 5, right: 5, bottom: 5, left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="month" tick={{ fill: '#4a5260', fontSize: 10 }} />
              <YAxis tick={{ fill: '#4a5260', fontSize: 10 }} />
              <Tooltip content={<ChartTip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="high" name="High Risk" fill="#ef4444" stackId="a" radius={[0,0,0,0]} />
              <Bar dataKey="medium" name="Medium Risk" fill="#f59e0b" stackId="a" radius={[0,0,0,0]} />
              <Bar dataKey="low" name="Low Risk" fill="#2e4e84" stackId="a" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Row 2: City breakdown + $ exposure */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-[#D7D7D7] rounded-xl p-6">
          <h3 className="text-sm font-semibold mb-1">Cases by City — Top 10</h3>
          <p className="text-xs text-[#4a5260] mb-4">High-risk cases highlighted</p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={cities.slice(0, 10)} layout="vertical" margin={{ left: 80, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis type="number" tick={{ fill: '#4a5260', fontSize: 10 }} />
              <YAxis dataKey="city" type="category" tick={{ fill: '#4a5260', fontSize: 10 }} width={80} />
              <Tooltip content={<ChartTip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="count" name="Total" fill="#2e4e84" radius={[0,3,3,0]} />
              <Bar dataKey="high" name="High Risk" fill="#ef4444" radius={[0,3,3,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white border border-[#D7D7D7] rounded-xl p-6">
          <h3 className="text-sm font-semibold mb-1">$ Exposure by Error Type</h3>
          <p className="text-xs text-[#4a5260] mb-4">Total QC payment correction amount</p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={errorTypes.filter((et: any) => et.total_exposure > 0)} margin={{ top: 5, right: 5, bottom: 40, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="error_type" tick={{ fill: '#4a5260', fontSize: 9 }} angle={-35} textAnchor="end" interval={0} />
              <YAxis tick={{ fill: '#4a5260', fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
              <Tooltip content={<ChartTip />} />
              <Bar dataKey="total_exposure" name="$ Exposure" fill="#f59e0b" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Policy alert */}
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-amber-300">Policy Action Required — October 2026</p>
          <p className="text-xs text-[#4a5260] mt-1">
            Federal SNAP administrative cost-share shifts from 50/50 to 25/75 on Oct 1, 2026 — every QC error dollar now costs Michigan $0.75 instead of $0.50.
            January 2027 Medicaid work requirements + twice-yearly redeterminations put <strong className="text-white">40,000 SNAP recipients</strong> at procedural churn risk.
            Use the AI Assistant tab to analyze specific cases and identify systemic error patterns.
          </p>
        </div>
      </div>

      {/* Quick stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-[#D7D7D7] rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-red-400">{metrics.flagged_cases}</p>
          <p className="text-xs text-[#4a5260] mt-1">Cases with data warnings</p>
        </div>
        <div className="bg-white border border-[#D7D7D7] rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-amber-400">{metrics.cases_needing_review}</p>
          <p className="text-xs text-[#4a5260] mt-1">Cases needing review</p>
        </div>
        <div className="bg-white border border-[#D7D7D7] rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-green-400">{metrics.reviewed_cases}</p>
          <p className="text-xs text-[#4a5260] mt-1">Cases reviewed</p>
        </div>
        <div className="bg-white border border-[#D7D7D7] rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-[#2e4e84]">{metrics.low_risk}</p>
          <p className="text-xs text-[#4a5260] mt-1">Low-risk cases</p>
        </div>
      </div>
    </div>
  );
}

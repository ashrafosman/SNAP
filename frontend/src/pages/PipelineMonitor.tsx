import { useEffect, useState, useCallback, useRef } from 'react';
import { CheckCircle, XCircle, AlertTriangle, ChevronRight, ChevronDown, Database, GitBranch, Star, TrendingUp, DollarSign, Shield, Play, Clock, RefreshCw, ExternalLink, History, ToggleLeft, ToggleRight, Loader2 } from 'lucide-react';

const BASE = '/api';

interface DQCheck {
  name: string;
  description: string;
  passed: number;
  failed: number;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  layer: string;
  impact: string;
  error_type?: string;
  exposure_at_risk?: number;
}

interface BronzeLayer {
  record_count: number;
  checks: DQCheck[];
  pass_rate: number;
}

interface SilverLayer {
  record_count: number;
  checks: DQCheck[];
  pass_rate: number;
  total_exposure_at_risk: number;
}

interface GoldLayer {
  record_count: number;
  checks: DQCheck[];
  high_risk: number;
  medium_risk: number;
  low_risk: number;
  total_exposure: number;
  hm_exposure: number;
  penalty_savings_potential: number;
}

interface PipelineStats {
  total_cases: number;
  source?: 'delta_table' | 'in_memory';
  last_run_time?: string;
  bronze: BronzeLayer;
  silver: SilverLayer;
  gold: GoldLayer;
}

interface JobInfo {
  job_id: number;
  name: string;
  layer: string;
  label: string;
  status?: string;
  result_state?: string | null;
  start_time_ms?: number;
  end_time_ms?: number;
  duration_s?: number | null;
  run_url?: string;
  error?: string;
}

interface RunHistory {
  run_id: number;
  status: string;
  result_state: string | null;
  start_time_ms: number;
  end_time_ms?: number;
  duration_s?: number | null;
  records_processed?: number;
  checks_passed?: number;
}

type JobsMap = Record<'bronze' | 'silver' | 'gold', JobInfo>;
type LayerKey = 'bronze' | 'silver' | 'gold';

// DQ check overrides (enabled/disabled + severity)
interface CheckOverride {
  enabled: boolean;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
}

const JOB_STATUS_STYLE: Record<string, { dot: string; text: string; label: string; bg?: string }> = {
  TERMINATED:    { dot: 'bg-emerald-400', text: 'text-emerald-400', label: 'Success', bg: 'bg-emerald-400/10' },
  SUCCESS:       { dot: 'bg-emerald-400', text: 'text-emerald-400', label: 'Success', bg: 'bg-emerald-400/10' },
  RUNNING:       { dot: 'bg-cyan-400 animate-pulse', text: 'text-cyan-700', label: 'Running', bg: 'bg-cyan-400/10' },
  PENDING:       { dot: 'bg-amber-400 animate-pulse', text: 'text-amber-700', label: 'Pending', bg: 'bg-amber-400/10' },
  FAILED:        { dot: 'bg-red-400', text: 'text-red-600', label: 'Failed', bg: 'bg-red-400/10' },
  INTERNAL_ERROR:{ dot: 'bg-red-400', text: 'text-red-600', label: 'Error', bg: 'bg-red-400/10' },
  NEVER_RUN:     { dot: 'bg-gray-400', text: 'text-gray-500', label: 'Never Run' },
  UNKNOWN:       { dot: 'bg-gray-400', text: 'text-gray-500', label: 'Unknown' },
  UNAVAILABLE:   { dot: 'bg-gray-400', text: 'text-gray-500', label: 'Unavailable' },
};

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: 'text-red-700 bg-red-50 border-red-200',
  HIGH: 'text-orange-400 bg-orange-400/10 border-orange-400/30',
  MEDIUM: 'text-amber-700 bg-amber-50 border-amber-200',
  LOW: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30',
};

function JobStatusBadge({ job, onTrigger, running }: { job?: JobInfo; onTrigger?: () => void; running?: boolean }) {
  if (!job) return null;
  const effectiveStatus = running ? 'RUNNING' : (job.result_state || job.status || 'UNKNOWN');
  const style = JOB_STATUS_STYLE[effectiveStatus] || JOB_STATUS_STYLE.UNKNOWN;
  const lastRun = job.start_time_ms
    ? new Date(job.start_time_ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;
  const isRunning = effectiveStatus === 'RUNNING';

  return (
    <div className={`flex items-center gap-2 border border-[#1e1e2a] rounded-lg px-3 py-2 mb-3 transition-colors ${isRunning ? 'bg-cyan-400/5 border-cyan-400/20' : 'bg-[#111118]'}`}>
      <div className={`w-2 h-2 rounded-full shrink-0 ${style.dot}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={`text-[10px] font-semibold ${style.text}`}>{style.label}</span>
          {job.duration_s != null && !isRunning && (
            <span className="text-[9px] text-[#6b7280] flex items-center gap-0.5">
              <Clock className="w-2.5 h-2.5" />{job.duration_s}s
            </span>
          )}
          {isRunning && (
            <Loader2 className="w-3 h-3 text-cyan-700 animate-spin" />
          )}
        </div>
        {lastRun && !isRunning && (
          <p className="text-[9px] text-[#6b7280]">Last run {lastRun}</p>
        )}
        {isRunning && (
          <p className="text-[9px] text-cyan-700">Processing records...</p>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        {job.run_url && (
          <a href={job.run_url} target="_blank" rel="noopener noreferrer"
            className="text-[#6b7280] hover:text-[#022569] transition-colors">
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
        {onTrigger && (
          <button
            onClick={onTrigger}
            disabled={isRunning}
            className={`transition-colors ${isRunning ? 'text-[#9ca3af] cursor-not-allowed' : 'text-[#6b7280] hover:text-cyan-700'}`}
            title={isRunning ? 'Running...' : 'Trigger run'}
          >
            {isRunning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
          </button>
        )}
      </div>
    </div>
  );
}

function RunHistoryPanel({ layer, expanded, onToggle }: { layer: LayerKey; expanded: boolean; onToggle: () => void }) {
  const [history, setHistory] = useState<RunHistory[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (expanded && history.length === 0) {
      setLoading(true);
      fetch(`${BASE}/pipeline/history/${layer}`)
        .then(r => r.json())
        .then(d => setHistory(d.runs || []))
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [expanded, layer, history.length]);

  // Refresh history when panel is open
  const refresh = useCallback(() => {
    fetch(`${BASE}/pipeline/history/${layer}`)
      .then(r => r.json())
      .then(d => setHistory(d.runs || []))
      .catch(() => {});
  }, [layer]);

  return (
    <div className="mb-3">
      <button
        onClick={onToggle}
        className="flex items-center gap-1.5 text-[10px] text-[#6b7280] hover:text-[#4a5260] transition-colors mb-1"
      >
        {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <History className="w-3 h-3" />
        Run History
      </button>
      {expanded && (
        <div className="bg-[#111118] border border-[#1e1e2a] rounded-lg p-2 space-y-1">
          {loading && <p className="text-[10px] text-[#6b7280] text-center py-2">Loading...</p>}
          {!loading && history.length === 0 && (
            <p className="text-[10px] text-[#6b7280] text-center py-2">No runs yet — trigger a run above</p>
          )}
          {history.map((run, i) => {
            const s = JOB_STATUS_STYLE[run.result_state || run.status] || JOB_STATUS_STYLE.UNKNOWN;
            const ts = run.start_time_ms
              ? new Date(run.start_time_ms).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
              : '—';
            return (
              <div key={run.run_id || i} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[#1e1e2a]/50 transition-colors">
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.dot}`} />
                <span className={`text-[10px] font-medium w-14 ${s.text}`}>{s.label}</span>
                <span className="text-[10px] text-[#6b7280] flex-1">{ts}</span>
                {run.duration_s != null && (
                  <span className="text-[10px] text-[#6b7280]">{run.duration_s}s</span>
                )}
                {run.records_processed != null && (
                  <span className="text-[10px] text-[#9ca3af]">{run.records_processed} rec</span>
                )}
              </div>
            );
          })}
          {history.length > 0 && (
            <button
              onClick={refresh}
              className="flex items-center gap-1 text-[9px] text-[#9ca3af] hover:text-[#4a5260] transition-colors mx-auto mt-1"
            >
              <RefreshCw className="w-2.5 h-2.5" /> Refresh
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function PassRateRing({ rate, color }: { rate: number; color: string }) {
  const r = 28;
  const circ = 2 * Math.PI * r;
  const dash = (rate / 100) * circ;
  return (
    <svg width="72" height="72" className="-rotate-90">
      <circle cx="36" cy="36" r={r} fill="none" stroke="#D7D7D7" strokeWidth="6" />
      <circle
        cx="36" cy="36" r={r} fill="none"
        stroke={color} strokeWidth="6"
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
      />
      <text
        x="36" y="36"
        textAnchor="middle" dominantBaseline="middle"
        className="rotate-90" style={{ transform: 'rotate(90deg)', transformOrigin: '36px 36px' }}
        fill="white" fontSize="12" fontWeight="700"
      >
        {rate}%
      </text>
    </svg>
  );
}

function LayerHeader({
  icon: Icon, label, color, bgColor, record_count, pass_rate, ringColor,
}: {
  icon: React.ElementType; label: string; color: string; bgColor: string;
  record_count: number; pass_rate: number; ringColor: string;
}) {
  return (
    <div className={`flex items-center gap-4 p-4 rounded-xl border ${bgColor} mb-3`}>
      <div className={`p-2 rounded-lg bg-[#F4F4F4]`}>
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
      <div className="flex-1">
        <p className={`text-sm font-bold ${color}`}>{label}</p>
        <p className="text-xs text-[#4a5260]">{record_count.toLocaleString()} records</p>
      </div>
      <PassRateRing rate={pass_rate} color={ringColor} />
    </div>
  );
}

function CheckRow({
  check,
  showExposure,
  override,
  onToggle,
  onSeverityChange,
}: {
  check: DQCheck;
  showExposure?: boolean;
  override?: CheckOverride;
  onToggle?: () => void;
  onSeverityChange?: (sev: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW') => void;
}) {
  const total = check.passed + check.failed;
  const pct = total > 0 ? Math.round((check.passed / total) * 100) : 100;
  const isEnabled = override?.enabled !== false;
  const displaySeverity = override?.severity || check.severity;
  const sevStyle = SEVERITY_COLORS[displaySeverity] || SEVERITY_COLORS.LOW;
  const allPassed = check.failed === 0;

  return (
    <div className={`border border-[#1e1e2a] rounded-lg p-3 space-y-2 transition-all ${isEnabled ? 'bg-[#111118]' : 'bg-[#111118]/40 opacity-50'}`}>
      <div className="flex items-start gap-2">
        {/* Toggle button */}
        <button
          onClick={onToggle}
          className="mt-0.5 shrink-0 transition-colors"
          title={isEnabled ? 'Disable check' : 'Enable check'}
        >
          {isEnabled
            ? <ToggleRight className="w-4 h-4 text-emerald-400" />
            : <ToggleLeft className="w-4 h-4 text-[#9ca3af]" />
          }
        </button>

        {/* Status icon */}
        {isEnabled && (
          allPassed
            ? <CheckCircle className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
            : check.failed > 0 && displaySeverity === 'CRITICAL'
              ? <XCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
              : <AlertTriangle className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-semibold ${isEnabled ? 'text-[#022569]' : 'text-[#6b7280]'}`}>{check.name}</span>
            {/* Severity selector */}
            <select
              value={displaySeverity}
              onChange={e => onSeverityChange?.(e.target.value as any)}
              className={`text-[9px] px-1.5 py-0.5 rounded border font-mono appearance-none cursor-pointer bg-transparent ${sevStyle}`}
              title="Change severity"
            >
              <option value="CRITICAL">CRITICAL</option>
              <option value="HIGH">HIGH</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="LOW">LOW</option>
            </select>
          </div>
          <p className="text-[10px] text-[#6b7280] mt-0.5">{check.description}</p>
        </div>
        {isEnabled && (
          <div className="text-right shrink-0">
            <p className="text-xs font-bold text-[#022569]">{pct}%</p>
            <p className="text-[9px] text-[#6b7280]">{check.passed}/{total}</p>
          </div>
        )}
      </div>

      {isEnabled && (
        <>
          {/* Progress bar */}
          <div className="h-1 bg-[#D7D7D7] rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${allPassed ? 'bg-emerald-500' : pct > 80 ? 'bg-amber-500' : 'bg-red-500'}`}
              style={{ width: `${pct}%` }}
            />
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-3 text-[10px]">
            <span className="text-emerald-400">{check.passed} passed</span>
            {check.failed > 0 && <span className="text-red-600">{check.failed} failed</span>}
            {showExposure && check.exposure_at_risk !== undefined && check.exposure_at_risk > 0 && (
              <span className="text-amber-700 ml-auto">
                ${check.exposure_at_risk.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} at risk
              </span>
            )}
          </div>

          {/* Impact */}
          <p className="text-[10px] text-[#6b7280] italic border-t border-[#1e1e2a] pt-2">{check.impact}</p>
        </>
      )}
    </div>
  );
}

export default function PipelineMonitor() {
  const [stats, setStats] = useState<PipelineStats | null>(null);
  const [jobs, setJobs] = useState<JobsMap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [jobsRefreshing, setJobsRefreshing] = useState(false);
  const [runningLayers, setRunningLayers] = useState<Set<LayerKey>>(new Set());
  const [expandedHistory, setExpandedHistory] = useState<Set<LayerKey>>(new Set());
  const [checkOverrides, setCheckOverrides] = useState<Record<string, CheckOverride>>({});
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Track the start_time_ms of the run that was active BEFORE we triggered a new one.
  // We only clear "running" state when we see a run with a newer start_time that has completed.
  const triggerTimestamps = useRef<Record<string, number>>({});

  const fetchJobs = useCallback(() => {
    setJobsRefreshing(true);
    fetch(`${BASE}/pipeline/jobs`)
      .then(r => r.json())
      .then(data => {
        setJobs(data);
        // Check if any running layers have completed
        setRunningLayers(prev => {
          const next = new Set(prev);
          let anyCompleted = false;
          for (const layer of prev) {
            const job = data[layer];
            const status = job?.status || '';
            const resultState = job?.result_state || '';
            const jobStart = job?.start_time_ms || 0;
            const triggeredAfter = triggerTimestamps.current[layer] || 0;

            // Job is actively running or pending — keep it running
            if (['RUNNING', 'PENDING'].includes(status)) continue;

            // Job has a completed state — but only clear if it's a NEW run
            // (start_time is after when we triggered)
            if (resultState && jobStart > triggeredAfter) {
              next.delete(layer);
              anyCompleted = true;
            }
            // If the job start_time is the same as before trigger, keep showing running
            // (the new run hasn't appeared in the API yet)
          }
          // Refresh DQ stats when a job completes
          if (anyCompleted) {
            setTimeout(() => {
              fetch(`${BASE}/pipeline/stats`)
                .then(r => r.json())
                .then(setStats)
                .catch(() => {});
            }, 3000);
          }
          return next;
        });
      })
      .catch(() => {})
      .finally(() => setJobsRefreshing(false));
  }, []);

  const refreshStats = useCallback(() => {
    fetch(`${BASE}/pipeline/stats`)
      .then(r => r.json())
      .then(setStats)
      .catch(() => {});
  }, []);

  const triggerJob = useCallback(async (layer: LayerKey) => {
    // Record the current job's start_time so we can detect when a NEW run completes
    const currentJob = jobs?.[layer];
    triggerTimestamps.current[layer] = currentJob?.start_time_ms || Date.now();

    setRunningLayers(prev => new Set(prev).add(layer));
    try {
      await fetch(`${BASE}/pipeline/trigger/${layer}`, { method: 'POST' });
      // Poll job status every 5s while running (real Databricks jobs take 30-120s)
      const poll = setInterval(() => {
        fetchJobs();
      }, 5000);
      // Stop fast polling after 3 min and refresh stats
      setTimeout(() => {
        clearInterval(poll);
        setRunningLayers(prev => {
          const next = new Set(prev);
          next.delete(layer);
          return next;
        });
        fetchJobs();
        refreshStats();
      }, 180000);
    } catch {
      setRunningLayers(prev => {
        const next = new Set(prev);
        next.delete(layer);
        return next;
      });
    }
  }, [fetchJobs, refreshStats, jobs]);

  const triggerAll = useCallback(async () => {
    for (const layer of ['bronze', 'silver', 'gold'] as const) {
      await triggerJob(layer);
      // Stagger by 500ms for visual effect
      await new Promise(r => setTimeout(r, 500));
    }
  }, [triggerJob]);

  const toggleHistory = useCallback((layer: LayerKey) => {
    setExpandedHistory(prev => {
      const next = new Set(prev);
      if (next.has(layer)) next.delete(layer);
      else next.add(layer);
      return next;
    });
  }, []);

  const toggleCheck = useCallback((checkName: string, currentSeverity: string) => {
    setCheckOverrides(prev => {
      const existing = prev[checkName];
      return {
        ...prev,
        [checkName]: {
          enabled: existing ? !existing.enabled : false,
          severity: (existing?.severity || currentSeverity) as any,
        },
      };
    });
  }, []);

  const changeSeverity = useCallback((checkName: string, severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW') => {
    setCheckOverrides(prev => ({
      ...prev,
      [checkName]: {
        enabled: prev[checkName]?.enabled !== false,
        severity,
      },
    }));
  }, []);

  useEffect(() => {
    Promise.all([
      fetch(`${BASE}/pipeline/stats`)
        .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
        .then(setStats),
      fetch(`${BASE}/pipeline/jobs`).then(r => r.json()).then(setJobs).catch(() => {}),
    ])
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));

    // Poll job status every 15s
    const interval = setInterval(fetchJobs, 15000);
    pollRef.current = interval;
    return () => clearInterval(interval);
  }, [fetchJobs]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-[#6b7280] text-sm">
        Loading pipeline stats...
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="flex items-center justify-center h-full text-red-600 text-sm">
        Failed to load pipeline stats: {error}
      </div>
    );
  }

  const { bronze, silver, gold } = stats;

  // Count active checks per layer
  const countActive = (checks: DQCheck[]) =>
    checks.filter(c => checkOverrides[c.name]?.enabled !== false).length;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-[#022569] flex items-center gap-2">
            Data Pipeline Monitor
            {stats.source === 'delta_table' && (
              <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-400/10 text-emerald-400 border border-emerald-400/30 font-mono">
                LIVE · Delta Tables
              </span>
            )}
            {stats.source === 'in_memory' && (
              <span className="text-[9px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-mono">
                LOCAL · In-Memory
              </span>
            )}
          </h1>
          <p className="text-xs text-[#6b7280] mt-0.5">
            Medallion architecture · {stats.total_cases} cases · SNAP QC Early Warning
            {stats.last_run_time && (
              <span className="ml-2 text-[#9ca3af]">
                · Last pipeline run: {new Date(stats.last_run_time).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </p>
        </div>
        <button
          onClick={triggerAll}
          disabled={runningLayers.size > 0}
          className="flex items-center gap-2 bg-cyan-400/10 border border-cyan-400/30 text-cyan-700 px-4 py-2 rounded-lg text-xs font-semibold hover:bg-cyan-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {runningLayers.size > 0 ? (
            <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Running Pipeline...</>
          ) : (
            <><Play className="w-3.5 h-3.5" /> Run Full Pipeline</>
          )}
        </button>
      </div>

      {/* Flow diagram bar */}
      <div className="flex items-center gap-2 bg-[#111118] border border-[#1e1e2a] rounded-xl p-4">
        {(['bronze', 'silver', 'gold'] as const).map((layer, i) => {
          const job = jobs?.[layer];
          const isRunning = runningLayers.has(layer);
          const effectiveStatus = isRunning ? 'RUNNING' : (job?.result_state || job?.status || 'UNKNOWN');
          const style = JOB_STATUS_STYLE[effectiveStatus] || JOB_STATUS_STYLE.UNKNOWN;
          const colors = { bronze: 'text-amber-600 bg-amber-700', silver: 'text-slate-400 bg-slate-400', gold: 'text-yellow-400 bg-yellow-400' };
          const labels = { bronze: 'BRONZE · Raw Ingestion', silver: 'SILVER · Validation', gold: 'GOLD · Risk Scoring' };
          return (
            <div key={layer} className="flex items-center gap-2">
              {i > 0 && <ChevronRight className="w-4 h-4 text-[#D7D7D7]" />}
              <div className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${colors[layer]}`} />
                <span className={`text-xs font-semibold ${colors[layer].split(' ')[0]}`}>{labels[layer]}</span>
                <div className={`w-1.5 h-1.5 rounded-full ${style.dot}`} title={style.label} />
              </div>
            </div>
          );
        })}
        <div className="ml-auto flex items-center gap-4 text-[10px] text-[#6b7280]">
          <span>
            Active checks:&nbsp;
            <span className="text-[#022569] font-semibold">
              {countActive(bronze.checks) + countActive(silver.checks) + countActive(gold.checks)}/{bronze.checks.length + silver.checks.length + gold.checks.length}
            </span>
          </span>
          <span>
            Avg pass rate:&nbsp;
            <span className="text-[#022569] font-semibold">
              {Math.round((bronze.pass_rate + silver.pass_rate) / 2)}%
            </span>
          </span>
          <span>
            Exposure flagged:&nbsp;
            <span className="text-amber-700 font-semibold">
              ${silver.total_exposure_at_risk.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </span>
          </span>
          <span>
            Savings potential:&nbsp;
            <span className="text-emerald-400 font-semibold">
              ${gold.penalty_savings_potential.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </span>
          </span>
          <button onClick={fetchJobs} className="ml-2 text-[#6b7280] hover:text-[#022569] transition-colors" title="Refresh job status">
            <RefreshCw className={`w-3.5 h-3.5 ${jobsRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Three-column layout */}
      <div className="grid grid-cols-3 gap-5">

        {/* BRONZE */}
        <div>
          <LayerHeader
            icon={Database}
            label="Bronze Layer"
            color="text-amber-600"
            bgColor="bg-amber-900/10 border-amber-800/30"
            record_count={bronze.record_count}
            pass_rate={bronze.pass_rate}
            ringColor="#b45309"
          />
          <JobStatusBadge
            job={jobs?.bronze}
            onTrigger={() => triggerJob('bronze')}
            running={runningLayers.has('bronze')}
          />
          <RunHistoryPanel
            layer="bronze"
            expanded={expandedHistory.has('bronze')}
            onToggle={() => toggleHistory('bronze')}
          />
          <div className="space-y-2">
            {bronze.checks.map(c => (
              <CheckRow
                key={c.name}
                check={c}
                override={checkOverrides[c.name]}
                onToggle={() => toggleCheck(c.name, c.severity)}
                onSeverityChange={sev => changeSeverity(c.name, sev)}
              />
            ))}
          </div>
        </div>

        {/* SILVER */}
        <div>
          <LayerHeader
            icon={GitBranch}
            label="Silver Layer"
            color="text-slate-400"
            bgColor="bg-slate-500/10 border-slate-500/30"
            record_count={silver.record_count}
            pass_rate={silver.pass_rate}
            ringColor="#94a3b8"
          />
          <JobStatusBadge
            job={jobs?.silver}
            onTrigger={() => triggerJob('silver')}
            running={runningLayers.has('silver')}
          />
          <RunHistoryPanel
            layer="silver"
            expanded={expandedHistory.has('silver')}
            onToggle={() => toggleHistory('silver')}
          />
          <div className="space-y-2">
            {silver.checks.map(c => (
              <CheckRow
                key={c.name}
                check={c}
                showExposure
                override={checkOverrides[c.name]}
                onToggle={() => toggleCheck(c.name, c.severity)}
                onSeverityChange={sev => changeSeverity(c.name, sev)}
              />
            ))}
          </div>
          {silver.total_exposure_at_risk > 0 && (
            <div className="mt-3 bg-amber-400/5 border border-amber-400/20 rounded-lg p-3 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-amber-700 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-amber-700">
                  ${silver.total_exposure_at_risk.toLocaleString('en-US', { minimumFractionDigits: 2 })} total exposure
                </p>
                <p className="text-[10px] text-[#6b7280]">Across all Silver validation failures</p>
              </div>
            </div>
          )}
        </div>

        {/* GOLD */}
        <div>
          <LayerHeader
            icon={Star}
            label="Gold Layer"
            color="text-yellow-400"
            bgColor="bg-yellow-400/10 border-yellow-400/30"
            record_count={gold.record_count}
            pass_rate={Math.round(
              (gold.checks.reduce((s, c) => s + c.passed, 0) /
               (gold.record_count * gold.checks.length)) * 100
            )}
            ringColor="#facc15"
          />
          <JobStatusBadge
            job={jobs?.gold}
            onTrigger={() => triggerJob('gold')}
            running={runningLayers.has('gold')}
          />
          <RunHistoryPanel
            layer="gold"
            expanded={expandedHistory.has('gold')}
            onToggle={() => toggleHistory('gold')}
          />
          <div className="space-y-2">
            {gold.checks.map(c => (
              <CheckRow
                key={c.name}
                check={c}
                override={checkOverrides[c.name]}
                onToggle={() => toggleCheck(c.name, c.severity)}
                onSeverityChange={sev => changeSeverity(c.name, sev)}
              />
            ))}
          </div>

          {/* Risk distribution */}
          <div className="mt-3 bg-[#111118] border border-[#1e1e2a] rounded-lg p-3 space-y-2">
            <p className="text-[10px] font-semibold text-[#4a5260] uppercase tracking-wide">Risk Distribution</p>
            <div className="space-y-1.5">
              {[
                { label: 'HIGH', count: gold.high_risk, color: 'bg-red-500', text: 'text-red-600' },
                { label: 'MEDIUM', count: gold.medium_risk, color: 'bg-amber-500', text: 'text-amber-700' },
                { label: 'LOW', count: gold.low_risk, color: 'bg-emerald-500', text: 'text-emerald-400' },
              ].map(({ label, count, color, text }) => {
                const pct = Math.round((count / gold.record_count) * 100);
                return (
                  <div key={label} className="flex items-center gap-2">
                    <span className={`text-[10px] font-mono w-14 ${text}`}>{label}</span>
                    <div className="flex-1 h-1.5 bg-[#D7D7D7] rounded-full overflow-hidden">
                      <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-[10px] text-[#6b7280] w-8 text-right">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Savings card */}
          <div className="mt-3 bg-emerald-400/5 border border-emerald-400/20 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="w-4 h-4 text-emerald-400 shrink-0" />
              <p className="text-xs font-semibold text-emerald-400">Penalty Savings Potential</p>
            </div>
            <div className="space-y-1 text-[10px]">
              <div className="flex justify-between">
                <span className="text-[#6b7280]">Total H+M exposure</span>
                <span className="text-amber-700">${gold.hm_exposure.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#6b7280]">Avoidable penalty (75%)</span>
                <span className="text-emerald-400 font-bold">${gold.penalty_savings_potential.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-1 text-[10px] text-[#6b7280]">
              <TrendingUp className="w-3 h-3" />
              Early detection before federal QC review
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

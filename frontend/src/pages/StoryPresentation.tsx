import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, TrendingUp, Database, Layers,
  ArrowRight, Building2, Zap, BarChart3, GitBranch,
  Activity, MessageSquare, CheckCircle2, ChevronRight,
  DollarSign, ClipboardList,
} from 'lucide-react';
import { api } from '../lib/api';
import { useBranding } from '../context/AppConfigContext';


// ── Helpers ──────────────────────────────────────────────────────────────

function useInView(ref: RefObject<HTMLElement | null>) {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setInView(true); obs.disconnect(); } },
      { threshold: 0.15 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return inView;
}

function Reveal({ children, delay = 0, className = '' }: {
  children: React.ReactNode; delay?: number; className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const vis = useInView(ref as RefObject<HTMLElement | null>);
  return (
    <div ref={ref} className={className} style={{
      opacity: vis ? 1 : 0,
      transform: vis ? 'none' : 'translateY(20px)',
      transition: `opacity 0.55s ease ${delay}ms, transform 0.55s ease ${delay}ms`,
    }}>
      {children}
    </div>
  );
}

function CountUp({ to, inView, prefix = '', suffix = '' }: {
  to: number; inView: boolean; prefix?: string; suffix?: string;
}) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - t0) / 1200, 1);
      setVal(Math.round((1 - Math.pow(1 - p, 3)) * to));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [inView, to]);
  return <>{prefix}{val.toLocaleString()}{suffix}</>;
}

// ── Story card ────────────────────────────────────────────────────────────

interface StoryCard {
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  challenge: string;
  context: string;
  cta: string;
  ctaPath: string;
  metric?: { label: string; value: number; color: string; prefix?: string; suffix?: string };
  accentColor: string;
}

export default function StoryPresentation() {
  const navigate = useNavigate();
  const { state, agency_name, error_rate_pct = 6.06, projected_liability = '~$200M' } = useBranding();
  const heroRef = useRef<HTMLDivElement>(null);
  const heroVis = useInView(heroRef as RefObject<HTMLElement | null>);

  const [liveMetrics, setLiveMetrics] = useState<{
    errorRate: number; highRisk: number; exposure: number;
    openSignals: number; reviewed: number; totalCases: number;
    casesNeedingReview: number;
  } | null>(null);

  useEffect(() => {
    Promise.allSettled([
      api.metrics.overview(),
      api.signals.list({ status: 'open', page_size: 1 }),
    ]).then(([m, s]) => {
      const metrics = m.status === 'fulfilled' ? m.value : null;
      const signals = s.status === 'fulfilled' ? s.value : null;
      if (metrics) {
        setLiveMetrics({
          errorRate: metrics.error_rate_pct,
          highRisk: metrics.high_risk,
          exposure: metrics.total_exposure_dollars,
          openSignals: signals?.total ?? 0,
          reviewed: metrics.reviewed_cases,
          totalCases: metrics.total_cases,
          casesNeedingReview: metrics.cases_needing_review,
        });
      }
    });
  }, []);

  const cards: StoryCard[] = [
    {
      icon: TrendingUp,
      iconColor: 'text-red-600',
      iconBg: 'bg-red-50 border-red-200',
      challenge: 'SNAP Payment Error Rate',
      context: `H.R. 1 requires states above 6% to cover 5–15% of benefit costs starting Oct 2027. ${state} was at ${error_rate_pct}% in FY2024 — ${error_rate_pct > 6 ? `creating ${projected_liability} in projected annual liability` : 'approaching the 6% threshold'}.`,
      cta: 'View QC Dashboard',
      ctaPath: '/?view=metrics',
      metric: { label: 'FY2024 Error Rate', value: error_rate_pct, suffix: '%', color: error_rate_pct > 6 ? 'text-red-600' : 'text-green-700' },
      accentColor: 'border-red-300',
    },
    {
      icon: AlertTriangle,
      iconColor: 'text-amber-700',
      iconBg: 'bg-amber-50 border-amber-200',
      challenge: 'High-Risk Cases Pending Review',
      context: 'Each unreviewed HIGH or MEDIUM case represents direct federal penalty exposure. Correcting cases before the QC review window closes avoids cost-share on every error dollar.',
      cta: 'Open Case Queue',
      ctaPath: '/queue',
      metric: liveMetrics ? { label: 'High-Risk Cases', value: liveMetrics.highRisk, color: 'text-amber-700' } : undefined,
      accentColor: 'border-amber-300',
    },
    {
      icon: GitBranch,
      iconColor: 'text-purple-600',
      iconBg: 'bg-purple-50 border-purple-200',
      challenge: 'Cross-Dataset Anomaly Signals',
      context: 'Death record matches, Medicaid gaps, unreported births, hospital discharge triggers, and missed deductions — automated cross-dataset signals that caseworkers miss without integrated data.',
      cta: 'Review Signals',
      ctaPath: '/signals',
      metric: liveMetrics ? { label: 'Open Signals', value: liveMetrics.openSignals, color: 'text-purple-600' } : undefined,
      accentColor: 'border-purple-300',
    },
    {
      icon: DollarSign,
      iconColor: 'text-green-700',
      iconBg: 'bg-green-50 border-green-200',
      challenge: 'QC Exposure & Financial Risk',
      context: 'Total dollar exposure across all flagged cases quantifies the fiscal cliff risk. Reducing errors in HIGH/MEDIUM cases before Oct 2026 avoids the 50%→75% cost-share shift under H.R. 1.',
      cta: 'View Reports',
      ctaPath: '/reports',
      metric: liveMetrics ? { label: 'Total QC Exposure', value: liveMetrics.exposure, prefix: '$', color: 'text-green-700' } : undefined,
      accentColor: 'border-green-300',
    },
    {
      icon: Database,
      iconColor: 'text-[#2e4e84]',
      iconBg: 'bg-blue-50 border-blue-200',
      challenge: 'Data Silos & Medallion Architecture',
      context: '10 source systems — ACES, ESD wage files, vital records, Medicaid, housing authority data, LIHEAP — unified through Bronze→Silver→Gold layers on the Databricks Lakehouse.',
      cta: 'Explore Data Catalog',
      ctaPath: '/catalog',
      accentColor: 'border-blue-300',
    },
    {
      icon: MessageSquare,
      iconColor: 'text-indigo-600',
      iconBg: 'bg-indigo-50 border-indigo-200',
      challenge: 'AI-Assisted Case Review',
      context: 'Caseworkers need targeted guidance, not raw data. Each flagged case gets AI-generated verification checklists, cross-dataset signal alerts, and a conversational assistant for policy lookups.',
      cta: 'Try AI Assistant',
      ctaPath: '/chat',
      accentColor: 'border-indigo-300',
    },
    {
      icon: Building2,
      iconColor: 'text-cyan-700',
      iconBg: 'bg-cyan-50 border-cyan-200',
      challenge: 'Rural Health & Medicaid Unwinding',
      context: 'Rural Medicaid funding projected to drop $4B+ over the next decade. Loss of Medicaid coverage can reduce deductible medical expenses and alter SNAP calculations — creating compounding eligibility errors.',
      cta: 'View Pipeline Health',
      ctaPath: '/pipeline',
      accentColor: 'border-cyan-300',
    },
    {
      icon: ClipboardList,
      iconColor: 'text-[#022569]',
      iconBg: 'bg-[#eaf0f9] border-[#bcc9d7]',
      challenge: 'Caseworker Review Progress',
      context: `Systematic QC review progress determines whether ${state} can demonstrate compliance before the FY2027 penalty window. Supervisors need real-time visibility into review completion rates.`,
      cta: 'View QC Reports',
      ctaPath: '/reports',
      metric: liveMetrics ? { label: 'Cases Reviewed', value: Math.round((liveMetrics.reviewed / liveMetrics.totalCases) * 100), suffix: '%', color: 'text-[#022569]' } : undefined,
      accentColor: 'border-[#bcc9d7]',
    },
  ];

  return (
    <div className="overflow-x-hidden">

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <div
        ref={heroRef}
        className="relative px-8 py-14 overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #022569 0%, #2e4e84 100%)' }}
      >
        <style>{`
          @keyframes pulse-slow { 0%,100% { opacity:.06 } 50% { opacity:.14 } }
        `}</style>
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 80% 60% at 70% 50%, rgba(241,173,2,.08) 0%, transparent 70%)' }} />

        <div className="max-w-4xl mx-auto relative z-10">
          <div
            className="inline-flex items-center gap-2 bg-[#f1ad02]/20 border border-[#f1ad02]/35 rounded-full px-3 py-1 text-[#f1ad02] text-xs font-bold tracking-wide uppercase mb-5"
            style={{ opacity: heroVis ? 1 : 0, transition: 'opacity .6s ease .1s' }}
          >
            <AlertTriangle className="w-3 h-3" />
            RHTP Fiscal Cliff Trigger · {state}
          </div>

          <h1
            className="text-white text-3xl md:text-4xl font-black leading-tight max-w-2xl mb-4"
            style={{ opacity: heroVis ? 1 : 0, transform: heroVis ? 'none' : 'translateY(-16px)', transition: 'opacity .7s ease .15s, transform .7s ease .15s' }}
          >
            Key Business Challenges in{' '}
            <span className="text-[#f1ad02]">{state}</span>{' '}
            {agency_name}
          </h1>

          <p
            className="text-white/65 text-sm leading-relaxed max-w-2xl mb-8"
            style={{ opacity: heroVis ? 1 : 0, transition: 'opacity .7s ease .3s' }}
          >
            H.R. 1's fiscal cliff means states with SNAP error rates above 6% must cover 5–15% of benefit costs starting October 2027.{' '}
            {state}'s error rate is trending toward 8%, creating ~$200M in annual state liability.
            This app surfaces the data, signals, and workflows needed to act before the penalty window closes.
          </p>

          {/* 3 anchor stats */}
          <div
            className="flex flex-wrap gap-4"
            style={{ opacity: heroVis ? 1 : 0, transition: 'opacity .7s ease .45s' }}
          >
            {[
              { label: `${state} Error Rate FY2024`, val: `${error_rate_pct}%`, sub: error_rate_pct > 6 ? 'Above 6% threshold' : 'Below 6% threshold', red: error_rate_pct > 6 },
              { label: 'Projected Annual Liability', val: projected_liability, sub: 'At 8–10% error rate', red: true },
              { label: 'RHT Funding Gap', val: '$4B+', sub: 'Medicaid drop over decade', red: false },
            ].map(s => (
              <div key={s.label} className="bg-white/8 border border-white/15 rounded-xl px-5 py-3 backdrop-blur-sm">
                <p className={`text-xl font-black ${s.red ? 'text-red-400' : 'text-blue-300'}`}>{s.val}</p>
                <p className="text-white/85 text-xs font-semibold mt-0.5">{s.label}</p>
                <p className="text-white/40 text-[10px]">{s.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Section header ─────────────────────────────────────────────── */}
      <div className="bg-[#F4F4F4] border-b border-[#D7D7D7] px-8 py-5">
        <div className="max-w-4xl mx-auto">
          <Reveal>
            <p className="text-xs font-bold uppercase tracking-widest text-[#4a5260] mb-1">Navigate the Response</p>
            <h2 className="text-xl font-black text-[#022569]">8 Business Challenges → Live App Features</h2>
            <p className="text-xs text-[#4a5260] mt-1">Each challenge from the fiscal cliff analysis is addressed by a specific feature. Explore the live data behind each one.</p>
          </Reveal>
        </div>
      </div>

      {/* ── Cards grid ─────────────────────────────────────────────────── */}
      <div className="bg-[#F4F4F4] px-8 py-8">
        <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-4">
          {cards.map((card, i) => (
            <Reveal key={card.challenge} delay={i * 60}>
              <div
                className={`bg-white border-l-4 ${card.accentColor} border border-[#D7D7D7] rounded-2xl p-5 flex flex-col h-full hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer group`}
                onClick={() => navigate(card.ctaPath.replace('/?view=metrics', '/'))}
              >
                {/* Header */}
                <div className="flex items-start gap-3 mb-3">
                  <div className={`w-9 h-9 rounded-xl border flex items-center justify-center flex-shrink-0 ${card.iconBg}`}>
                    <card.icon className={`w-4 h-4 ${card.iconColor}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold text-[#022569] leading-snug">{card.challenge}</h3>
                  </div>
                  {card.metric && (
                    <div className="text-right flex-shrink-0">
                      <p className={`text-xl font-black ${card.metric.color} leading-none`}>
                        {typeof card.metric.value === 'number'
                          ? <LiveStat metric={card.metric} />
                          : card.metric.value}
                      </p>
                      <p className="text-[10px] text-[#6b7280] mt-0.5">{card.metric.label}</p>
                    </div>
                  )}
                </div>

                {/* Context */}
                <p className="text-xs text-[#4a5260] leading-relaxed flex-1 mb-4">{card.context}</p>

                {/* CTA */}
                <div className="flex items-center justify-between">
                  <button
                    onClick={e => { e.stopPropagation(); navigate(card.ctaPath.replace('/?view=metrics', '/')); }}
                    className={`inline-flex items-center gap-1.5 text-xs font-bold ${card.iconColor} hover:gap-2.5 transition-all`}
                  >
                    {card.cta}
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                  <ArrowRight className={`w-4 h-4 ${card.iconColor} opacity-0 group-hover:opacity-100 transition-opacity`} />
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>

      {/* ── Medallion flow banner ───────────────────────────────────────── */}
      <div className="bg-white border-t border-[#D7D7D7] px-8 py-10">
        <div className="max-w-4xl mx-auto">
          <Reveal>
            <div className="flex items-center gap-2 mb-2">
              <Layers className="w-4 h-4 text-[#2e4e84]" />
              <span className="text-xs font-bold uppercase tracking-widest text-[#4a5260]">How the Platform Works</span>
            </div>
            <h2 className="text-xl font-black text-[#022569] mb-6">Medallion Architecture — Data to Action</h2>
          </Reveal>

          <div className="grid grid-cols-3 gap-0 items-stretch">
            {[
              {
                tier: 'BRONZE', bg: 'bg-amber-700', border: 'border-amber-200', card: 'bg-amber-50',
                label: 'Raw Ingestion',
                items: ['ACES / SNAP eligibility', 'ESD wage & new-hire', 'Vital records', 'Housing authority data', 'LIHEAP & utility records', 'Hospital ADT & claims'],
              },
              {
                tier: 'SILVER', bg: 'bg-[#6b7280]', border: 'border-[#D7D7D7]', card: 'bg-[#F4F4F4]',
                label: 'Cleaned & Linked',
                items: ['Entity resolution across programs', 'Income validation vs. ESD', 'Household change tracking', 'Schema validation & dedup'],
              },
              {
                tier: 'GOLD', bg: 'bg-[#022569]', border: 'border-blue-200', card: 'bg-blue-50',
                label: 'Analytics & Alerts',
                items: ['ML risk scores → Case Queue', 'Cross-dataset signals → Signals', 'QC dashboards → Reports', 'Caseworker actions → CaseDetail'],
              },
            ].map((layer, i) => (
              <Reveal key={layer.tier} delay={i * 120} className="flex">
                <div className={`border ${layer.border} rounded-none first:rounded-l-2xl last:rounded-r-2xl ${layer.card} p-5 flex-1 ${i === 1 ? 'border-x-0' : ''}`}>
                  <span className={`${layer.bg} text-white text-[10px] font-black px-2.5 py-1 rounded-full inline-block mb-2`}>{layer.tier}</span>
                  <p className="text-xs font-semibold text-[#022569] mb-3">{layer.label}</p>
                  <ul className="space-y-1">
                    {layer.items.map(item => (
                      <li key={item} className="text-[11px] text-[#4a5260] flex gap-1.5">
                        <span className="text-[#f1ad02] mt-0.5 flex-shrink-0">›</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                {i < 2 && (
                  <div className="flex items-center px-2 flex-shrink-0 z-10">
                    <div className="w-6 h-6 rounded-full bg-[#f1ad02] flex items-center justify-center shadow">
                      <ArrowRight className="w-3 h-3 text-white" />
                    </div>
                  </div>
                )}
              </Reveal>
            ))}
          </div>
        </div>
      </div>

      {/* ── Recommendations row ─────────────────────────────────────────── */}
      <div className="bg-[#F4F4F4] border-t border-[#D7D7D7] px-8 py-10">
        <div className="max-w-4xl mx-auto">
          <Reveal>
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="w-4 h-4 text-green-700" />
              <span className="text-xs font-bold uppercase tracking-widest text-[#4a5260]">Recommendations</span>
            </div>
            <h2 className="text-xl font-black text-[#022569] mb-6">6 Actions to Manage the Fiscal Cliff</h2>
          </Reveal>

          <div className="grid md:grid-cols-2 gap-3">
            {[
              { n: 1, title: 'Cross-agency data governance council', app: 'Data Catalog', path: '/catalog', icon: Database },
              { n: 2, title: 'Integrate wage & housing data first', app: 'Pipeline Monitor', path: '/pipeline', icon: Activity },
              { n: 3, title: 'Deploy early-warning ML system', app: 'Signals + Case Queue', path: '/signals', icon: Zap },
              { n: 4, title: 'Utilize RHT technology funding', app: 'Pipeline Monitor', path: '/pipeline', icon: Building2 },
              { n: 5, title: 'Monitor Medicaid coverage unwinding', app: 'Signals Page', path: '/signals', icon: AlertTriangle },
              { n: 6, title: 'Simulate policy impact scenarios', app: 'AI Assistant', path: '/chat', icon: BarChart3 },
            ].map((r, i) => (
              <Reveal key={r.n} delay={i * 55}>
                <div
                  className="flex items-center gap-3 bg-white border border-[#D7D7D7] rounded-xl px-4 py-3 hover:border-[#2e4e84]/40 hover:shadow-sm transition-all cursor-pointer group"
                  onClick={() => navigate(r.path)}
                >
                  <span className="w-6 h-6 rounded-full bg-[#022569] text-white text-xs font-black flex items-center justify-center flex-shrink-0">{r.n}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-[#022569] truncate">{r.title}</p>
                    <p className="text-[10px] text-[#6b7280]">→ {r.app}</p>
                  </div>
                  <r.icon className="w-4 h-4 text-[#6b7280] group-hover:text-[#2e4e84] transition-colors flex-shrink-0" />
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
}

// Live stat with count-up
function LiveStat({ metric }: { metric: { value: number; prefix?: string; suffix?: string; color: string } }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setInView(true); obs.disconnect(); } }, { threshold: 0.5 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <span ref={ref}>
      <CountUp to={metric.value} inView={inView} prefix={metric.prefix} suffix={metric.suffix} />
    </span>
  );
}

import { useState, useEffect } from 'react';
import { Database, Layers, X, Table2 } from 'lucide-react';
import { useAppConfig } from '../context/AppConfigContext';
import type { DataSource, UseCase } from '../lib/api';

type MedTab = 'bronze' | 'silver' | 'gold' | 'use_cases';

const DOMAIN_COLORS: Record<string, string> = {
  'Public Benefits': 'bg-[#eaf0f9] text-[#2e4e84]',
  'Healthcare':      'bg-green-50 text-green-700',
  'SDOH':            'bg-purple-50 text-purple-700',
  'Vital Records':   'bg-rose-50 text-rose-700',
};

const LAYER_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  bronze: { bg: 'bg-[#78350f]', text: 'text-yellow-300', label: 'BRONZE' },
  silver: { bg: 'bg-[#374151]', text: 'text-[#d1d5db]',  label: 'SILVER' },
  gold:   { bg: 'bg-[#713f12]', text: 'text-yellow-200', label: 'GOLD'   },
};

function DomainChip({ domain }: { domain: string }) {
  const cls = DOMAIN_COLORS[domain] ?? 'bg-[#eaf0f9] text-[#2e4e84]';
  return (
    <span className={`text-[10.5px] font-semibold px-2 py-0.5 rounded whitespace-nowrap ${cls}`}>
      {domain}
    </span>
  );
}

/* ─── Source card ─── */
function SourceCard({ source, layer, onClick }: { source: DataSource; layer?: string; onClick: () => void }) {
  const lb = layer ? LAYER_BADGE[layer] : undefined;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={e => e.key === 'Enter' && onClick()}
      className="bg-white border border-[#D7D7D7] rounded-xl p-5 hover:border-[#6a82b3] hover:shadow-[0_4px_14px_rgba(2,37,105,.1)] hover:-translate-y-px transition-all cursor-pointer"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="text-[13.5px] font-bold text-[#022569] font-mono leading-snug break-all">{source.name}</span>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {lb && (
            <span className={`text-[9.5px] font-extrabold rounded px-1.5 py-0.5 uppercase tracking-[.04em] ${lb.bg} ${lb.text}`}>
              {lb.label}
            </span>
          )}
          <DomainChip domain={source.domain} />
        </div>
      </div>
      <p className="text-[12.5px] text-[#4a5260] leading-relaxed mb-3 line-clamp-2">{source.description}</p>
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-[#9ca3af] font-semibold">{source.system}</span>
        <span className="text-[10.5px] bg-[#F4F4F4] border border-[#D7D7D7] rounded-full px-2.5 py-0.5 text-[#4a5260] font-semibold">
          {source.cadence}
        </span>
      </div>
    </div>
  );
}

/* ─── Type badge ─── */
const TYPE_COLORS: Record<string, string> = {
  STRING:    'text-[#2e4e84] bg-[#eaf0f9]',
  LONG:      'text-amber-700 bg-amber-50',
  INT:       'text-amber-700 bg-amber-50',
  DOUBLE:    'text-purple-700 bg-purple-50',
  DATE:      'text-green-700 bg-green-50',
  TIMESTAMP: 'text-green-700 bg-green-50',
  BOOLEAN:   'text-rose-700 bg-rose-50',
  ARRAY:     'text-[#4a5260] bg-[#F4F4F4]',
};

function TypeBadge({ type }: { type: string }) {
  const cls = TYPE_COLORS[type] ?? 'text-[#4a5260] bg-[#F4F4F4]';
  return (
    <span className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded uppercase ${cls}`}>
      {type}
    </span>
  );
}

/* ─── Source detail panel ─── */
const META_ROWS: { label: string; field: 'domain' | 'system' | 'cadence' }[] = [
  { label: 'Domain',   field: 'domain'   },
  { label: 'System',   field: 'system'   },
  { label: 'Cadence',  field: 'cadence'  },
];

function SourcePanel({ source, onClose }: { source: DataSource; onClose: () => void }) {
  /* Close on Escape */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed top-[108px] right-0 bottom-0 z-50 w-[520px] max-w-[95vw] bg-white shadow-[−8px_0_32px_rgba(2,37,105,.14)] border-l border-[#D7D7D7] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-start gap-4 px-7 pt-6 pb-5 border-b border-[#D7D7D7]">
          <div className="flex-1 min-w-0">
            <h2 className="text-[17px] font-extrabold text-[#022569] font-mono break-all leading-snug">
              {source.name}
            </h2>
            <p className="text-[13px] text-[#4a5260] mt-2 leading-relaxed">{source.description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 mt-0.5 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[#eaf0f9] text-[#9ca3af] hover:text-[#022569] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-7 py-6 space-y-7">

          {/* Product Metadata */}
          <section>
            <p className="text-[11px] font-bold uppercase tracking-[.12em] text-[#4a5260] mb-3">
              Product Metadata
            </p>
            <table className="w-full text-[13px]">
              <tbody>
                {META_ROWS.map(({ label, field }) => (
                  <tr key={field} className="border-b border-[#F4F4F4]">
                    <td className="py-2.5 pr-6 w-36 text-[11px] font-bold uppercase tracking-[.08em] text-[#9ca3af]">
                      {label}
                    </td>
                    <td className="py-2.5 text-[#1f2330] font-medium">
                      {source[field] || '—'}
                    </td>
                  </tr>
                ))}
                <tr className="border-b border-[#F4F4F4]">
                  <td className="py-2.5 pr-6 text-[11px] font-bold uppercase tracking-[.08em] text-[#9ca3af]">
                    Layer
                  </td>
                  <td className="py-2.5">
                    {source.layer && LAYER_BADGE[source.layer] && (
                      <span className={`text-[10px] font-extrabold rounded px-1.5 py-0.5 uppercase tracking-[.04em] ${LAYER_BADGE[source.layer].bg} ${LAYER_BADGE[source.layer].text}`}>
                        {LAYER_BADGE[source.layer].label}
                      </span>
                    )}
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 pr-6 text-[11px] font-bold uppercase tracking-[.08em] text-[#9ca3af]">
                    Access
                  </td>
                  <td className="py-2.5">
                    <span className="text-[11.5px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">
                      Restricted
                    </span>
                  </td>
                </tr>
                {source.sources && source.sources.length > 0 && (
                  <tr>
                    <td className="py-2.5 pr-6 text-[11px] font-bold uppercase tracking-[.08em] text-[#9ca3af]">
                      Sources
                    </td>
                    <td className="py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {source.sources.map(s => (
                          <span key={s} className="text-[10px] font-mono font-semibold bg-[#eaf0f9] text-[#2e4e84] px-1.5 py-0.5 rounded">
                            {s}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>

          {/* Schema */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Table2 className="w-3.5 h-3.5 text-[#9ca3af]" />
              <p className="text-[11px] font-bold uppercase tracking-[.12em] text-[#4a5260]">
                Schema Preview
              </p>
              {source.schema && (
                <span className="ml-auto text-[10.5px] text-[#9ca3af]">{source.schema.length} columns</span>
              )}
            </div>
            {source.schema && source.schema.length > 0 ? (
              <div className="border border-[#D7D7D7] rounded-xl overflow-hidden">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="bg-[#F4F4F4] border-b border-[#D7D7D7]">
                      <th className="text-left px-3 py-2 text-[10.5px] font-bold uppercase tracking-[.08em] text-[#9ca3af] w-[38%]">Column</th>
                      <th className="text-left px-3 py-2 text-[10.5px] font-bold uppercase tracking-[.08em] text-[#9ca3af] w-[20%]">Type</th>
                      <th className="text-left px-3 py-2 text-[10.5px] font-bold uppercase tracking-[.08em] text-[#9ca3af]">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {source.schema.map((col, i) => (
                      <tr key={col.column} className={i % 2 === 0 ? 'bg-white' : 'bg-[#fafafa]'}>
                        <td className="px-3 py-2 font-mono text-[11.5px] text-[#022569] font-semibold">{col.column}</td>
                        <td className="px-3 py-2">
                          <TypeBadge type={col.type} />
                        </td>
                        <td className="px-3 py-2 text-[#4a5260]">{col.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="bg-[#eaf0f9] border border-[#bcc9d7] rounded-xl p-5 text-center">
                <p className="text-[12.5px] font-semibold text-[#2e4e84]">Schema available via Unity Catalog</p>
                <p className="text-[11.5px] text-[#4a5260] mt-1">
                  Connect to <span className="font-mono text-[#022569]">{source.system}</span> to browse columns, types, and row-level stats.
                </p>
              </div>
            )}
          </section>

          {/* Related use cases */}
          <RelatedUseCases sourceName={source.name} domain={source.domain} />
        </div>
      </div>
    </>
  );
}

function RelatedUseCases({ sourceName, domain }: { sourceName: string; domain: string }) {
  const { config } = useAppConfig();
  const related = config.use_cases.filter(uc =>
    uc.title.toLowerCase().includes(domain.toLowerCase()) ||
    uc.analytical_question.toLowerCase().includes(sourceName.toLowerCase().split('_')[0])
  );

  if (related.length === 0) return null;

  return (
    <section>
      <p className="text-[11px] font-bold uppercase tracking-[.12em] text-[#4a5260] mb-3">
        Related Use Cases
      </p>
      <div className="space-y-2">
        {related.map(uc => (
          <div
            key={uc.id}
            className="bg-white border border-[#D7D7D7] rounded-lg px-4 py-3"
            style={{ borderLeft: '3px solid #2e4e84' }}
          >
            <p className="text-[12.5px] font-bold text-[#022569]">{uc.title}</p>
            <p className="text-[11.5px] text-[#4a5260] italic mt-0.5">"{uc.analytical_question}"</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─── Use case card ─── */
function UseCaseCard({ uc }: { uc: UseCase }) {
  return (
    <div
      className="bg-white border border-[#D7D7D7] rounded-xl p-5 cursor-pointer transition-all hover:shadow-[0_4px_14px_rgba(2,37,105,.08)]"
      style={{ borderLeft: '4px solid #2e4e84' }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderLeftColor = '#f1ad02'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderLeftColor = '#2e4e84'; }}
    >
      <p className="text-[13.5px] font-bold text-[#022569] mb-2">{uc.title}</p>
      <p className="text-[12px] text-[#4a5260] italic leading-relaxed mb-2">"{uc.analytical_question}"</p>
      {uc.description && (
        <p className="text-[12px] text-[#6b7280] leading-relaxed mb-3">{uc.description}</p>
      )}
      <span className="text-[12px] font-bold text-[#2e4e84]">→ View in AI Assistant</span>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="bg-[#eaf0f9] border-2 border-dashed border-[#bcc9d7] rounded-xl p-10 text-center">
      <Layers className="w-7 h-7 text-[#bcc9d7] mx-auto mb-2" />
      <p className="text-[13px] font-semibold text-[#4a5260]">{message}</p>
    </div>
  );
}

/* ─── Page ─── */
export default function DataCatalog() {
  const { config } = useAppConfig();
  const [tab, setTab] = useState<MedTab>('bronze');
  const [selected, setSelected] = useState<DataSource | null>(null);

  const bronzeSources = config.data_sources.filter(s => !s.layer || s.layer === 'bronze');
  const silverSources = config.data_sources.filter(s => s.layer === 'silver');
  const goldSources   = config.data_sources.filter(s => s.layer === 'gold');

  const tabs: {
    id: MedTab;
    badgeClass?: string;
    badgeLabel?: string;
    label: string;
    count: number | string;
    rightAlign?: boolean;
  }[] = [
    { id: 'bronze',    badgeClass: 'bg-[#78350f] text-yellow-300', badgeLabel: 'Bronze', label: 'Raw Intake',       count: bronzeSources.length || '—' },
    { id: 'silver',    badgeClass: 'bg-[#374151] text-[#d1d5db]',  badgeLabel: 'Silver', label: 'Cleaned & Linked', count: silverSources.length || '—' },
    { id: 'gold',      badgeClass: 'bg-[#713f12] text-yellow-200',  badgeLabel: 'Gold',   label: 'QC-Ready',         count: goldSources.length || '—' },
    { id: 'use_cases', label: 'Use Cases', count: config.use_cases.length || '—', rightAlign: true },
  ];

  return (
    <>
      <div className="p-7 max-w-[1120px] mx-auto">

        {/* Hero */}
        <div className="bg-[#2e4e84] rounded-2xl p-7 flex items-start gap-5 mb-6 shadow-[0_6px_20px_rgba(2,37,105,.15)]">
          <div className="w-11 h-11 rounded-xl bg-[#f1ad02]/20 flex items-center justify-center shrink-0 mt-0.5">
            <Database className="w-6 h-6 text-[#f1ad02]" />
          </div>
          <div>
            <h1 className="text-[22px] font-extrabold text-white mb-1.5">Data Catalog</h1>
            <p className="text-[14px] text-white/80 leading-relaxed max-w-[680px]">
              Browse intake feeds, linked datasets, and QC-ready outputs. Every source that flows into{' '}
              {config.program_name} lives here, organized by medallion layer.
            </p>
            <div className="flex gap-2.5 mt-3.5 flex-wrap">
              {config.data_sources.length > 0 && (
                <span className="bg-white/[.12] border border-white/[.18] rounded-full px-3 py-1 text-[11.5px] font-semibold text-white/90">
                  {config.data_sources.length} sources
                </span>
              )}
              <span className="bg-white/[.12] border border-white/[.18] rounded-full px-3 py-1 text-[11.5px] font-semibold text-white/90">
                3 medallion layers
              </span>
              {config.use_cases.length > 0 && (
                <span className="bg-white/[.12] border border-white/[.18] rounded-full px-3 py-1 text-[11.5px] font-semibold text-white/90">
                  {config.use_cases.length} use cases
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3.5 mb-6">
          {[
            { num: config.data_sources.length || '—', label: 'Active data sources' },
            { num: 3,                                  label: 'Medallion layers' },
            { num: config.use_cases.length || '—',     label: 'Analytical use cases' },
          ].map(({ num, label }) => (
            <div key={label} className="bg-white border border-[#D7D7D7] rounded-xl p-4" style={{ borderLeft: '4px solid #f1ad02' }}>
              <div className="text-[28px] font-extrabold text-[#022569] leading-none">{num}</div>
              <div className="text-[12.5px] text-[#4a5260] mt-1">{label}</div>
            </div>
          ))}
        </div>

        {/* Medallion tabs */}
        <div className="flex border-b-2 border-[#D7D7D7] mb-5">
          {tabs.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-5 py-2.5 text-[13.5px] font-semibold whitespace-nowrap border-b-[3px] -mb-0.5 transition-colors ${
                tab === t.id
                  ? 'text-[#022569] border-[#f1ad02]'
                  : 'text-[#4a5260] border-transparent hover:text-[#022569]'
              } ${t.rightAlign ? 'ml-auto' : ''}`}
            >
              {t.badgeLabel && (
                <span className={`text-[10px] font-extrabold rounded px-1.5 py-0.5 uppercase tracking-[.04em] ${t.badgeClass}`}>
                  {t.badgeLabel}
                </span>
              )}
              {t.label}
              <span className="text-[11px] text-[#9ca3af] font-semibold ml-0.5">{t.count}</span>
            </button>
          ))}
        </div>

        {/* Tab panels */}
        {tab === 'bronze' && (
          <>
            <p className="text-[11px] font-bold uppercase tracking-[.12em] text-[#4a5260] mb-3.5">Bronze — Raw intake feeds</p>
            {bronzeSources.length === 0
              ? <EmptyState message="No data sources configured yet. Add them in Settings → Data Sources." />
              : (
                <div className="grid grid-cols-3 gap-3.5">
                  {bronzeSources.map(s => (
                    <SourceCard key={s.id} source={s} layer="bronze" onClick={() => setSelected(s)} />
                  ))}
                </div>
              )
            }
          </>
        )}

        {tab === 'silver' && (
          <>
            <p className="text-[11px] font-bold uppercase tracking-[.12em] text-[#4a5260] mb-3.5">Silver — Cleaned &amp; Linked</p>
            {silverSources.length === 0
              ? <EmptyState message="Silver layer — entity-resolved and cleaned records — coming soon." />
              : <div className="grid grid-cols-3 gap-3.5">{silverSources.map(s => <SourceCard key={s.id} source={s} layer="silver" onClick={() => setSelected(s)} />)}</div>
            }
          </>
        )}

        {tab === 'gold' && (
          <>
            <p className="text-[11px] font-bold uppercase tracking-[.12em] text-[#4a5260] mb-3.5">Gold — QC-Ready Outputs</p>
            {goldSources.length === 0
              ? <EmptyState message="Gold layer — QC-ready outputs and scored case records — coming soon." />
              : <div className="grid grid-cols-3 gap-3.5">{goldSources.map(s => <SourceCard key={s.id} source={s} layer="gold" onClick={() => setSelected(s)} />)}</div>
            }
          </>
        )}

        {tab === 'use_cases' && (
          <>
            <p className="text-[11px] font-bold uppercase tracking-[.12em] text-[#4a5260] mb-3.5">Analytical Use Cases</p>
            {config.use_cases.length === 0
              ? <EmptyState message="No use cases configured yet. Add them in Settings → Use Cases." />
              : <div className="grid grid-cols-3 gap-3.5">{config.use_cases.map(uc => <UseCaseCard key={uc.id} uc={uc} />)}</div>
            }
          </>
        )}
      </div>

      {/* Slide-over panel */}
      {selected && <SourcePanel source={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

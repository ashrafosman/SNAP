import { useState } from 'react';
import { Database, Layers } from 'lucide-react';
import { useAppConfig } from '../context/AppConfigContext';
import type { DataSource, UseCase } from '../lib/api';

type MedTab = 'bronze' | 'silver' | 'gold' | 'use_cases';

const DOMAIN_COLORS: Record<string, string> = {
  'Public Benefits': 'bg-[#eaf0f9] text-[#2e4e84]',
  'Healthcare':      'bg-green-50 text-green-700',
  'SDOH':            'bg-purple-50 text-purple-700',
  'Vital Records':   'bg-rose-50 text-rose-700',
};

function DomainChip({ domain }: { domain: string }) {
  const cls = DOMAIN_COLORS[domain] ?? 'bg-[#eaf0f9] text-[#2e4e84]';
  return (
    <span className={`text-[10.5px] font-semibold px-2 py-0.5 rounded whitespace-nowrap ${cls}`}>
      {domain}
    </span>
  );
}

function SourceCard({ source }: { source: DataSource }) {
  return (
    <div className="bg-white border border-[#D7D7D7] rounded-xl p-5 hover:border-[#6a82b3] hover:shadow-[0_4px_14px_rgba(2,37,105,.1)] hover:-translate-y-px transition-all cursor-pointer">
      <div className="flex items-start justify-between mb-2">
        <span className="text-[14px] font-bold text-[#022569]">{source.name}</span>
        <DomainChip domain={source.domain} />
      </div>
      <p className="text-[12.5px] text-[#4a5260] leading-relaxed mb-3">{source.description}</p>
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-[#9ca3af] font-semibold">{source.system}</span>
        <span className="text-[10.5px] bg-[#F4F4F4] border border-[#D7D7D7] rounded-full px-2.5 py-0.5 text-[#4a5260] font-semibold">
          {source.cadence}
        </span>
      </div>
    </div>
  );
}

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

export default function DataCatalog() {
  const { config } = useAppConfig();
  const [tab, setTab] = useState<MedTab>('bronze');

  const tabs: {
    id: MedTab;
    badgeClass?: string;
    badgeLabel?: string;
    label: string;
    count: number | string;
    rightAlign?: boolean;
  }[] = [
    { id: 'bronze',    badgeClass: 'bg-[#78350f] text-yellow-300', badgeLabel: 'Bronze', label: 'Raw Intake',       count: config.data_sources.length || '—' },
    { id: 'silver',    badgeClass: 'bg-[#374151] text-[#d1d5db]',  badgeLabel: 'Silver', label: 'Cleaned & Linked', count: '—' },
    { id: 'gold',      badgeClass: 'bg-[#713f12] text-yellow-200',  badgeLabel: 'Gold',   label: 'QC-Ready',         count: '—' },
    { id: 'use_cases', label: 'Use Cases', count: config.use_cases.length || '—', rightAlign: true },
  ];

  return (
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
          {config.data_sources.length === 0
            ? <EmptyState message="No data sources configured yet. Add them in Settings → Data Sources." />
            : <div className="grid grid-cols-3 gap-3.5">{config.data_sources.map(s => <SourceCard key={s.id} source={s} />)}</div>
          }
        </>
      )}

      {tab === 'silver' && (
        <>
          <p className="text-[11px] font-bold uppercase tracking-[.12em] text-[#4a5260] mb-3.5">Silver — Cleaned &amp; Linked</p>
          <EmptyState message="Silver layer — entity-resolved and cleaned records — coming soon." />
        </>
      )}

      {tab === 'gold' && (
        <>
          <p className="text-[11px] font-bold uppercase tracking-[.12em] text-[#4a5260] mb-3.5">Gold — QC-Ready Outputs</p>
          <EmptyState message="Gold layer — QC-ready outputs and scored case records — coming soon." />
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
  );
}

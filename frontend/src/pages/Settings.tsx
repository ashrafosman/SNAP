import { useState, useEffect } from 'react';
import { ShieldAlert, Save, Database, Target } from 'lucide-react';
import { useAppConfig } from '../context/AppConfigContext';
import { api, type AppConfig, type DataSource, type UseCase } from '../lib/api';

type Tab = 'branding' | 'data_sources' | 'use_cases';

export default function Settings() {
  const { config, setConfig, loading } = useAppConfig();
  const [tab, setTab] = useState<Tab>('branding');
  const [draft, setDraft] = useState<AppConfig>(() => ({ ...config }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!loading) setDraft({ ...config });
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const result = await api.settings.saveConfig(draft);
      setConfig(result);
      setDraft(result);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-xl font-bold mb-1">Settings</h1>
      <p className="text-sm text-[#4a5260] mb-6">Configure branding, data sources, and use cases for this deployment.</p>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-[#D7D7D7]">
        {(['branding', 'data_sources', 'use_cases'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium rounded-t transition-colors ${
              tab === t
                ? 'bg-white text-[#022569] border-b-2 border-[#f1ad02]'
                : 'text-[#4a5260] hover:text-[#022569]'
            }`}
          >
            {t === 'branding' ? 'Branding' : t === 'data_sources' ? 'Data Sources' : 'Use Cases'}
          </button>
        ))}
      </div>

      {tab === 'branding' && (
        <BrandingTab draft={draft} setDraft={setDraft} />
      )}
      {tab === 'data_sources' && (
        <DataSourcesTab draft={draft} setDraft={setDraft} />
      )}
      {tab === 'use_cases' && (
        <UseCasesTab draft={draft} setDraft={setDraft} />
      )}

      {/* Save bar */}
      <div className="mt-8 flex items-center gap-4">
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2 text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors"
          style={{ backgroundColor: draft.accent_color }}
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
        {saved && <span className="text-sm text-green-700">Saved!</span>}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </div>
  );
}

// ── Branding Tab ──────────────────────────────────────────────────────────────

function BrandingTab({ draft, setDraft }: { draft: AppConfig; setDraft: (d: AppConfig) => void }) {
  const set = (key: keyof Omit<AppConfig, 'data_sources' | 'use_cases'>, value: string) =>
    setDraft({ ...draft, [key]: value });

  return (
    <div className="grid grid-cols-2 gap-6">
      <div className="col-span-2 lg:col-span-1 space-y-4">
        {[
          { key: 'program_name' as const, label: 'Program Name', placeholder: 'SNAP QC Guard' },
          { key: 'agency_name' as const, label: 'Agency Name', placeholder: 'Michigan SNAP' },
          { key: 'state' as const, label: 'State', placeholder: 'Michigan' },
          { key: 'tagline' as const, label: 'Tagline', placeholder: 'Early Warning System' },
        ].map(({ key, label, placeholder }) => (
          <div key={key}>
            <label className="block text-xs font-medium text-[#4a5260] mb-1">{label}</label>
            <input
              type="text"
              value={draft[key] as string}
              onChange={e => set(key, e.target.value)}
              placeholder={placeholder}
              className="w-full bg-[#F4F4F4] border border-[#D7D7D7] rounded-lg px-3 py-2 text-sm text-[#1f2330] focus:outline-none focus:border-[#2e4e84]"
            />
          </div>
        ))}
        <div>
          <label className="block text-xs font-medium text-[#4a5260] mb-1">Accent Color</label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={draft.accent_color}
              onChange={e => set('accent_color', e.target.value)}
              className="w-10 h-10 rounded cursor-pointer border border-[#D7D7D7] bg-transparent"
            />
            <input
              type="text"
              value={draft.accent_color}
              onChange={e => set('accent_color', e.target.value)}
              className="flex-1 bg-[#F4F4F4] border border-[#D7D7D7] rounded-lg px-3 py-2 text-sm text-[#1f2330] font-mono focus:outline-none focus:border-[#2e4e84]"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-[#4a5260] mb-1">Footer Alert</label>
          <textarea
            value={draft.footer_alert}
            onChange={e => set('footer_alert', e.target.value)}
            rows={3}
            className="w-full bg-[#F4F4F4] border border-[#D7D7D7] rounded-lg px-3 py-2 text-sm text-[#1f2330] focus:outline-none focus:border-[#2e4e84] resize-none"
          />
        </div>
      </div>

      {/* Live preview */}
      <div className="col-span-2 lg:col-span-1">
        <p className="text-xs font-medium text-[#4a5260] mb-3">Sidebar Preview</p>
        <div className="w-48 bg-white border border-[#D7D7D7] rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <ShieldAlert className="w-4 h-4" style={{ color: draft.accent_color }} />
            <span className="text-xs font-bold">{draft.program_name || 'Program Name'}</span>
          </div>
          <p className="text-[10px] text-[#4a5260] mb-4">{draft.tagline} — {draft.state}</p>
          <div className="border-t border-[#D7D7D7] pt-3">
            <p className="text-[10px] text-[#6b7280] leading-relaxed">{draft.footer_alert}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Data Sources Tab ──────────────────────────────────────────────────────────

const EMPTY_DS: DataSource = { id: '', name: '', domain: '', system: '', description: '', cadence: '' };

function DataSourcesTab({ draft, setDraft }: { draft: AppConfig; setDraft: (d: AppConfig) => void }) {
  const [editing, setEditing] = useState<DataSource | null>(null);
  const [isNew, setIsNew] = useState(false);

  const save = (ds: DataSource) => {
    if (isNew) {
      if (draft.data_sources.some(s => s.id === ds.id)) return;
      setDraft({ ...draft, data_sources: [...draft.data_sources, ds] });
    } else {
      setDraft({ ...draft, data_sources: draft.data_sources.map(s => s.id === ds.id ? ds : s) });
    }
    setEditing(null);
    setIsNew(false);
  };

  const remove = (id: string) =>
    setDraft({ ...draft, data_sources: draft.data_sources.filter(s => s.id !== id) });

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-[#4a5260]">Configure the data intake feeds for this deployment.</p>
        <button
          onClick={() => { setEditing({ ...EMPTY_DS }); setIsNew(true); }}
          className="px-3 py-1.5 bg-[#F4F4F4] border border-[#D7D7D7] rounded-lg text-xs text-[#4a5260] hover:bg-[#eaf0f9] hover:text-[#022569] transition-colors flex items-center gap-1"
        >
          <Database className="w-3 h-3" /> Add Source
        </button>
      </div>

      {editing && (
        <DataSourceForm
          ds={editing}
          onChange={setEditing}
          onSave={save}
          onCancel={() => { setEditing(null); setIsNew(false); }}
        />
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-[#6b7280] border-b border-[#D7D7D7]">
            <th className="pb-2 pr-4">Name</th>
            <th className="pb-2 pr-4">Domain</th>
            <th className="pb-2 pr-4">System</th>
            <th className="pb-2 pr-4">Cadence</th>
            <th className="pb-2" />
          </tr>
        </thead>
        <tbody>
          {draft.data_sources.map(ds => (
            <tr key={ds.id} className="border-b border-[#1a1a22]">
              <td className="py-2 pr-4 text-[#1f2330]">{ds.name}</td>
              <td className="py-2 pr-4 text-[#4a5260]">{ds.domain}</td>
              <td className="py-2 pr-4 text-[#4a5260] text-xs">{ds.system}</td>
              <td className="py-2 pr-4 text-[#4a5260] text-xs">{ds.cadence}</td>
              <td className="py-2 flex gap-2">
                <button onClick={() => { setEditing({ ...ds }); setIsNew(false); }} className="text-xs text-[#2e4e84] hover:underline">Edit</button>
                <button onClick={() => remove(ds.id)} className="text-xs text-red-500 hover:underline">Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DataSourceForm({ ds, onChange, onSave, onCancel }: {
  ds: DataSource;
  onChange: (d: DataSource) => void;
  onSave: (d: DataSource) => void;
  onCancel: () => void;
}) {
  const set = (key: keyof DataSource, val: string) => onChange({ ...ds, [key]: val });

  return (
    <div className="bg-[#12121a] border border-[#D7D7D7] rounded-xl p-4 mb-4 grid grid-cols-2 gap-3">
      {([
        ['id', 'ID (slug)'],
        ['name', 'Name'],
        ['domain', 'Domain'],
        ['system', 'System'],
        ['cadence', 'Cadence'],
      ] as [keyof DataSource, string][]).map(([key, label]) => (
        <div key={key}>
          <label className="block text-xs text-[#4a5260] mb-1">{label}</label>
          <input
            value={ds[key]}
            onChange={e => set(key, e.target.value)}
            className="w-full bg-[#F4F4F4] border border-[#D7D7D7] rounded px-2 py-1.5 text-sm text-[#1f2330] focus:outline-none"
          />
        </div>
      ))}
      <div className="col-span-2">
        <label className="block text-xs text-[#4a5260] mb-1">Description</label>
        <textarea
          value={ds.description}
          onChange={e => set('description', e.target.value)}
          rows={2}
          className="w-full bg-[#F4F4F4] border border-[#D7D7D7] rounded px-2 py-1.5 text-sm text-[#1f2330] focus:outline-none resize-none"
        />
      </div>
      <div className="col-span-2 flex gap-2 justify-end">
        <button onClick={onCancel} className="px-3 py-1 text-xs text-[#4a5260] hover:text-[#022569]">Cancel</button>
        <button
          onClick={() => onSave(ds)}
          disabled={!ds.id || !ds.name || !ds.domain}
          className="px-3 py-1 text-xs bg-[#D7D7D7] text-[#1f2330] rounded hover:bg-[#bcc9d7] disabled:opacity-40"
        >
          Save
        </button>
      </div>
    </div>
  );
}

// ── Use Cases Tab ─────────────────────────────────────────────────────────────

const EMPTY_UC: UseCase = { id: '', title: '', description: '', analytical_question: '' };

function UseCasesTab({ draft, setDraft }: { draft: AppConfig; setDraft: (d: AppConfig) => void }) {
  const [editing, setEditing] = useState<UseCase | null>(null);
  const [isNew, setIsNew] = useState(false);

  const save = (uc: UseCase) => {
    if (isNew) {
      if (draft.use_cases.some(u => u.id === uc.id)) return;
      setDraft({ ...draft, use_cases: [...draft.use_cases, uc] });
    } else {
      setDraft({ ...draft, use_cases: draft.use_cases.map(u => u.id === uc.id ? uc : u) });
    }
    setEditing(null);
    setIsNew(false);
  };

  const remove = (id: string) =>
    setDraft({ ...draft, use_cases: draft.use_cases.filter(u => u.id !== id) });

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-[#4a5260]">Configure the analytical questions this deployment surfaces.</p>
        <button
          onClick={() => { setEditing({ ...EMPTY_UC }); setIsNew(true); }}
          className="px-3 py-1.5 bg-[#F4F4F4] border border-[#D7D7D7] rounded-lg text-xs text-[#4a5260] hover:bg-[#eaf0f9] hover:text-[#022569] transition-colors flex items-center gap-1"
        >
          <Target className="w-3 h-3" /> Add Use Case
        </button>
      </div>

      {editing && (
        <UseCaseForm
          uc={editing}
          onChange={setEditing}
          onSave={save}
          onCancel={() => { setEditing(null); setIsNew(false); }}
        />
      )}

      <div className="space-y-3">
        {draft.use_cases.map(uc => (
          <div key={uc.id} className="bg-[#12121a] border border-[#D7D7D7] rounded-lg p-4">
            <div className="flex justify-between items-start mb-1">
              <p className="text-sm font-medium text-[#022569]">{uc.title}</p>
              <div className="flex gap-2 ml-4 shrink-0">
                <button onClick={() => { setEditing({ ...uc }); setIsNew(false); }} className="text-xs text-[#2e4e84] hover:underline">Edit</button>
                <button onClick={() => remove(uc.id)} className="text-xs text-red-500 hover:underline">Delete</button>
              </div>
            </div>
            <p className="text-xs text-[#4a5260] mb-2">{uc.description}</p>
            <p className="text-xs text-[#4a5260] italic">"{uc.analytical_question}"</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function UseCaseForm({ uc, onChange, onSave, onCancel }: {
  uc: UseCase;
  onChange: (u: UseCase) => void;
  onSave: (u: UseCase) => void;
  onCancel: () => void;
}) {
  const set = (key: keyof UseCase, val: string) => onChange({ ...uc, [key]: val });

  return (
    <div className="bg-[#12121a] border border-[#D7D7D7] rounded-xl p-4 mb-4 space-y-3">
      {([
        ['id', 'ID (slug)'],
        ['title', 'Title'],
      ] as [keyof UseCase, string][]).map(([key, label]) => (
        <div key={key}>
          <label className="block text-xs text-[#4a5260] mb-1">{label}</label>
          <input
            value={uc[key]}
            onChange={e => set(key, e.target.value)}
            className="w-full bg-[#F4F4F4] border border-[#D7D7D7] rounded px-2 py-1.5 text-sm text-[#1f2330] focus:outline-none"
          />
        </div>
      ))}
      <div>
        <label className="block text-xs text-[#4a5260] mb-1">Description</label>
        <textarea
          value={uc.description}
          onChange={e => set('description', e.target.value)}
          rows={2}
          className="w-full bg-[#F4F4F4] border border-[#D7D7D7] rounded px-2 py-1.5 text-sm text-[#1f2330] focus:outline-none resize-none"
        />
      </div>
      <div>
        <label className="block text-xs text-[#4a5260] mb-1">Analytical Question</label>
        <textarea
          value={uc.analytical_question}
          onChange={e => set('analytical_question', e.target.value)}
          rows={2}
          className="w-full bg-[#F4F4F4] border border-[#D7D7D7] rounded px-2 py-1.5 text-sm text-[#1f2330] focus:outline-none resize-none"
        />
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="px-3 py-1 text-xs text-[#4a5260] hover:text-[#022569]">Cancel</button>
        <button
          onClick={() => onSave(uc)}
          disabled={!uc.id || !uc.title || !uc.analytical_question}
          className="px-3 py-1 text-xs bg-[#D7D7D7] text-[#1f2330] rounded hover:bg-[#bcc9d7] disabled:opacity-40"
        >
          Save
        </button>
      </div>
    </div>
  );
}

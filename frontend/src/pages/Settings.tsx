import { useState, useEffect } from 'react';
import { ShieldAlert, Save, Database, Target, Plus, Check, Pencil, Trash2 } from 'lucide-react';
import { useAppConfig } from '../context/AppConfigContext';
import { api, type AppConfig, type DataSource, type UseCase, type BrandingProfile } from '../lib/api';

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
        <BrandingTab draft={draft} setDraft={setDraft} onConfigSaved={setConfig} />
      )}
      {tab === 'data_sources' && (
        <DataSourcesTab draft={draft} setDraft={setDraft} />
      )}
      {tab === 'use_cases' && (
        <UseCasesTab draft={draft} setDraft={setDraft} />
      )}

      {/* Save bar — only for data sources and use cases */}
      {tab !== 'branding' && (
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
      )}
    </div>
  );
}

// ── Branding Tab ──────────────────────────────────────────────────────────────

const EMPTY_PROFILE: BrandingProfile = {
  id: '', name: '', state: '', agency_name: '', program_name: 'SNAP QC Guard',
  tagline: 'Early Warning System', accent_color: '#2e4e84',
  footer_alert: '', icon_url: '',
  error_rate_pct: 6.06, projected_liability: '~$200M', snap_benefits_annual_b: 4.0,
};

function BrandingTab({
  draft, setDraft, onConfigSaved,
}: {
  draft: AppConfig;
  setDraft: (d: AppConfig) => void;
  onConfigSaved: (c: AppConfig) => void;
}) {
  const { activateProfile } = useAppConfig();
  const [editingProfile, setEditingProfile] = useState<BrandingProfile | null>(null);
  const [isNewProfile, setIsNewProfile] = useState(false);
  const [activating, setActivating] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const saveProfile = async (p: BrandingProfile) => {
    // Optimistic update
    const profiles = isNewProfile
      ? [...(draft.profiles ?? []), { ...p, is_active: false }]
      : (draft.profiles ?? []).map(x => x.id === p.id ? { ...p, is_active: x.is_active } : x);
    setEditingProfile(null);
    setDraft({ ...draft, profiles });
    onConfigSaved({ ...draft, profiles });
    setSaving(true);
    setSaveError(null);
    try {
      await api.profiles.save(p);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const deleteProfile = async (id: string) => {
    const profiles = (draft.profiles ?? []).filter(p => p.id !== id);
    setDraft({ ...draft, profiles });
    onConfigSaved({ ...draft, profiles });
    try {
      await api.profiles.delete(id);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  const handleActivate = async (profile: BrandingProfile) => {
    setActivating(profile.id);
    try {
      await activateProfile(profile, draft.profiles ?? []);
      const { id, name, is_active, ...branding } = profile as any;
      setDraft({ ...draft, ...branding, active_profile_id: id });
    } finally {
      setActivating(null);
    }
  };

  const profiles = draft.profiles ?? [];

  return (
    <div className="space-y-8">

      {/* ── Profiles section ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-semibold text-[#022569]">Branding Profiles</p>
            <p className="text-xs text-[#6b7280]">Save and switch between deployments for different states</p>
          </div>
          <div className="flex items-center gap-3">
            {saving && <span className="text-xs text-[#6b7280]">Saving…</span>}
            {saveError && <span className="text-xs text-red-600">{saveError}</span>}
            <button
              onClick={() => { setEditingProfile({ ...EMPTY_PROFILE }); setIsNewProfile(true); }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#022569] text-white text-xs font-semibold rounded-lg hover:bg-[#2e4e84] transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> New Profile
            </button>
          </div>
        </div>

        {editingProfile && (
          <ProfileForm
            profile={editingProfile}
            isNew={isNewProfile}
            onChange={setEditingProfile}
            onSave={saveProfile}
            onCancel={() => setEditingProfile(null)}
          />
        )}

        {profiles.length === 0 && !editingProfile && (
          <div className="text-center py-8 border border-dashed border-[#D7D7D7] rounded-xl text-xs text-[#6b7280]">
            No profiles yet — create one to save and switch between state deployments
          </div>
        )}

        {profiles.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {profiles.map(p => {
              const isActive = draft.active_profile_id === p.id;
              return (
                <div
                  key={p.id}
                  className={`relative border rounded-xl p-4 transition-all ${
                    isActive
                      ? 'border-[#022569] bg-[#022569]/5 ring-1 ring-[#022569]/20'
                      : 'border-[#D7D7D7] bg-white hover:border-[#2e4e84]'
                  }`}
                >
                  {isActive && (
                    <span className="absolute top-3 right-3 flex items-center gap-1 text-[9px] font-bold text-[#022569] bg-[#022569]/10 px-1.5 py-0.5 rounded-full">
                      <Check className="w-2.5 h-2.5" /> Active
                    </span>
                  )}
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-lg bg-[#f1ad02] flex items-center justify-center shrink-0 overflow-hidden">
                      {p.icon_url
                        ? <img src={p.icon_url} alt={p.state} className="w-full h-full object-contain p-1" onError={e => { (e.target as HTMLImageElement).style.display='none'; }} />
                        : <ShieldAlert className="w-5 h-5 text-[#1f1611]" />
                      }
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[#022569] truncate">{p.name || p.state}</p>
                      <p className="text-[10px] text-[#6b7280] truncate">{p.agency_name}</p>
                    </div>
                  </div>
                  <p className="text-[10px] text-[#4a5260] mb-3 truncate">{p.tagline} · {p.state}</p>
                  <div className="flex items-center gap-2">
                    {!isActive && (
                      <button
                        onClick={() => handleActivate(p)}
                        disabled={activating === p.id}
                        className="flex-1 text-xs font-semibold py-1.5 rounded-lg bg-[#022569] text-white hover:bg-[#2e4e84] disabled:opacity-50 transition-colors"
                      >
                        {activating === p.id ? 'Activating…' : 'Activate'}
                      </button>
                    )}
                    <button
                      onClick={() => { setEditingProfile({ ...p }); setIsNewProfile(false); }}
                      className="p-1.5 rounded-lg border border-[#D7D7D7] text-[#4a5260] hover:text-[#022569] hover:border-[#022569] transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    {!isActive && (
                      <button
                        onClick={() => deleteProfile(p.id)}
                        className="p-1.5 rounded-lg border border-[#D7D7D7] text-[#4a5260] hover:text-red-600 hover:border-red-200 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}

function ProfileForm({
  profile, isNew, onChange, onSave, onCancel,
}: {
  profile: BrandingProfile;
  isNew: boolean;
  onChange: (p: BrandingProfile) => void;
  onSave: (p: BrandingProfile) => void;
  onCancel: () => void;
}) {
  const set = (key: keyof BrandingProfile, val: string) => onChange({ ...profile, [key]: val });

  return (
    <div className="border border-[#2e4e84]/30 bg-[#eaf0f9] rounded-xl p-4 mb-4">
      <p className="text-sm font-bold text-[#022569] mb-4">{isNew ? 'New Profile' : 'Edit Profile'}</p>
      <div className="grid grid-cols-2 gap-3">
        {([
          ['id', 'ID (slug)', 'washington-snap'],
          ['name', 'Profile Name', 'Washington State'],
          ['state', 'State', 'Washington'],
          ['agency_name', 'Agency Name', 'WA DSHS'],
          ['program_name', 'Program Name', 'SNAP QC Guard'],
          ['tagline', 'Tagline', 'Early Warning System'],
        ] as [keyof BrandingProfile, string, string][]).map(([key, label, placeholder]) => (
          <div key={key}>
            <label className="block text-xs font-medium text-[#4a5260] mb-1">{label}</label>
            <input
              value={profile[key] as string}
              onChange={e => set(key, e.target.value)}
              placeholder={placeholder}
              disabled={key === 'id' && !isNew}
              className="w-full bg-white border border-[#D7D7D7] rounded-lg px-3 py-2 text-sm text-[#1f2330] focus:outline-none focus:border-[#2e4e84] disabled:opacity-50"
            />
          </div>
        ))}
        <div className="col-span-2">
          <label className="block text-xs font-medium text-[#4a5260] mb-1">State Icon URL</label>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-[#f1ad02] flex items-center justify-center shrink-0 overflow-hidden border border-[#D7D7D7]">
              {profile.icon_url
                ? <img src={profile.icon_url} alt="icon" className="w-full h-full object-contain p-0.5" onError={e => { (e.target as HTMLImageElement).style.display='none'; }} />
                : <ShieldAlert className="w-4 h-4 text-[#1f1611]" />
              }
            </div>
            <input
              type="url"
              value={profile.icon_url ?? ''}
              onChange={e => set('icon_url', e.target.value)}
              placeholder="https://example.gov/state-seal.png"
              className="flex-1 bg-white border border-[#D7D7D7] rounded-lg px-3 py-2 text-sm text-[#1f2330] focus:outline-none focus:border-[#2e4e84]"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-[#4a5260] mb-1">Accent Color</label>
          <div className="flex gap-2">
            <input type="color" value={profile.accent_color} onChange={e => set('accent_color', e.target.value)}
              className="w-10 h-10 rounded cursor-pointer border border-[#D7D7D7] bg-transparent" />
            <input type="text" value={profile.accent_color} onChange={e => set('accent_color', e.target.value)}
              className="flex-1 bg-white border border-[#D7D7D7] rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#2e4e84]" />
          </div>
        </div>

        {/* QC Rate fields */}
        <div className="col-span-2 border-t border-[#D7D7D7] pt-3 mt-1">
          <p className="text-xs font-semibold text-[#022569] mb-3">QC Metrics</p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#4a5260] mb-1">Error Rate % (FY2024)</label>
              <input
                type="number" step="0.01" min="0" max="30"
                value={profile.error_rate_pct ?? 6.06}
                onChange={e => onChange({ ...profile, error_rate_pct: parseFloat(e.target.value) || 0 })}
                className="w-full bg-white border border-[#D7D7D7] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2e4e84]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#4a5260] mb-1">Projected Liability</label>
              <input
                type="text"
                value={profile.projected_liability ?? '~$200M'}
                onChange={e => onChange({ ...profile, projected_liability: e.target.value })}
                placeholder="~$200M"
                className="w-full bg-white border border-[#D7D7D7] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2e4e84]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#4a5260] mb-1">Annual SNAP Benefits ($B)</label>
              <input
                type="number" step="0.1" min="0"
                value={profile.snap_benefits_annual_b ?? 4.0}
                onChange={e => onChange({ ...profile, snap_benefits_annual_b: parseFloat(e.target.value) || 0 })}
                className="w-full bg-white border border-[#D7D7D7] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2e4e84]"
              />
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-[#4a5260] mb-1">Footer Alert</label>
          <textarea value={profile.footer_alert} onChange={e => set('footer_alert', e.target.value)} rows={2}
            className="w-full bg-white border border-[#D7D7D7] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#2e4e84] resize-none" />
        </div>
      </div>
      <div className="flex gap-2 justify-end mt-4">
        <button onClick={onCancel} className="px-4 py-1.5 text-xs text-[#4a5260] hover:text-[#022569]">Cancel</button>
        <button
          onClick={() => onSave(profile)}
          disabled={!profile.id || !profile.name || !profile.state}
          className="px-4 py-1.5 text-xs bg-[#022569] text-white rounded-lg hover:bg-[#2e4e84] disabled:opacity-40 transition-colors"
        >
          {isNew ? 'Add Profile' : 'Save Profile'}
        </button>
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
  const set = (key: Exclude<keyof DataSource, 'schema' | 'sources'>, val: string) => onChange({ ...ds, [key]: val });

  return (
    <div className="bg-[#12121a] border border-[#D7D7D7] rounded-xl p-4 mb-4 grid grid-cols-2 gap-3">
      {([
        ['id', 'ID (slug)'],
        ['name', 'Name'],
        ['domain', 'Domain'],
        ['system', 'System'],
        ['cadence', 'Cadence'],
      ] as [Exclude<keyof DataSource, 'schema' | 'sources'>, string][]).map(([key, label]) => (
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
          className="px-3 py-1 text-xs bg-[#2e4e84] text-white rounded hover:bg-[#022569] disabled:opacity-40"
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
          <div key={uc.id} className="bg-white border border-[#D7D7D7] rounded-lg p-4">
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
    <div className="bg-white border border-[#D7D7D7] rounded-xl p-4 mb-4 space-y-3">
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
          className="px-3 py-1 text-xs bg-[#2e4e84] text-white rounded hover:bg-[#022569] disabled:opacity-40"
        >
          Save
        </button>
      </div>
    </div>
  );
}

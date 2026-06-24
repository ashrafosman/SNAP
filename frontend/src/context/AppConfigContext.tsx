import { createContext, useContext, useEffect, useState } from 'react';
import { api, type AppConfig, type BrandingConfig, type BrandingProfile } from '../lib/api';

// localStorage is used as a fast cache so profiles render instantly on load;
// Lakebase (via API) is the source of truth shared across all users.
const LS_KEY = 'snap-qc-profiles-cache';

function cacheRead(): BrandingProfile[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]'); } catch { return []; }
}
function cacheWrite(profiles: BrandingProfile[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(profiles));
}

const DEFAULTS: AppConfig = {
  agency_name: 'Michigan SNAP',
  program_name: 'SNAP QC Guard',
  state: 'Michigan',
  accent_color: '#ef4444',
  tagline: 'Early Warning System',
  footer_alert: 'Oct 2026: SNAP cost-share shifts to 25/75. 40K recipients at risk.',
  icon_url: '',
  data_sources: [],
  use_cases: [],
  profiles: [],
  active_profile_id: undefined,
};

interface AppConfigContextValue {
  config: AppConfig;
  setConfig: (c: AppConfig) => void;
  activateProfile: (profile: BrandingProfile, currentProfiles?: BrandingProfile[]) => Promise<void>;
  loading: boolean;
}

const AppConfigContext = createContext<AppConfigContextValue>({
  config: DEFAULTS,
  setConfig: () => {},
  activateProfile: async () => {},
  loading: true,
});

export function AppConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfigState] = useState<AppConfig>(() => ({
    ...DEFAULTS,
    profiles: cacheRead(),
  }));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load branding config and profiles in parallel
    Promise.all([
      api.settings.getConfig().catch(() => DEFAULTS),
      api.profiles.list().catch(() => [] as BrandingProfile[]),
    ]).then(([cfg, profiles]) => {
      cacheWrite(profiles);
      const activeProfile = profiles.find(p => p.is_active);
      const base = { ...DEFAULTS, ...cfg, profiles };
      setConfigState(activeProfile
        ? { ...base, ...profileToBranding(activeProfile), active_profile_id: activeProfile.id }
        : base
      );
    }).finally(() => setLoading(false));
  }, []);

  const setConfig = (c: AppConfig) => setConfigState(c);

  const activateProfile = async (profile: BrandingProfile, currentProfiles?: BrandingProfile[]) => {
    // Optimistic update
    const profiles = (currentProfiles ?? config.profiles).map(p => ({
      ...p, is_active: p.id === profile.id,
    }));
    setConfigState({ ...config, profiles, ...profileToBranding(profile), active_profile_id: profile.id });
    cacheWrite(profiles);
    try {
      await api.profiles.activate(profile.id);
    } catch (e) {
      console.error('Failed to activate profile in Lakebase', e);
    }
  };

  return (
    <AppConfigContext.Provider value={{ config, setConfig, activateProfile, loading }}>
      {children}
    </AppConfigContext.Provider>
  );
}

function profileToBranding(p: BrandingProfile): Omit<BrandingProfile, 'id' | 'name' | 'is_active'> {
  const { id, name, is_active, ...branding } = p as any;
  return branding;
}

export const useAppConfig = () => useContext(AppConfigContext);

export const useBranding = (): BrandingConfig => {
  const { config } = useContext(AppConfigContext);
  return config;
};

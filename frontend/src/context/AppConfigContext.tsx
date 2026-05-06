import { createContext, useContext, useEffect, useState } from 'react';
import { api, type AppConfig, type BrandingConfig } from '../lib/api';

const DEFAULTS: AppConfig = {
  agency_name: 'Michigan SNAP',
  program_name: 'SNAP QC Guard',
  state: 'Michigan',
  accent_color: '#ef4444',
  tagline: 'Early Warning System',
  footer_alert: 'Oct 2026: SNAP cost-share shifts to 25/75. 40K recipients at risk.',
  data_sources: [],
  use_cases: [],
};

interface AppConfigContextValue {
  config: AppConfig;
  setConfig: (c: AppConfig) => void;
  loading: boolean;
}

const AppConfigContext = createContext<AppConfigContextValue>({
  config: DEFAULTS,
  setConfig: () => {},
  loading: true,
});

export function AppConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<AppConfig>(DEFAULTS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.settings.getConfig()
      .then(setConfig)
      .catch(() => {/* keep defaults on error */})
      .finally(() => setLoading(false));
  }, []);

  return (
    <AppConfigContext.Provider value={{ config, setConfig, loading }}>
      {children}
    </AppConfigContext.Provider>
  );
}

export const useAppConfig = () => useContext(AppConfigContext);

export const useBranding = (): BrandingConfig => {
  const { config } = useContext(AppConfigContext);
  return config;
};

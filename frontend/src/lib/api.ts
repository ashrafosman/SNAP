const BASE = '/api';

async function fetchJson(path: string, opts?: RequestInit) {
  const r = await fetch(BASE + path, opts);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}

export interface RiskFactor {
  factor: string;
  points: number;
  detail: string;
}

export interface Copilot {
  questions_to_ask: string[];
  documents_to_request: string[];
  verification_actions: string[];
}

export interface Case {
  id: number;
  name: string;
  city: string;
  state: string;
  zip: string;
  household_size: number;
  composition: string;
  reported_benefit: number;
  qc_benefit: number;
  max_benefit: number;
  gross_income: number;
  net_income: number;
  cert_months: number;
  months_since_cert: number;
  employer: string;
  race: string;
  age: number;
  sex: string;
  expedited: boolean;
  allotment_adj: string;
  adj_amount: number;
  poverty_pct: number;
  income_source: string;
  work_status: string;
  warning_1: string | null;
  warning_2: string | null;
  risk_score: number;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  risk_flags: string[];
  risk_factors: RiskFactor[];
  error_amount: number;
  error_type: string;
  copilot: Copilot;
  status: 'pending' | 'reviewed' | 'resolved';
}

export interface DocumentDiscrepancy {
  field: string;
  document: string;
  record: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  detail: string;
}

export interface ExtractedFields {
  document_type: string;
  employer_name: string | null;
  employee_name: string | null;
  pay_frequency: string | null;
  gross_pay_per_period: number | null;
  gross_monthly_income: number | null;
  pay_date: string | null;
  address: string | null;
  city: string | null;
  monthly_rent: number | null;
  utilities_included: boolean | null;
  notes: string | null;
}

export interface DocumentAnalysis {
  filename: string;
  document_type: string;
  extracted: ExtractedFields;
  discrepancies: DocumentDiscrepancy[];
  match_count: number;
}

export interface CaseListResponse {
  total: number;
  page: number;
  page_size: number;
  pages: number;
  cases: Case[];
}

export interface OverviewMetrics {
  total_cases: number;
  high_risk: number;
  medium_risk: number;
  low_risk: number;
  total_exposure_dollars: number;
  avg_error_dollars: number;
  flagged_cases: number;
  reviewed_cases: number;
  error_rate_pct: number;
  cases_needing_review: number;
  hm_exposure_dollars: number;
  penalty_savings_potential: number;
  penalty_additional_risk: number;
}

export interface SchemaColumn {
  column: string;
  type: 'STRING' | 'LONG' | 'INT' | 'DOUBLE' | 'DATE' | 'BOOLEAN' | 'TIMESTAMP' | 'ARRAY';
  description: string;
}

export interface DataSource {
  id: string;
  name: string;
  domain: string;
  system: string;
  description: string;
  cadence: string;
  layer?: 'bronze' | 'silver' | 'gold';
  schema?: SchemaColumn[];
  sources?: string[];   // for silver/gold: which bronze tables feed this
}

export interface UseCase {
  id: string;
  title: string;
  description: string;
  analytical_question: string;
}

export interface BrandingConfig {
  agency_name: string;
  program_name: string;
  state: string;
  accent_color: string;
  tagline: string;
  footer_alert: string;
}

export interface AppConfig extends BrandingConfig {
  data_sources: DataSource[];
  use_cases: UseCase[];
}

export const api = {
  cases: {
    list: (params: Record<string, string | number | undefined> = {}): Promise<CaseListResponse> => {
      const q = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== '') q.set(k, String(v));
      }
      return fetchJson(`/cases?${q}`);
    },
    get: (id: number): Promise<Case> => fetchJson(`/cases/${id}`),
    updateStatus: (id: number, status: string) =>
      fetchJson(`/cases/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      }),
  },
  metrics: {
    overview: (): Promise<OverviewMetrics> => fetchJson('/metrics/overview'),
    errorTypes: () => fetchJson('/metrics/error-types'),
    trend: () => fetchJson('/metrics/trend'),
    cities: () => fetchJson('/metrics/cities'),
  },
  documents: {
    analyze: async (caseId: number, file: File): Promise<DocumentAnalysis> => {
      const form = new FormData();
      form.append('file', file);
      const r = await fetch(`${BASE}/cases/${caseId}/analyze-document`, { method: 'POST', body: form });
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      return r.json();
    },
  },
  checklist: {
    get: (caseId: number): Promise<{ items: Record<string, { done: boolean; note: string }> }> =>
      fetchJson(`/cases/${caseId}/checklist`),
    save: (caseId: number, itemKey: string, done: boolean, note: string) =>
      fetchJson(`/cases/${caseId}/checklist`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_key: itemKey, done, note }),
      }),
  },
  chat: {
    send: async (message: string, caseId?: number, history: Array<{ role: string; content: string }> = []) => {
      const r = await fetch(BASE + '/chat/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, case_id: caseId, history }),
      });
      return r;
    },
  },
  settings: {
    getConfig: (): Promise<AppConfig> => fetchJson('/settings/config'),
    saveConfig: (data: AppConfig): Promise<AppConfig> =>
      fetchJson('/settings/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
  },
};

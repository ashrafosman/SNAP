import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Filter, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import SeverityBadge from '../components/SeverityBadge';
import { api, type Case, type CaseListResponse } from '../lib/api';

const STATUS_STYLES: Record<string, string> = {
  pending: 'text-[#4a5260]',
  reviewed: 'text-amber-600',
  resolved: 'text-green-600',
};

export default function CaseQueue() {
  const navigate = useNavigate();
  const [data, setData] = useState<CaseListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [severity, setSeverity] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(() => {
    setLoading(true);
    api.cases.list({ search: search || undefined, severity: severity || undefined, status: status || undefined, page, page_size: 50 })
      .then(setData)
      .finally(() => setLoading(false));
  }, [search, severity, status, page]);

  useEffect(() => { load(); }, [load]);

  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); setPage(1); load(); };

  return (
    <div className="p-8 max-w-[1400px]">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Case Review Queue</h1>
        <p className="text-sm text-[#4a5260] mt-1">Cases ranked by risk score — review HIGH and MEDIUM priority first</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <form onSubmit={handleSearch} className="flex gap-2 flex-1 min-w-[240px]">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#4a5260]" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, city, error type..."
              className="w-full bg-white border border-[#D7D7D7] rounded-lg pl-9 pr-4 py-2 text-sm text-[#1f2937] placeholder:text-[#9ca3af] focus:outline-none focus:border-[#2e4e84]"
            />
          </div>
          <button type="submit" className="bg-[#2e4e84] hover:bg-[#022569] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            Search
          </button>
        </form>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-[#4a5260]" />
          <select
            value={severity}
            onChange={e => { setSeverity(e.target.value); setPage(1); }}
            className="bg-white border border-[#D7D7D7] rounded-lg px-3 py-2 text-sm text-[#1f2937] focus:outline-none focus:border-[#2e4e84]"
          >
            <option value="">All Severities</option>
            <option value="HIGH">High Risk</option>
            <option value="MEDIUM">Medium Risk</option>
            <option value="LOW">Low Risk</option>
          </select>
          <select
            value={status}
            onChange={e => { setStatus(e.target.value); setPage(1); }}
            className="bg-white border border-[#D7D7D7] rounded-lg px-3 py-2 text-sm text-[#1f2937] focus:outline-none focus:border-[#2e4e84]"
          >
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="reviewed">Reviewed</option>
            <option value="resolved">Resolved</option>
          </select>
        </div>
      </div>

      {/* Summary bar */}
      {data && (
        <div className="flex items-center gap-4 mb-4 text-xs text-[#4a5260]">
          <span>{data.total} cases</span>
          <span>·</span>
          <span>Page {data.page} of {data.pages}</span>
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-[#D7D7D7] rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <AlertTriangle className="w-5 h-5 text-[#2e4e84] animate-pulse mr-2" />
            <span className="text-[#4a5260] text-sm">Loading cases...</span>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#D7D7D7]">
                {['ID', 'Household', 'City', 'Risk', 'Severity', 'Error Type', 'Reported Benefit', 'QC Benefit', '$ Error', 'Status'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-[#4a5260] uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data?.cases.map((c: Case) => (
                <tr
                  key={c.id}
                  onClick={() => navigate(`/cases/${c.id}`)}
                  className={`border-b border-[#efefef] hover:bg-[#eaf0f9] cursor-pointer transition-colors ${c.severity === 'HIGH' ? 'hover:bg-red-500/5' : ''}`}
                >
                  <td className="px-4 py-3 font-mono text-xs text-[#4a5260]">#{c.id}</td>
                  <td className="px-4 py-3 font-medium text-[#1f2937]">{c.name}</td>
                  <td className="px-4 py-3 text-[#4a5260]">{c.city}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-1.5 rounded-full bg-[#e5e7eb] overflow-hidden">
                        <div
                          className={`h-full rounded-full ${c.risk_score >= 60 ? 'bg-red-500' : c.risk_score >= 30 ? 'bg-amber-500' : 'bg-[#2e4e84]'}`}
                          style={{ width: `${c.risk_score}%` }}
                        />
                      </div>
                      <span className="text-xs text-[#4a5260]">{c.risk_score}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3"><SeverityBadge severity={c.severity} /></td>
                  <td className="px-4 py-3 text-xs text-[#4a5260] max-w-[160px] truncate">{c.error_type}</td>
                  <td className="px-4 py-3 text-right font-mono text-xs">${c.reported_benefit.toFixed(0)}</td>
                  <td className="px-4 py-3 text-right font-mono text-xs">${c.qc_benefit.toFixed(0)}</td>
                  <td className={`px-4 py-3 text-right font-mono text-xs font-semibold ${c.error_amount > 0 ? 'text-red-400' : 'text-[#4a5260]'}`}>
                    {c.error_amount > 0 ? `$${c.error_amount.toFixed(0)}` : '—'}
                  </td>
                  <td className={`px-4 py-3 text-xs capitalize font-medium ${STATUS_STYLES[c.status]}`}>{c.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {data && data.pages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="p-2 rounded-lg border border-[#D7D7D7] text-[#4a5260] hover:text-[#2e4e84] hover:border-[#2e4e84] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm text-[#4a5260]">{page} / {data.pages}</span>
          <button
            onClick={() => setPage(p => Math.min(data.pages, p + 1))}
            disabled={page === data.pages}
            className="p-2 rounded-lg border border-[#D7D7D7] text-[#4a5260] hover:text-[#2e4e84] hover:border-[#2e4e84] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, AlertTriangle, CheckCircle2, Clock, Send, Bot,
  MessageSquare, ClipboardList, FileText, Zap, Upload, AlertCircle,
  ChevronDown, ChevronRight, StickyNote,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import SeverityBadge from '../components/SeverityBadge';
import { api, type Case, type DocumentAnalysis } from '../lib/api';

interface Message { role: 'user' | 'assistant'; content: string; }
type RightTab = 'copilot' | 'chat' | 'docs';

export default function CaseDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [caseData, setCase] = useState<Case | null>(null);
  const [loading, setLoading] = useState(true);
  const [rightTab, setRightTab] = useState<RightTab>('copilot');

  // Chat state
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Copilot checklist state: { "questions-0": { done: true, note: "..." }, ... }
  const [checklist, setChecklist] = useState<Record<string, { done: boolean; note: string }>>({});
  const [expandedNote, setExpandedNote] = useState<string | null>(null);
  const noteTimerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const saveItem = useCallback((caseId: number, key: string, done: boolean, note: string) => {
    api.checklist.save(caseId, key, done, note).catch(() => {});
  }, []);

  const toggleDone = useCallback((key: string) => {
    setChecklist(prev => {
      const updated = { ...prev, [key]: { done: !prev[key]?.done, note: prev[key]?.note || '' } };
      if (caseData) saveItem(caseData.id, key, updated[key].done, updated[key].note);
      return updated;
    });
  }, [caseData, saveItem]);

  const setNote = useCallback((key: string, note: string) => {
    setChecklist(prev => {
      const updated = { ...prev, [key]: { ...prev[key], done: prev[key]?.done || false, note } };
      // Debounce save for notes
      if (noteTimerRef.current[key]) clearTimeout(noteTimerRef.current[key]);
      noteTimerRef.current[key] = setTimeout(() => {
        if (caseData) saveItem(caseData.id, key, updated[key].done, updated[key].note);
      }, 500);
      return updated;
    });
  }, [caseData, saveItem]);

  // Document upload state
  const [docResult, setDocResult] = useState<DocumentAnalysis | null>(null);
  const [docLoading, setDocLoading] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!id) return;
    const caseId = Number(id);
    api.cases.get(caseId).then(c => {
      setCase(c);
      // Load persisted checklist
      api.checklist.get(caseId).then(res => setChecklist(res.items)).catch(() => {});
    }).finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleStatusChange = async (status: string) => {
    if (!caseData) return;
    await api.cases.updateStatus(caseData.id, status);
    setCase(prev => prev ? { ...prev, status: status as Case['status'] } : prev);
  };

  const sendMessage = async (text: string = input) => {
    if (!text.trim() || streaming) return;
    setRightTab('chat');
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setStreaming(true);
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    try {
      const res = await api.chat.send(text, caseData?.id, messages.slice(-6));
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6);
          if (payload === '[DONE]') break;
          try {
            const { content } = JSON.parse(payload);
            setMessages(prev => {
              const u = [...prev];
              u[u.length - 1] = { ...u[u.length - 1], content: u[u.length - 1].content + content };
              return u;
            });
          } catch {}
        }
      }
    } catch {
      setMessages(prev => {
        const u = [...prev];
        u[u.length - 1].content = 'Error connecting to AI assistant.';
        return u;
      });
    } finally {
      setStreaming(false);
    }
  };

  const handleFile = useCallback(async (file: File) => {
    if (!caseData) return;
    setDocResult(null);
    setDocError(null);
    setDocLoading(true);
    setRightTab('docs');
    try {
      const result = await api.documents.analyze(caseData.id, file);
      setDocResult(result);
    } catch (e: any) {
      setDocError(e?.message || 'Document analysis failed');
    } finally {
      setDocLoading(false);
    }
  }, [caseData]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  if (loading) return <div className="flex items-center justify-center h-full"><span className="text-[#71717a] text-sm">Loading case...</span></div>;
  if (!caseData) return <div className="flex items-center justify-center h-full"><span className="text-[#71717a] text-sm">Case not found</span></div>;

  const c = caseData;
  const errorDelta = c.qc_benefit - c.reported_benefit;
  const maxScore = c.risk_factors.reduce((s, f) => s + f.points, 0) || 1;

  return (
    <div className="p-8 max-w-[1400px]">
      {/* Back */}
      <button onClick={() => navigate('/queue')} className="flex items-center gap-1.5 text-[#71717a] hover:text-white text-sm mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to queue
      </button>

      {/* Header */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{c.name}</h1>
            <SeverityBadge severity={c.severity} />
            <span className="text-[#52525b] text-sm font-mono">Risk {c.risk_score}/100</span>
          </div>
          <p className="text-sm text-[#71717a] mt-1">Case #{c.id} · {c.city}, {c.state} {c.zip} · {c.error_type}</p>
        </div>
        <div className="flex gap-2">
          {(['pending', 'reviewed', 'resolved'] as const).map(s => (
            <button
              key={s}
              onClick={() => handleStatusChange(s)}
              className={`px-4 py-2 rounded-lg text-xs font-semibold border transition-colors capitalize ${
                c.status === s
                  ? s === 'resolved' ? 'bg-green-500/20 border-green-500/40 text-green-300'
                    : s === 'reviewed' ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                    : 'bg-[#1e1e2a] border-[#6366f1]/40 text-[#6366f1]'
                  : 'bg-transparent border-[#27272a] text-[#71717a] hover:border-[#52525b]'
              }`}
            >
              {s === 'pending' && <Clock className="w-3 h-3 inline mr-1" />}
              {s === 'reviewed' && <AlertTriangle className="w-3 h-3 inline mr-1" />}
              {s === 'resolved' && <CheckCircle2 className="w-3 h-3 inline mr-1" />}
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* LEFT — case facts */}
        <div className="lg:col-span-3 space-y-5">

          {/* Risk Factor Score Breakdown */}
          <div className="bg-[#16161e] border border-[#27272a] rounded-xl p-5">
            <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              Risk Score Breakdown
              <span className="ml-auto text-xs font-mono text-[#71717a]">{c.risk_score}/100</span>
            </h3>

            {/* Score bar */}
            <div className="mb-5">
              <div className="w-full h-2 rounded-full bg-[#27272a] overflow-hidden mb-1">
                <div
                  className={`h-full rounded-full transition-all ${c.risk_score >= 60 ? 'bg-red-500' : c.risk_score >= 30 ? 'bg-amber-500' : 'bg-[#6366f1]'}`}
                  style={{ width: `${c.risk_score}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-[#52525b]">
                <span>0 — Low</span><span>30 — Medium</span><span>60 — High</span><span>100</span>
              </div>
            </div>

            {/* Factor table */}
            <div className="space-y-3">
              {c.risk_factors.map((f, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="shrink-0 w-10 text-right">
                    <span className={`text-sm font-bold ${f.points >= 20 ? 'text-red-400' : f.points >= 10 ? 'text-amber-400' : 'text-[#71717a]'}`}>
                      +{f.points}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-semibold text-white">{f.factor}</span>
                    </div>
                    <div className="w-full h-1 rounded-full bg-[#27272a] mb-1">
                      <div
                        className={`h-full rounded-full ${f.points >= 20 ? 'bg-red-500/60' : f.points >= 10 ? 'bg-amber-500/60' : 'bg-[#6366f1]/60'}`}
                        style={{ width: `${(f.points / maxScore) * 100}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-[#71717a] leading-relaxed">{f.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Benefit Analysis */}
          <div className="bg-[#16161e] border border-[#27272a] rounded-xl p-5">
            <h3 className="text-sm font-semibold mb-4">Benefit Analysis</h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <p className="text-xs text-[#71717a] mb-1">Reported Benefit</p>
                <p className="text-xl font-bold text-white">${c.reported_benefit.toFixed(0)}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-[#71717a] mb-1">QC Corrected</p>
                <p className="text-xl font-bold text-white">${c.qc_benefit.toFixed(0)}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-[#71717a] mb-1">Difference</p>
                <p className={`text-xl font-bold ${errorDelta > 0 ? 'text-green-400' : errorDelta < 0 ? 'text-red-400' : 'text-[#71717a]'}`}>
                  {errorDelta === 0 ? '—' : `${errorDelta > 0 ? '+' : ''}$${errorDelta.toFixed(0)}`}
                </p>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-[#27272a] grid grid-cols-2 gap-3 text-xs">
              <div><span className="text-[#71717a]">Max Benefit:</span> <span className="font-medium ml-1">${c.max_benefit.toFixed(0)}</span></div>
              <div><span className="text-[#71717a]">Allotment Adj:</span> <span className="font-medium ml-1">{c.allotment_adj}</span></div>
            </div>
          </div>

          {/* Household + Income */}
          <div className="grid grid-cols-2 gap-5">
            <div className="bg-[#16161e] border border-[#27272a] rounded-xl p-5">
              <h3 className="text-sm font-semibold mb-3">Household</h3>
              <div className="space-y-2 text-xs">
                {[
                  ['Size', c.household_size],
                  ['Composition', c.composition],
                  ['Age (HH head)', c.age],
                  ['Sex', c.sex],
                  ['Race', c.race],
                  ['Cert. months', c.cert_months],
                  ['Expedited', c.expedited ? 'Yes ⚠' : 'No'],
                ].map(([l, v]) => (
                  <div key={String(l)} className="flex justify-between gap-2">
                    <span className="text-[#71717a]">{l}</span>
                    <span className="font-medium text-right">{v}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-[#16161e] border border-[#27272a] rounded-xl p-5">
              <h3 className="text-sm font-semibold mb-3">Income</h3>
              <div className="space-y-2 text-xs">
                {[
                  ['Gross/mo', `$${c.gross_income.toFixed(0)}`],
                  ['Net/mo', `$${c.net_income.toFixed(0)}`],
                  ['FPL %', `${c.poverty_pct.toFixed(0)}%`],
                  ['Source', c.income_source],
                  ['Work status', c.work_status],
                  ['Employer', c.employer || 'N/A'],
                ].map(([l, v]) => (
                  <div key={String(l)} className="flex justify-between gap-2">
                    <span className="text-[#71717a] shrink-0">{l}</span>
                    <span className="font-medium text-right truncate">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT — Copilot + Chat + Docs */}
        <div className="lg:col-span-2 flex flex-col">
          <div className="bg-[#16161e] border border-[#27272a] rounded-xl flex flex-col" style={{ minHeight: 640 }}>

            {/* Tabs */}
            <div className="flex border-b border-[#27272a]">
              <button
                onClick={() => setRightTab('copilot')}
                className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold border-b-2 transition-colors ${
                  rightTab === 'copilot' ? 'border-[#6366f1] text-white' : 'border-transparent text-[#71717a] hover:text-white'
                }`}
              >
                <ClipboardList className="w-3.5 h-3.5" />
                Copilot
              </button>
              <button
                onClick={() => setRightTab('docs')}
                className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold border-b-2 transition-colors ${
                  rightTab === 'docs' ? 'border-[#6366f1] text-white' : 'border-transparent text-[#71717a] hover:text-white'
                }`}
              >
                <Upload className="w-3.5 h-3.5" />
                Documents
                {docResult && docResult.match_count > 0 && (
                  <span className="ml-1 w-4 h-4 rounded-full bg-red-500 text-[9px] flex items-center justify-center text-white">
                    {docResult.match_count}
                  </span>
                )}
              </button>
              <button
                onClick={() => setRightTab('chat')}
                className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold border-b-2 transition-colors ${
                  rightTab === 'chat' ? 'border-[#6366f1] text-white' : 'border-transparent text-[#71717a] hover:text-white'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                AI Chat
                {messages.length > 0 && (
                  <span className="ml-1 w-4 h-4 rounded-full bg-[#6366f1] text-[9px] flex items-center justify-center text-white">
                    {messages.filter(m => m.role === 'user').length}
                  </span>
                )}
              </button>
            </div>

            {/* COPILOT TAB */}
            {rightTab === 'copilot' && (
              <div className="flex-1 overflow-y-auto p-4 space-y-5">
                {/* Progress bar */}
                {(() => {
                  const totalItems = c.copilot.questions_to_ask.length + c.copilot.verification_actions.length;
                  const doneItems = Object.values(checklist).filter(v => v.done).length;
                  const pct = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0;
                  return (
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-1.5 bg-[#27272a] rounded-full overflow-hidden">
                        <div className="h-full bg-[#6366f1] rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-[#71717a] shrink-0">{doneItems}/{totalItems} done</span>
                    </div>
                  );
                })()}

                <div>
                  <h4 className="text-xs font-semibold text-[#a1a1aa] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-[#6366f1]" />
                    Questions to Ask Applicant
                  </h4>
                  <div className="space-y-2">
                    {c.copilot.questions_to_ask.map((q: string, i: number) => {
                      const key = `questions-${i}`;
                      const item = checklist[key] || { done: false, note: '' };
                      const noteOpen = expandedNote === key;
                      return (
                        <div key={key} className={`rounded-lg border transition-colors ${item.done ? 'bg-[#1a1a26]/50 border-[#6366f1]/10' : 'bg-[#1a1a26] border-[#6366f1]/20'}`}>
                          <div className="flex items-start gap-2.5 p-3">
                            <button onClick={() => toggleDone(key)} className="shrink-0 mt-0.5">
                              <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${item.done ? 'bg-[#6366f1] border-[#6366f1]' : 'border-[#52525b] hover:border-[#6366f1]'}`}>
                                {item.done && <CheckCircle2 className="w-3 h-3 text-white" />}
                              </div>
                            </button>
                            <p className={`text-xs leading-relaxed flex-1 ${item.done ? 'text-[#71717a] line-through' : 'text-[#d4d4d8]'}`}>{q}</p>
                            <button
                              onClick={() => setExpandedNote(noteOpen ? null : key)}
                              className="shrink-0 mt-0.5 text-[#52525b] hover:text-[#a1a1aa] transition-colors"
                              title="Add notes"
                            >
                              {item.note ? <StickyNote className="w-3.5 h-3.5 text-[#6366f1]" /> : noteOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                          {noteOpen && (
                            <div className="px-3 pb-3 pl-9">
                              <textarea
                                value={item.note}
                                onChange={e => setNote(key, e.target.value)}
                                placeholder="Add notes..."
                                rows={2}
                                className="w-full bg-[#0f0f13] border border-[#27272a] rounded-lg px-3 py-2 text-xs text-[#d4d4d8] placeholder:text-[#52525b] focus:outline-none focus:border-[#6366f1] resize-none"
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-semibold text-[#a1a1aa] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-amber-400" />
                    Documents to Request
                  </h4>
                  <div className="space-y-2">
                    {c.copilot.documents_to_request.map((d: string, i: number) => (
                      <div key={i} className="flex items-start gap-2.5 bg-[#1e1a14] border border-amber-500/20 rounded-lg p-3">
                        <span className="text-amber-400 text-xs shrink-0 mt-0.5">📄</span>
                        <p className="text-xs text-[#d4d4d8] leading-relaxed">{d}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-semibold text-[#a1a1aa] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                    Verification Actions
                  </h4>
                  <div className="space-y-2">
                    {c.copilot.verification_actions.map((a: string, i: number) => {
                      const key = `verify-${i}`;
                      const item = checklist[key] || { done: false, note: '' };
                      const noteOpen = expandedNote === key;
                      return (
                        <div key={key} className={`rounded-lg border transition-colors ${item.done ? 'bg-[#141e18]/50 border-green-500/10' : 'bg-[#141e18] border-green-500/20'}`}>
                          <div className="flex items-start gap-2.5 p-3">
                            <button onClick={() => toggleDone(key)} className="shrink-0 mt-0.5">
                              <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${item.done ? 'bg-green-500 border-green-500' : 'border-[#52525b] hover:border-green-400'}`}>
                                {item.done && <CheckCircle2 className="w-3 h-3 text-white" />}
                              </div>
                            </button>
                            <p className={`text-xs leading-relaxed flex-1 ${item.done ? 'text-[#71717a] line-through' : 'text-[#d4d4d8]'}`}>{a}</p>
                            <button
                              onClick={() => setExpandedNote(noteOpen ? null : key)}
                              className="shrink-0 mt-0.5 text-[#52525b] hover:text-[#a1a1aa] transition-colors"
                              title="Add notes"
                            >
                              {item.note ? <StickyNote className="w-3.5 h-3.5 text-green-400" /> : noteOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                          {noteOpen && (
                            <div className="px-3 pb-3 pl-9">
                              <textarea
                                value={item.note}
                                onChange={e => setNote(key, e.target.value)}
                                placeholder="Add notes..."
                                rows={2}
                                className="w-full bg-[#0f0f13] border border-[#27272a] rounded-lg px-3 py-2 text-xs text-[#d4d4d8] placeholder:text-[#52525b] focus:outline-none focus:border-[#6366f1] resize-none"
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setRightTab('docs')}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border border-amber-500/30 text-xs text-amber-400 hover:bg-amber-500/10 transition-colors"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Upload a document →
                  </button>
                  <button
                    onClick={() => sendMessage(`Explain the risk factors for this case and what the caseworker should focus on first.`)}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border border-[#6366f1]/30 text-xs text-[#6366f1] hover:bg-[#6366f1]/10 transition-colors"
                  >
                    <Bot className="w-3.5 h-3.5" />
                    AI analysis →
                  </button>
                </div>
              </div>
            )}

            {/* DOCUMENTS TAB */}
            {rightTab === 'docs' && (
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* Drop zone */}
                <div
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={onDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                    dragOver
                      ? 'border-[#6366f1] bg-[#6366f1]/10'
                      : 'border-[#27272a] hover:border-[#6366f1]/50 hover:bg-[#6366f1]/5'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept=".pdf,.png,.jpg,.jpeg,.webp,.txt"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                  />
                  <Upload className={`w-8 h-8 mx-auto mb-2 ${dragOver ? 'text-[#6366f1]' : 'text-[#52525b]'}`} />
                  <p className="text-sm font-medium text-[#a1a1aa]">Drop a document to verify</p>
                  <p className="text-xs text-[#52525b] mt-1">Pay stub · W-2 · Lease · Bank statement</p>
                  <p className="text-[10px] text-[#3f3f46] mt-2">PDF, PNG, JPG, WEBP, TXT</p>
                </div>

                {/* Loading */}
                {docLoading && (
                  <div className="flex flex-col items-center gap-3 py-8">
                    <div className="w-8 h-8 rounded-full border-2 border-[#6366f1] border-t-transparent animate-spin" />
                    <p className="text-xs text-[#71717a]">Claude is reading the document...</p>
                  </div>
                )}

                {/* Error */}
                {docError && (
                  <div className="flex items-start gap-2.5 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-red-300">{docError}</p>
                  </div>
                )}

                {/* Results */}
                {docResult && !docLoading && (
                  <div className="space-y-4">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold text-white capitalize">{docResult.document_type.replace('_', ' ')}</p>
                        <p className="text-[10px] text-[#52525b] truncate">{docResult.filename}</p>
                      </div>
                      {docResult.match_count === 0
                        ? <span className="text-[10px] px-2 py-1 rounded-full bg-green-500/15 text-green-400 border border-green-500/25">✓ No discrepancies</span>
                        : <span className="text-[10px] px-2 py-1 rounded-full bg-red-500/15 text-red-400 border border-red-500/25">{docResult.match_count} discrepanc{docResult.match_count === 1 ? 'y' : 'ies'}</span>
                      }
                    </div>

                    {/* Discrepancies */}
                    {docResult.discrepancies.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-[#a1a1aa] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                          Discrepancies Found
                        </h4>
                        <div className="space-y-2">
                          {docResult.discrepancies.map((d, i) => (
                            <div key={i} className={`rounded-lg p-3 border ${
                              d.severity === 'HIGH'
                                ? 'bg-red-500/10 border-red-500/30'
                                : 'bg-amber-500/10 border-amber-500/30'
                            }`}>
                              <div className="flex items-center justify-between mb-1.5">
                                <span className="text-xs font-semibold text-white">{d.field}</span>
                                <span className={`text-[10px] font-bold ${d.severity === 'HIGH' ? 'text-red-400' : 'text-amber-400'}`}>
                                  {d.severity}
                                </span>
                              </div>
                              <div className="grid grid-cols-2 gap-2 mb-2">
                                <div className="bg-black/20 rounded p-1.5">
                                  <p className="text-[9px] text-[#71717a] uppercase mb-0.5">Document</p>
                                  <p className="text-xs font-medium text-white">{d.document}</p>
                                </div>
                                <div className="bg-black/20 rounded p-1.5">
                                  <p className="text-[9px] text-[#71717a] uppercase mb-0.5">Case Record</p>
                                  <p className="text-xs font-medium text-white">{d.record}</p>
                                </div>
                              </div>
                              <p className="text-[11px] text-[#a1a1aa] leading-relaxed">{d.detail}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Extracted fields */}
                    <div>
                      <h4 className="text-xs font-semibold text-[#a1a1aa] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-[#6366f1]" />
                        Extracted Fields
                      </h4>
                      <div className="bg-[#0f0f13] border border-[#27272a] rounded-lg p-3 space-y-1.5">
                        {[
                          ['Employee', docResult.extracted.employee_name],
                          ['Employer', docResult.extracted.employer_name],
                          ['Pay frequency', docResult.extracted.pay_frequency],
                          ['Gross/period', docResult.extracted.gross_pay_per_period != null ? `$${docResult.extracted.gross_pay_per_period.toLocaleString()}` : null],
                          ['Gross/month', docResult.extracted.gross_monthly_income != null ? `$${docResult.extracted.gross_monthly_income.toLocaleString()}` : null],
                          ['Pay date', docResult.extracted.pay_date],
                          ['Address', docResult.extracted.address],
                          ['Monthly rent', docResult.extracted.monthly_rent != null ? `$${docResult.extracted.monthly_rent.toLocaleString()}` : null],
                          ['Utilities incl.', docResult.extracted.utilities_included != null ? (docResult.extracted.utilities_included ? 'Yes' : 'No') : null],
                        ].filter(([, v]) => v != null).map(([label, value]) => (
                          <div key={String(label)} className="flex justify-between gap-2 text-xs">
                            <span className="text-[#71717a] shrink-0">{label}</span>
                            <span className="text-[#d4d4d8] text-right font-medium">{value}</span>
                          </div>
                        ))}
                        {docResult.extracted.notes && (
                          <p className="text-[11px] text-[#52525b] pt-1 border-t border-[#27272a] mt-1">{docResult.extracted.notes}</p>
                        )}
                      </div>
                    </div>

                    {/* Ask AI about document */}
                    {docResult.discrepancies.length > 0 && (
                      <button
                        onClick={() => sendMessage(
                          `I uploaded a ${docResult.document_type.replace('_', ' ')} and found ${docResult.match_count} discrepanc${docResult.match_count === 1 ? 'y' : 'ies'}: ${docResult.discrepancies.map(d => `${d.field} (document: ${d.document} vs record: ${d.record})`).join('; ')}. What are the next steps?`
                        )}
                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-[#6366f1]/30 text-xs text-[#6366f1] hover:bg-[#6366f1]/10 transition-colors"
                      >
                        <Bot className="w-3.5 h-3.5" />
                        Ask AI what to do about these discrepancies →
                      </button>
                    )}

                    {/* Re-upload */}
                    <button
                      onClick={() => { setDocResult(null); setDocError(null); fileInputRef.current?.click(); }}
                      className="w-full py-2 text-xs text-[#52525b] hover:text-[#71717a] transition-colors"
                    >
                      Upload a different document
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* CHAT TAB */}
            {rightTab === 'chat' && (
              <>
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {messages.length === 0 && (
                    <div className="space-y-2 text-xs text-[#52525b]">
                      <p className="text-[#71717a]">Quick questions:</p>
                      {[
                        'Explain the risk flags',
                        'Is this an overpayment or underpayment?',
                        'What corrective action is needed?',
                        'What 7 CFR regulation applies?',
                      ].map(q => (
                        <button key={q} onClick={() => sendMessage(q)}
                          className="block w-full text-left px-3 py-2 rounded-lg border border-[#27272a] hover:border-[#6366f1]/40 hover:text-white transition-colors">
                          {q}
                        </button>
                      ))}
                    </div>
                  )}
                  {messages.map((m, i) => (
                    <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[90%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed ${
                        m.role === 'user'
                          ? 'bg-[#6366f1]/20 text-white border border-[#6366f1]/30 whitespace-pre-wrap'
                          : 'bg-[#1e1e2a] text-[#d4d4d8] border border-[#27272a] prose prose-invert prose-xs max-w-none prose-p:my-1.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5 prose-headings:my-2 prose-pre:bg-[#0f0f13] prose-pre:border prose-pre:border-[#27272a] prose-code:text-[#a78bfa] prose-strong:text-white prose-a:text-[#6366f1] prose-table:border-collapse prose-th:border prose-th:border-[#3f3f46] prose-th:bg-[#27272a] prose-th:px-2 prose-th:py-1 prose-td:border prose-td:border-[#3f3f46] prose-td:px-2 prose-td:py-1'
                      }`}>
                        {m.role === 'assistant' && m.content
                          ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                          : m.content || <span className="opacity-50 animate-pulse">▋</span>
                        }
                      </div>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>
                <div className="border-t border-[#27272a] p-3">
                  <form onSubmit={(e) => { e.preventDefault(); sendMessage(); }} className="flex gap-2">
                    <input value={input} onChange={e => setInput(e.target.value)} disabled={streaming}
                      placeholder="Ask about this case..."
                      className="flex-1 bg-[#0f0f13] border border-[#27272a] rounded-lg px-3 py-2 text-xs text-white placeholder:text-[#52525b] focus:outline-none focus:border-[#6366f1] disabled:opacity-50" />
                    <button type="submit" disabled={streaming || !input.trim()}
                      className="bg-[#6366f1] hover:bg-[#5254cc] disabled:opacity-40 text-white p-2 rounded-lg transition-colors">
                      <Send className="w-4 h-4" />
                    </button>
                  </form>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

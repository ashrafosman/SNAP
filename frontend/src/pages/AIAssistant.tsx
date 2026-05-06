import { useEffect, useRef, useState, useCallback } from 'react';
import { Send, Bot, Sparkles } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api } from '../lib/api';

interface Message { role: 'user' | 'assistant'; content: string; }

const SUGGESTED = [
  'What are my top high risk cases?',
  'How many cases need review?',
  'What\'s my total QC exposure?',
  'Show me the error rate breakdown',
  'What does HR1 change about SNAP work requirements and ABAWD rules?',
  'How does the One Big Beautiful Bill affect SNAP utility allowances?',
];

export default function AIAssistant() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const streamingRef = useRef(false);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = useCallback(async (text: string) => {
    if (!text.trim() || streamingRef.current) return;
    streamingRef.current = true;
    setInput('');
    setStreaming(true);

    const userMsg: Message = { role: 'user', content: text };
    const assistantMsg: Message = { role: 'assistant', content: '' };

    setMessages(prev => [...prev, userMsg, assistantMsg]);

    let accumulated = '';

    try {
      const res = await api.chat.send(text, undefined, messages.slice(-6));
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
            accumulated += content;
            const snapshot = accumulated;
            setMessages(prev => {
              const updated = [...prev];
              updated[updated.length - 1] = { role: 'assistant', content: snapshot };
              return updated;
            });
          } catch {}
        }
      }
    } catch {
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: 'assistant', content: 'Error connecting to AI assistant.' };
        return updated;
      });
    } finally {
      setStreaming(false);
      streamingRef.current = false;
    }
  }, [messages]);

  return (
    <div className="flex flex-col h-screen p-8 max-w-[1000px] mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-[#2e4e84]" />
          SNAP QC AI Assistant
        </h1>
        <p className="text-sm text-[#4a5260] mt-1">
          Ask about QC regulations, error patterns, policy changes, and corrective strategies
        </p>
      </div>

      <div className="flex-1 bg-white border border-[#D7D7D7] rounded-xl flex flex-col overflow-hidden">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.length === 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Bot className="w-5 h-5 text-[#2e4e84]" />
                <span className="text-sm text-[#4a5260]">Suggested questions:</span>
              </div>
              <div className="space-y-2">
                {SUGGESTED.map(q => (
                  <button
                    key={q}
                    onClick={() => send(q)}
                    className="block w-full text-left px-4 py-3 rounded-lg border border-[#D7D7D7] text-sm text-[#4a5260] hover:border-[#2e4e84] hover:bg-[#eaf0f9] hover:text-[#022569] transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {m.role === 'assistant' && (
                <div className="w-7 h-7 rounded-full bg-[#2e4e84]/10 border border-[#2e4e84]/30 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="w-3.5 h-3.5 text-[#2e4e84]" />
                </div>
              )}
              <div className={`max-w-[80%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
                m.role === 'user'
                  ? 'bg-[#2e4e84] text-white border border-[#2e4e84] whitespace-pre-wrap'
                  : 'bg-white text-[#1f2330] border border-[#D7D7D7] prose prose-slate prose-sm max-w-none prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-headings:my-3 prose-pre:bg-[#F4F4F4] prose-pre:border prose-pre:border-[#D7D7D7] prose-code:text-[#2e4e84] prose-strong:text-[#022569] prose-a:text-[#2e4e84] prose-table:border-collapse prose-th:border prose-th:border-[#D7D7D7] prose-th:bg-[#efefef] prose-th:px-3 prose-th:py-1.5 prose-td:border prose-td:border-[#D7D7D7] prose-td:px-3 prose-td:py-1.5'
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

        {/* Input */}
        <div className="border-t border-[#D7D7D7] p-4">
          <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex gap-3">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              disabled={streaming}
              placeholder="Ask about SNAP QC policy, error patterns, HR1 provisions, or case strategies..."
              className="flex-1 bg-[#F4F4F4] border border-[#D7D7D7] rounded-xl px-4 py-3 text-sm text-[#1f2330] placeholder:text-[#9ca3af] focus:outline-none focus:border-[#2e4e84] disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={streaming || !input.trim()}
              className="bg-[#2e4e84] hover:bg-[#022569] disabled:opacity-40 text-white px-5 py-3 rounded-xl transition-colors flex items-center gap-2"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

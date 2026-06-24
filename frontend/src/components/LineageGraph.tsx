type LayerKey = 'source' | 'bronze' | 'silver' | 'gold';

interface LNode {
  id: string;
  x: number;
  y: number;
  label: string;
  sub: string;
  layer: LayerKey;
}

const NW = 150; // node width
const NH = 40;  // node height

/* 6 bronze rows, evenly spaced ── viewBox 880 × 370 ───────── */
const ROW6 = [24, 86, 148, 210, 272, 334]; // y positions for 6 bronze rows

/* Silver/gold: centred between pairs of bronze rows */
const midY = (r1: number, r2: number) => (r1 + NH / 2 + r2 + NH / 2) / 2 - NH / 2;
const S_Y = [midY(ROW6[0], ROW6[1]), midY(ROW6[2], ROW6[3]), midY(ROW6[4], ROW6[5])];

const NODES: LNode[] = [
  // Sources — one per Bronze feed (x=0)
  { id: 'src_snap',  x: 0, y: ROW6[0], label: 'State SNAP System',  sub: 'DCF eligibility records',  layer: 'source' },
  { id: 'src_adt',   x: 0, y: ROW6[1], label: 'Hospital ADT Feed',  sub: 'discharge events',          layer: 'source' },
  { id: 'src_ehr',   x: 0, y: ROW6[2], label: 'KDHE EHR System',    sub: 'clinical diagnoses',        layer: 'source' },
  { id: 'src_med',   x: 0, y: ROW6[3], label: 'State Medicaid',      sub: 'enrollment records',        layer: 'source' },
  { id: 'src_sdoh',  x: 0, y: ROW6[4], label: 'Care Coordination',   sub: 'SDOH / PRAPARE',            layer: 'source' },
  { id: 'src_vital', x: 0, y: ROW6[5], label: 'State Vital Records', sub: 'births + deaths',           layer: 'source' },

  // Bronze (x=208) — mirror the catalog cards
  { id: 'b_snap',  x: 208, y: ROW6[0], label: 'snap_eligibility',      sub: 'auto loader · monthly',  layer: 'bronze' },
  { id: 'b_adt',   x: 208, y: ROW6[1], label: 'adt_encounters',         sub: 'hospital feed · daily',  layer: 'bronze' },
  { id: 'b_ehr',   x: 208, y: ROW6[2], label: 'ehr_clinical_diagnoses', sub: 'raw clinical · weekly',  layer: 'bronze' },
  { id: 'b_med',   x: 208, y: ROW6[3], label: 'medicaid_enrollment',    sub: 'monthly extract',        layer: 'bronze' },
  { id: 'b_sdoh',  x: 208, y: ROW6[4], label: 'prapare_sdoh_assess',    sub: 'ongoing assessments',    layer: 'bronze' },
  { id: 'b_vital', x: 208, y: ROW6[5], label: 'vital_records',          sub: 'births + deaths',        layer: 'bronze' },

  // Silver (x=462)
  { id: 's_linked', x: 462, y: S_Y[0], label: 'silver_snap_linked', sub: 'entity-resolved',  layer: 'silver' },
  { id: 's_hh',     x: 462, y: S_Y[1], label: 'silver_household',   sub: 'HH profiles',      layer: 'silver' },
  { id: 's_clin',   x: 462, y: S_Y[2], label: 'silver_clinical',    sub: 'disability flags', layer: 'silver' },

  // Gold (x=714)
  { id: 'g_scores', x: 714, y: S_Y[0], label: 'gold_qc_scores',    sub: 'case scoring',      layer: 'gold' },
  { id: 'g_sigs',   x: 714, y: S_Y[1], label: 'gold_cross_signals', sub: 'anomaly detection', layer: 'gold' },
  { id: 'g_ded',    x: 714, y: S_Y[2], label: 'gold_deductions',    sub: 'missed deductions', layer: 'gold' },
];

const EDGES: [string, string][] = [
  // source → bronze (1-to-1)
  ['src_snap', 'b_snap'], ['src_adt', 'b_adt'], ['src_ehr', 'b_ehr'],
  ['src_med', 'b_med'], ['src_sdoh', 'b_sdoh'], ['src_vital', 'b_vital'],
  // bronze → silver (per app_config sources fields)
  ['b_snap',  's_linked'], ['b_snap', 's_hh'],
  ['b_adt',   's_linked'], ['b_adt',  's_hh'],
  ['b_ehr',   's_clin'],
  ['b_med',   's_linked'], ['b_med',  's_clin'],
  ['b_sdoh',  's_linked'],
  ['b_vital', 's_linked'],
  // silver → gold
  ['s_linked', 'g_scores'], ['s_linked', 'g_sigs'],
  ['s_hh',     'g_scores'], ['s_hh',     'g_ded'],
  ['s_clin',   'g_scores'], ['s_clin',   'g_ded'],
];

const COL_HEADERS = [
  { label: 'SOURCES', x: 0,   color: '#9ca3af' },
  { label: 'BRONZE',  x: 208, color: '#92400e' },
  { label: 'SILVER',  x: 462, color: '#64748b' },
  { label: 'GOLD',    x: 714, color: '#b45309' },
];

const LAYER_STYLE: Record<LayerKey, { border: string; bg: string; text: string; sub: string; shadow?: string }> = {
  source: { border: '#d1d5db', bg: '#f9fafb', text: '#374151', sub: '#9ca3af' },
  bronze: { border: '#fcd34d', bg: '#fefce8', text: '#92400e', sub: '#b45309' },
  silver: { border: '#cbd5e1', bg: '#f8fafc', text: '#1e293b', sub: '#64748b' },
  gold:   { border: '#f1ad02', bg: '#fffdf0', text: '#022569', sub: '#92400e', shadow: '0 0 0 2px #f1ad0222' },
};

const VH = 370; // viewBox height

function bezier(from: LNode, to: LNode): string {
  const x1 = from.x + NW, y1 = from.y + NH / 2;
  const x2 = to.x,         y2 = to.y + NH / 2;
  const c  = (x2 - x1) * 0.45;
  return `M ${x1} ${y1} C ${x1 + c} ${y1}, ${x2 - c} ${y2}, ${x2} ${y2}`;
}

export function LineageGraph() {
  const nodeMap = Object.fromEntries(NODES.map(n => [n.id, n]));

  return (
    <>
      <style>{`
        @keyframes dash-flow {
          to { stroke-dashoffset: -14; }
        }
        .lg-gold-edge {
          stroke-dasharray: 7 7;
          animation: dash-flow 1.4s linear infinite;
        }
        .lg-gray-edge {
          stroke-dasharray: 6 8;
          animation: dash-flow 2.2s linear infinite;
        }
      `}</style>

      <div
        className="relative mb-6 rounded-2xl overflow-hidden border border-[#e5e7eb]"
        style={{ height: VH, background: 'linear-gradient(108deg, #f8fafc 0%, #f0f4fb 100%)' }}
      >
        {/* Column headers */}
        {COL_HEADERS.map(h => (
          <div
            key={h.label}
            className="absolute text-[9.5px] font-black uppercase tracking-[.14em]"
            style={{ left: h.x + 4, top: 6, color: h.color }}
          >
            {h.label}
          </div>
        ))}

        {/* SVG edges */}
        <svg
          className="absolute inset-0 pointer-events-none"
          viewBox={`0 0 880 ${VH}`}
          style={{ width: '100%', height: '100%' }}
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <marker id="dot-gold" markerWidth="7" markerHeight="7" refX="3.5" refY="3.5">
              <circle cx="3.5" cy="3.5" r="3" fill="#f1ad02" />
            </marker>
            <marker id="dot-gray" markerWidth="5" markerHeight="5" refX="2.5" refY="2.5">
              <circle cx="2.5" cy="2.5" r="2" fill="#bcc9d7" />
            </marker>
          </defs>

          {EDGES.map(([fId, tId], i) => {
            const from = nodeMap[fId];
            const to   = nodeMap[tId];
            if (!from || !to) return null;
            const isGold = to.layer === 'gold';
            const d = bezier(from, to);
            return isGold ? (
              <path
                key={`${fId}-${tId}`}
                d={d}
                fill="none"
                stroke="#f1ad02"
                strokeWidth={1.8}
                strokeLinecap="round"
                markerEnd="url(#dot-gold)"
                className="lg-gold-edge"
                style={{ animationDelay: `${i * 0.04}s`, opacity: 0.9 }}
              />
            ) : (
              <path
                key={`${fId}-${tId}`}
                d={d}
                fill="none"
                stroke="#bcc9d7"
                strokeWidth={1.3}
                strokeLinecap="round"
                markerEnd="url(#dot-gray)"
                className="lg-gray-edge"
                style={{ animationDelay: `${i * 0.04}s`, opacity: 0.75 }}
              />
            );
          })}
        </svg>

        {/* Nodes */}
        {NODES.map(node => {
          const s = LAYER_STYLE[node.layer];
          return (
            <div
              key={node.id}
              className="absolute flex flex-col justify-center px-3 rounded-xl"
              style={{
                left: `${(node.x / 880) * 100}%`,
                top: node.y,
                width: `${(NW / 880) * 100}%`,
                height: NH,
                background: s.bg,
                border: `1px solid ${s.border}`,
                boxShadow: s.shadow ?? '0 1px 3px rgba(0,0,0,.06)',
              }}
            >
              <div className="text-[10.5px] font-bold font-mono leading-tight truncate" style={{ color: s.text }}>
                {node.label}
              </div>
              <div className="text-[9.5px] leading-none mt-0.5 truncate" style={{ color: s.sub }}>
                {node.sub}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

import { useEffect, useState, useCallback } from 'react';
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } from 'react-simple-maps';
import { useNavigate } from 'react-router-dom';
import { MapPin, DollarSign, AlertTriangle, TrendingUp, ChevronRight, Info } from 'lucide-react';
import { api, type CityMetric } from '../lib/api';

const GEO_URL = 'https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json';

// ── City → county FIPS (all states in demo data)
const CITY_TO_FIPS: Record<string, string> = {
  // Washington State — King County
  Seattle: '53033', Bellevue: '53033', Renton: '53033', Kent: '53033',
  Kirkland: '53033', Redmond: '53033', Auburn: '53033', 'Federal Way': '53033',
  Shoreline: '53033', Burien: '53033', Bothell: '53033', Kenmore: '53033',
  // Pierce County
  Tacoma: '53053', Puyallup: '53053', Lakewood: '53053', Sumner: '53053',
  // Snohomish County
  Everett: '53061', Marysville: '53061', Lynnwood: '53061', Edmonds: '53061',
  Mukilteo: '53061', 'Mountlake Terrace': '53061',
  // Spokane County
  Spokane: '53063', 'Spokane Valley': '53063', Cheney: '53063',
  // Yakima County
  Yakima: '53077', Selah: '53077', 'Union Gap': '53077',
  // Benton County
  Kennewick: '53005', Richland: '53005', 'West Richland': '53005',
  // Franklin County
  Pasco: '53021',
  // Whatcom County
  Bellingham: '53073',
  // Clark County
  Vancouver: '53011', 'Battle Ground': '53011', Camas: '53011',
  // Thurston County
  Olympia: '53067', Lacey: '53067', Tumwater: '53067',
  // Walla Walla County
  'Walla Walla': '53071',
  // Skagit County
  'Mount Vernon': '53057', Burlington: '53057',
  // Chelan County
  Wenatchee: '53007',
  // Grant County
  'Moses Lake': '53025',
  // Kitsap County
  Bremerton: '53035', 'Port Orchard': '53035', Poulsbo: '53035',
  // Lewis County
  Centralia: '53041', Chehalis: '53041',
  // Grays Harbor County
  Aberdeen: '53027',
  // Cowlitz County
  Longview: '53015', Kelso: '53015',
  // Island County
  'Oak Harbor': '53029',
  // Clallam County
  'Port Angeles': '53009',
  // Whitman County
  Pullman: '53075',
  // Michigan — Macomb County
  Fraser: '26099', Warren: '26099', 'St. Clair Shores': '26099', Sterling: '26099',
  'Clinton Township': '26099', 'Mount Clemens': '26099',
  // Oakland County (MI Clarkston/Ferndale take precedence over WA for demo data)
  Waterford: '26125', Troy: '26125', Clarkston: '26125', Ferndale: '26125',
  Pontiac: '26125', Rochester: '26125', 'Royal Oak': '26125',
  Birmingham: '26125', 'West Bloomfield': '26125',
  // Ingham County
  'East Lansing': '26065', Lansing: '26065', Mason: '26065',
  // Branch County
  Coldwater: '26023',
  // Chippewa County
  'Sault Ste. Marie': '26033',
  // Huron County
  'Bad Axe': '26063',
  // Livingston County
  Brighton: '26093', Howell: '26093',
  // Wayne County
  Detroit: '26163', Dearborn: '26163', 'Ann Arbor': '26163',
};

const COUNTY_NAMES: Record<string, string> = {
  // Washington
  '53033': 'King', '53053': 'Pierce', '53061': 'Snohomish', '53063': 'Spokane',
  '53077': 'Yakima', '53005': 'Benton', '53021': 'Franklin', '53073': 'Whatcom',
  '53011': 'Clark', '53067': 'Thurston', '53071': 'Walla Walla', '53057': 'Skagit',
  '53007': 'Chelan', '53025': 'Grant', '53035': 'Kitsap', '53041': 'Lewis',
  '53027': 'Grays Harbor', '53015': 'Cowlitz', '53029': 'Island', '53009': 'Clallam',
  '53003': 'Asotin', '53075': 'Whitman',
  // Michigan
  '26099': 'Macomb', '26125': 'Oakland', '26065': 'Ingham', '26023': 'Branch',
  '26033': 'Chippewa', '26063': 'Huron', '26093': 'Livingston', '26163': 'Wayne',
};

const COUNTY_CENTROIDS: Record<string, [number, number]> = {
  // Washington
  '53033': [-122.0, 47.49], '53053': [-122.25, 47.05], '53061': [-121.98, 48.0],
  '53063': [-117.4, 47.62], '53077': [-120.5, 46.6], '53005': [-119.5, 46.25],
  '53021': [-119.1, 46.27], '53073': [-122.25, 48.8], '53011': [-122.5, 45.78],
  '53067': [-122.85, 46.97], '53071': [-118.38, 46.15], '53057': [-121.8, 48.45],
  '53007': [-120.4, 47.6], '53025': [-119.4, 47.2], '53035': [-122.7, 47.6],
  '53041': [-122.4, 46.4], '53027': [-123.7, 47.1], '53015': [-122.8, 46.17],
  '53029': [-122.6, 48.15], '53009': [-123.6, 48.1], '53003': [-117.2, 46.38],
  '53075': [-117.2, 46.8],
  // Michigan
  '26099': [-82.9, 42.67], '26125': [-83.4, 42.65], '26065': [-84.4, 42.6],
  '26023': [-85.0, 41.97], '26033': [-84.5, 46.35], '26063': [-83.0, 43.9],
  '26093': [-83.9, 42.6], '26163': [-83.2, 42.35],
};

type Metric = 'exposure' | 'count' | 'high';

interface CountyData {
  fips: string;
  name: string;
  count: number;
  high: number;
  exposure: number;
  cities: string[];
}

function colorForValue(value: number, max: number): string {
  if (max === 0 || value === 0) return '#e5e7eb';
  const t = Math.min(value / max, 1);
  const r = Math.round(234 + (2 - 234) * t);
  const g = Math.round(240 + (37 - 240) * t);
  const b = Math.round(249 + (105 - 249) * t);
  return `rgb(${r},${g},${b})`;
}

export default function GeoMap() {
  const navigate = useNavigate();
  const [countyData, setCountyData] = useState<Record<string, CountyData>>({});
  const [metric, setMetric] = useState<Metric>('exposure');
  const [hovered, setHovered] = useState<CountyData | null>(null);
  const [tooltip, setTooltip] = useState({ x: 0, y: 0 });
  const [selected, setSelected] = useState<CountyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [totals, setTotals] = useState({ cases: 0, exposure: 0, high: 0 });
  const [zoom, setZoom] = useState(1);
  const [center, setCenter] = useState<[number, number]>([-96, 38]);

  useEffect(() => {
    api.metrics.cities()
      .then((data: CityMetric[]) => {
        const agg: Record<string, CountyData> = {};
        for (const city of data) {
          const fips = CITY_TO_FIPS[city.city];
          if (!fips) continue;
          if (!agg[fips]) {
            agg[fips] = { fips, name: COUNTY_NAMES[fips] ?? fips, count: 0, high: 0, exposure: 0, cities: [] };
          }
          agg[fips].count += city.count;
          agg[fips].high += city.high;
          agg[fips].exposure += city.exposure;
          agg[fips].cities.push(city.city);
        }
        setCountyData(agg);
        const allVals = Object.values(agg);
        setTotals({
          cases: allVals.reduce((s, c) => s + c.count, 0),
          exposure: allVals.reduce((s, c) => s + c.exposure, 0),
          high: allVals.reduce((s, c) => s + c.high, 0),
        });
        setLoading(false);
      })
      .catch(() => { setError(true); setLoading(false); });
  }, []);

  const metricVal = useCallback((c: CountyData) =>
    metric === 'exposure' ? c.exposure : metric === 'count' ? c.count : c.high,
    [metric]);

  const maxVal = Math.max(...Object.values(countyData).map(metricVal), 1);

  const sorted = Object.values(countyData)
    .sort((a, b) => metricVal(b) - metricVal(a))
    .slice(0, 10);

  const activeFips = new Set(Object.keys(countyData));

  const metricLabel = metric === 'exposure' ? '$ Exposure' : metric === 'count' ? 'Total Cases' : 'High-Risk Cases';
  const metricFmt = (v: number) => metric === 'exposure' ? `$${v.toLocaleString()}` : v.toLocaleString();

  return (
    <div className="flex flex-col h-full min-h-screen bg-[#F4F4F4]">
      {/* Header */}
      <div className="bg-[#022569] px-8 py-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-[#f1ad02]/20 flex items-center justify-center">
            <MapPin className="w-5 h-5 text-[#f1ad02]" />
          </div>
          <div>
            <h1 className="text-white text-xl font-black">Geographic QC Risk Map</h1>
            <p className="text-white/60 text-xs">County-level SNAP QC exposure · United States</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3 mt-4">
          {[
            { icon: AlertTriangle, label: 'High-Risk Cases', val: totals.high.toLocaleString(), color: 'text-red-400' },
            { icon: TrendingUp, label: 'Total Cases', val: totals.cases.toLocaleString(), color: 'text-white' },
            { icon: DollarSign, label: 'Total QC Exposure', val: `$${totals.exposure.toLocaleString()}`, color: 'text-[#f1ad02]' },
          ].map(s => (
            <div key={s.label} className="flex items-center gap-2 bg-white/8 border border-white/15 rounded-xl px-4 py-2">
              <s.icon className={`w-3.5 h-3.5 ${s.color}`} />
              <span className="text-xs text-white/60">{s.label}</span>
              <span className={`text-sm font-black ${s.color}`}>{loading ? '…' : s.val}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Metric selector */}
      <div className="bg-white border-b border-[#D7D7D7] px-8 py-3 flex items-center gap-2">
        <span className="text-xs text-[#4a5260] font-medium mr-2">Color by:</span>
        {([
          { key: 'exposure', label: '$ QC Exposure', icon: DollarSign },
          { key: 'count', label: 'Total Cases', icon: TrendingUp },
          { key: 'high', label: 'High-Risk Cases', icon: AlertTriangle },
        ] as const).map(m => (
          <button
            key={m.key}
            onClick={() => setMetric(m.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              metric === m.key
                ? 'bg-[#022569] text-white'
                : 'bg-[#F4F4F4] border border-[#D7D7D7] text-[#4a5260] hover:text-[#022569]'
            }`}
          >
            <m.icon className="w-3 h-3" />
            {m.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1.5 text-xs text-[#6b7280]">
          <Info className="w-3 h-3" />
          Hover over a county to see details
        </div>
      </div>

      {/* Main layout */}
      <div className="flex flex-1 gap-0 overflow-hidden">

        {/* Map */}
        <div className="flex-1 relative bg-[#dde6f0] overflow-hidden" style={{ minHeight: 480 }}>
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-5 h-5 border-2 border-[#2e4e84] border-t-transparent rounded-full animate-spin mr-2" />
              <span className="text-sm text-[#4a5260]">Loading map…</span>
            </div>
          ) : error ? (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-red-600">
              Failed to load QC data. Is the backend running?
            </div>
          ) : (
            <ComposableMap
              projection="geoAlbers"
              projectionConfig={{ scale: 900 }}
              width={900}
              height={560}
              style={{ width: '100%', height: '100%' }}
            >
              <ZoomableGroup
                zoom={zoom}
                center={center}
                onMoveEnd={({ zoom: z, coordinates }: any) => {
                  setZoom(z);
                  setCenter(coordinates);
                }}
              >
              <Geographies geography={GEO_URL}>
                {({ geographies }: any) =>
                  geographies.map((geo: any) => {
                    const rawId = geo.id?.toString() ?? '';
                    const fips = rawId.padStart(5, '0');
                    const cd = activeFips.has(fips) ? countyData[fips] : undefined;
                    const val = cd ? metricVal(cd) : 0;
                    const fill = cd ? colorForValue(val, maxVal) : '#f3f4f6';
                    const isHovered = hovered?.fips === fips;
                    const isSelected = selected?.fips === fips;
                    return (
                      <Geography
                        key={geo.rsmKey}
                        geography={geo}
                        fill={fill}
                        stroke={cd ? '#9ca3af' : '#e5e7eb'}
                        strokeWidth={isHovered || isSelected ? 1.5 : 0.4}
                        style={{
                          default: { outline: 'none' },
                          hover: { outline: 'none', cursor: cd ? 'pointer' : 'default' },
                          pressed: { outline: 'none' },
                        }}
                        onMouseEnter={(evt: React.MouseEvent) => {
                          if (cd) {
                            setHovered(cd);
                            setTooltip({ x: evt.clientX, y: evt.clientY });
                          }
                        }}
                        onMouseMove={(evt: React.MouseEvent) => {
                          if (cd) setTooltip({ x: evt.clientX, y: evt.clientY });
                        }}
                        onMouseLeave={() => setHovered(null)}
                        onClick={() => cd && setSelected(cd)}
                      />
                    );
                  })
                }
              </Geographies>

              {/* Bubble markers */}
              {Object.values(countyData).map(cd => {
                const center = COUNTY_CENTROIDS[cd.fips];
                if (!center) return null;
                const val = metricVal(cd);
                const r = Math.max(5, Math.min(24, (val / maxVal) * 24));
                return (
                  <Marker key={cd.fips} coordinates={center}>
                    <circle
                      r={r}
                      fill={selected?.fips === cd.fips ? '#f1ad02' : '#022569'}
                      fillOpacity={0.8}
                      stroke="#fff"
                      strokeWidth={1.5}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setSelected(cd)}
                      onMouseEnter={(evt) => {
                        setHovered(cd);
                        setTooltip({ x: evt.clientX, y: evt.clientY });
                      }}
                      onMouseLeave={() => setHovered(null)}
                    />
                    {r > 12 && (
                      <text
                        textAnchor="middle"
                        dy="0.35em"
                        fill="#fff"
                        fontSize={r > 18 ? 8 : 6}
                        fontWeight="bold"
                        style={{ pointerEvents: 'none' }}
                      >
                        {cd.name.length > 6 ? cd.name.slice(0, 5) + '.' : cd.name}
                      </text>
                    )}
                  </Marker>
                );
              })}
              </ZoomableGroup>
            </ComposableMap>
          )}

          {/* Zoom controls */}
          {!loading && !error && (
            <div className="absolute top-4 right-4 flex flex-col gap-1">
              {[
                { label: '+', action: () => setZoom(z => Math.min(z * 1.5, 20)) },
                { label: '−', action: () => setZoom(z => Math.max(z / 1.5, 1)) },
                { label: '⌂', action: () => { setZoom(1); setCenter([-96, 38]); } },
              ].map(({ label, action }) => (
                <button
                  key={label}
                  onClick={action}
                  className="w-8 h-8 bg-white border border-[#D7D7D7] rounded-lg text-sm font-bold text-[#022569] shadow-sm hover:bg-[#eaf0f9] transition-colors flex items-center justify-center"
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* Legend */}
          {!loading && !error && (
            <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-sm border border-[#D7D7D7] rounded-xl p-3 shadow-sm">
              <p className="text-[10px] font-bold text-[#4a5260] uppercase tracking-wide mb-2">{metricLabel}</p>
              <div className="flex items-center gap-2">
                <div className="w-24 h-3 rounded" style={{ background: 'linear-gradient(to right, #eaf0f9, #022569)' }} />
                <div className="flex justify-between w-16 text-[9px] text-[#6b7280]">
                  <span>Low</span>
                  <span>High</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 mt-2">
                <div className="w-3 h-3 rounded-full bg-[#022569] opacity-80" />
                <span className="text-[9px] text-[#6b7280]">Bubble = relative size</span>
              </div>
            </div>
          )}

          {/* Hover tooltip */}
          {hovered && (
            <div
              className="fixed z-50 bg-white border border-[#D7D7D7] rounded-xl shadow-xl p-3 pointer-events-none min-w-[180px]"
              style={{ top: tooltip.y - 80, left: tooltip.x + 12 }}
            >
              <p className="text-sm font-bold text-[#022569] mb-1">{hovered.name} County</p>
              <div className="space-y-1">
                <div className="flex justify-between gap-4">
                  <span className="text-xs text-[#6b7280]">Total Cases</span>
                  <span className="text-xs font-semibold">{hovered.count}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-xs text-[#6b7280]">High-Risk</span>
                  <span className="text-xs font-semibold text-red-600">{hovered.high}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-xs text-[#6b7280]">QC Exposure</span>
                  <span className="text-xs font-semibold text-amber-700">${hovered.exposure.toLocaleString()}</span>
                </div>
                {hovered.cities.length > 0 && (
                  <p className="text-[10px] text-[#6b7280] mt-1 pt-1 border-t border-[#e5e7eb]">
                    {hovered.cities.slice(0, 3).join(', ')}{hovered.cities.length > 3 ? ` +${hovered.cities.length - 3}` : ''}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="w-72 bg-white border-l border-[#D7D7D7] flex flex-col overflow-hidden">

          {selected ? (
            <div className="p-4 border-b border-[#D7D7D7] bg-[#022569]/5">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-bold text-[#022569]">{selected.name} County</h3>
                <button onClick={() => setSelected(null)} className="text-xs text-[#6b7280] hover:text-[#022569]">✕</button>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="bg-white rounded-lg p-2 text-center border border-[#D7D7D7]">
                  <p className="text-lg font-black text-[#022569]">{selected.count}</p>
                  <p className="text-[10px] text-[#6b7280]">Total Cases</p>
                </div>
                <div className="bg-white rounded-lg p-2 text-center border border-[#D7D7D7]">
                  <p className="text-lg font-black text-red-600">{selected.high}</p>
                  <p className="text-[10px] text-[#6b7280]">High-Risk</p>
                </div>
                <div className="col-span-2 bg-white rounded-lg p-2 text-center border border-amber-200">
                  <p className="text-lg font-black text-amber-700">${selected.exposure.toLocaleString()}</p>
                  <p className="text-[10px] text-[#6b7280]">QC Exposure</p>
                </div>
              </div>
              {selected.cities.length > 0 && (
                <p className="text-xs text-[#4a5260] mb-3">
                  <span className="font-semibold">Cities:</span> {selected.cities.join(', ')}
                </p>
              )}
              <button
                onClick={() => {
                  const params = new URLSearchParams();
                  params.set('county', selected.name);
                  selected.cities.forEach(c => params.append('cities', c));
                  navigate(`/queue?${params}`);
                }}
                className="w-full flex items-center justify-center gap-1.5 bg-[#022569] text-white text-xs font-bold rounded-lg py-2 hover:bg-[#2e4e84] transition-colors"
              >
                View Cases in Queue
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="p-4 border-b border-[#D7D7D7] bg-[#F4F4F4]">
              <p className="text-xs text-[#4a5260]">Click a county on the map to see details and drill into cases.</p>
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            <div className="px-4 py-3 border-b border-[#D7D7D7]">
              <p className="text-xs font-bold text-[#022569]">Top Counties by {metricLabel}</p>
            </div>
            {loading ? (
              <div className="p-4 space-y-2">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="h-10 bg-[#F4F4F4] rounded-lg animate-pulse" />
                ))}
              </div>
            ) : sorted.length === 0 ? (
              <div className="p-4 text-xs text-[#6b7280]">No county data available.</div>
            ) : (
              <div>
                {sorted.map((cd, i) => {
                  const val = metricVal(cd);
                  const pct = maxVal > 0 ? (val / maxVal) * 100 : 0;
                  const isSelected = selected?.fips === cd.fips;
                  return (
                    <div
                      key={cd.fips}
                      className={`px-4 py-2.5 border-b border-[#e5e7eb] cursor-pointer transition-colors hover:bg-[#eaf0f9] ${isSelected ? 'bg-[#022569]/5 border-l-2 border-l-[#022569]' : ''}`}
                      onClick={() => setSelected(cd)}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black text-[#6b7280] w-4">{i + 1}</span>
                          <span className="text-xs font-semibold text-[#022569]">{cd.name}</span>
                        </div>
                        <span className={`text-xs font-bold ${metric === 'exposure' ? 'text-amber-700' : metric === 'high' ? 'text-red-600' : 'text-[#022569]'}`}>
                          {metricFmt(val)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-[#e5e7eb] rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${pct}%`,
                              background: metric === 'exposure' ? '#f59e0b' : metric === 'high' ? '#ef4444' : '#022569',
                            }}
                          />
                        </div>
                        <span className="text-[9px] text-[#6b7280] w-8 text-right">{Math.round(pct)}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="p-4 border-t border-[#D7D7D7] bg-[#F4F4F4]">
            <p className="text-[10px] text-[#6b7280] leading-relaxed">
              County data aggregated from city-level QC case records. Click any county to drill into the case queue.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, ClipboardList, MessageSquare,
  Layers, Settings, Database, ChevronDown, ShieldAlert, GitBranch, BarChart3, Map,
  Sun, Moon,
} from 'lucide-react';
import { useRole, ROLES, type Role } from '../context/RoleContext';
import { useBranding } from '../context/AppConfigContext';
import { useTheme } from '../context/ThemeContext';

const ALL_NAV = [
  { to: '/' as const,         icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/reports' as const,  icon: BarChart3,        label: 'Reports' },
  { to: '/queue' as const,    icon: ClipboardList,   label: 'Case Queue' },
  { to: '/signals' as const,  icon: GitBranch,       label: 'Signals' },
  { to: '/catalog' as const,  icon: Database,        label: 'Data Catalog' },
  { to: '/chat' as const,     icon: MessageSquare,   label: 'AI Assistant' },
  { to: '/map' as const,      icon: Map,             label: 'Geo Map' },
  { to: '/pipeline' as const, icon: Layers,          label: 'Pipeline' },
  { to: '/settings' as const, icon: Settings,        label: 'Settings' },
];

const ROLE_ORDER: Role[] = ['caseworker', 'supervisor', 'executive', 'data_engineer'];

const ROLE_DOT: Record<Role, string> = {
  caseworker:    '#6366f1',
  supervisor:    '#f59e0b',
  executive:     '#22c55e',
  data_engineer: '#a78bfa',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  const { role, setRole } = useRole();
  const branding = useBranding();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const { theme, toggle } = useTheme();

  const roleDef = ROLES[role];
  const dotColor = ROLE_DOT[role];
  const visibleNav = ALL_NAV.filter(n => (roleDef.nav as string[]).includes(n.to));

  const currentNav = ALL_NAV.find(n =>
    n.to === '/' ? location.pathname === '/' : location.pathname.startsWith(n.to)
  );

  const switchRole = (r: Role) => {
    setRole(r);
    setOpen(false);
    navigate(ROLES[r].defaultPath);
  };

  return (
    <div className="min-h-screen bg-[#F4F4F4]">

      {/* ── Top nav ── */}
      <header className="fixed top-0 left-0 right-0 h-16 bg-[#2e4e84] flex items-stretch z-50 border-b border-black/10">

        {/* Brand */}
        <div className="flex items-center gap-3 px-5 border-r border-white/[.14] shrink-0">
          <div className="w-9 h-9 rounded-lg bg-[#f1ad02] flex items-center justify-center shrink-0 overflow-hidden">
            {branding.icon_url
              ? <img src={branding.icon_url} alt={branding.state} className="w-full h-full object-contain p-0.5" onError={e => { (e.target as HTMLImageElement).style.display='none'; }} />
              : <ShieldAlert className="w-5 h-5 text-[#1f1611]" />
            }
          </div>
          <div>
            <p className="text-[9.5px] text-white/[.65] uppercase tracking-[.14em] font-bold leading-none">
              {branding.state} · {branding.agency_name}
            </p>
            <p className="text-[13.5px] font-extrabold text-white mt-0.5 leading-tight">
              {branding.program_name}
            </p>
          </div>
        </div>

        {/* Nav links */}
        <nav className="flex-1 flex items-center gap-1 px-3 overflow-x-auto">
          {visibleNav.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-2 px-3.5 py-2 rounded-lg text-[13.5px] font-semibold whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-[#f1ad02] text-[#1f1611] font-extrabold'
                    : 'text-white/80 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Role chip + Powered by Databricks */}
        <div className="flex items-center gap-4 px-5 border-l border-white/[.12] shrink-0 relative">
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            className="flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-3.5 py-1.5 hover:bg-white/[.18] transition-colors"
          >
            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: dotColor }} />
            <span className="text-[12.5px] font-bold" style={{ color: dotColor }}>
              {roleDef.label}
            </span>
            <ChevronDown className={`w-3 h-3 text-white/50 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>

          <button
            type="button"
            onClick={toggle}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white transition-colors"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>


          {/* Role dropdown */}
          {open && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
              <div className="absolute top-[calc(100%+8px)] right-0 z-20 w-56 bg-white border border-[#e5e7eb] rounded-xl shadow-[0_8px_24px_rgba(2,37,105,.18)] p-1.5">
                <p className="text-[10px] uppercase tracking-[.1em] text-[#9ca3af] font-bold px-2.5 py-1.5">
                  Switch role
                </p>
                {ROLE_ORDER.map(r => {
                  const def = ROLES[r];
                  const dc = ROLE_DOT[r];
                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() => switchRole(r)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left transition-colors hover:bg-[#eaf0f9] ${role === r ? 'bg-[#eaf0f9]' : ''}`}
                    >
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: dc }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-bold text-[#022569]">{def.label}</p>
                        <p className="text-[11px] text-[#4a5260] truncate">{def.tagline}</p>
                      </div>
                      {role === r && <span className="text-[#2e4e84] text-sm font-bold">✓</span>}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </header>

      {/* ── Breadcrumb strip ── */}
      <div
        className="fixed top-16 left-0 right-0 h-11 bg-white border-b border-[#D7D7D7] flex items-center gap-2 px-7 z-40 text-sm text-[#4a5260] transition-colors"
        style={{ borderTop: '3px solid #f1ad02' }}
      >
        <span>Home</span>
        <span className="text-[#c9d0d8]">›</span>
        <span className="font-bold text-[#022569]">{currentNav?.label ?? 'Cases'}</span>
      </div>

      {/* ── Content (offset: 64px nav + 44px breadcrumb = 108px) ── */}
      <main className="pt-[108px] min-h-screen bg-[#F4F4F4]">
        {children}
      </main>
    </div>
  );
}

import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, ClipboardList, MessageSquare, ShieldAlert, ChevronDown, User, Layers } from 'lucide-react';
import { useRole, ROLES, type Role } from '../context/RoleContext';

const ALL_NAV = [
  { to: '/' as const,        icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/queue' as const,   icon: ClipboardList,   label: 'Case Queue' },
  { to: '/chat' as const,    icon: MessageSquare,   label: 'AI Assistant' },
  { to: '/pipeline' as const, icon: Layers,         label: 'Pipeline' },
];

const ROLE_ORDER: Role[] = ['caseworker', 'supervisor', 'executive', 'data_engineer'];

const ROLE_COLORS: Record<Role, { dot: string; bg: string; border: string; text: string }> = {
  caseworker:   { dot: 'bg-[#6366f1]', bg: 'bg-[#6366f1]/10', border: 'border-[#6366f1]/30', text: 'text-[#6366f1]' },
  supervisor:   { dot: 'bg-amber-400', bg: 'bg-amber-400/10',  border: 'border-amber-400/30',  text: 'text-amber-400' },
  executive:    { dot: 'bg-green-400', bg: 'bg-green-400/10',  border: 'border-green-400/30',  text: 'text-green-400' },
  data_engineer: { dot: 'bg-cyan-400',  bg: 'bg-cyan-400/10',   border: 'border-cyan-400/30',   text: 'text-cyan-400' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  const { role, setRole } = useRole();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const roleDef = ROLES[role];
  const colors = ROLE_COLORS[role];
  const visibleNav = ALL_NAV.filter(n => roleDef.nav.includes(n.to));

  const switchRole = (r: Role) => {
    setRole(r);
    setOpen(false);
    navigate(ROLES[r].defaultPath);
  };

  return (
    <div className="flex w-full min-h-screen bg-[#0f0f13]">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 border-r border-[#27272a] flex flex-col py-6 px-3 bg-[#0c0c10]">

        {/* Logo */}
        <div className="px-3 mb-5">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-[#ef4444]" />
            <span className="text-sm font-bold tracking-tight">SNAP QC Guard</span>
          </div>
          <p className="text-[10px] text-[#71717a] mt-1 leading-tight">Early Warning System — Michigan</p>
        </div>

        {/* Role picker */}
        <div className="px-1 mb-5 relative">
          <button
            onClick={() => setOpen(o => !o)}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg border transition-colors ${colors.bg} ${colors.border}`}
          >
            <div className={`w-2 h-2 rounded-full shrink-0 ${colors.dot}`} />
            <div className="flex-1 min-w-0 text-left">
              <p className={`text-xs font-semibold ${colors.text}`}>{roleDef.label}</p>
              <p className="text-[9px] text-[#52525b] truncate">{roleDef.tagline}</p>
            </div>
            <ChevronDown className={`w-3.5 h-3.5 text-[#52525b] shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>

          {open && (
            <>
              {/* Backdrop */}
              <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
              {/* Dropdown */}
              <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-[#18181f] border border-[#27272a] rounded-lg overflow-hidden shadow-xl">
                {ROLE_ORDER.map(r => {
                  const def = ROLES[r];
                  const c = ROLE_COLORS[r];
                  return (
                    <button
                      key={r}
                      onClick={() => switchRole(r)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-[#27272a] ${role === r ? 'bg-[#27272a]/60' : ''}`}
                    >
                      <div className={`w-2 h-2 rounded-full shrink-0 ${c.dot}`} />
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-semibold ${c.text}`}>{def.label}</p>
                        <p className="text-[9px] text-[#52525b] truncate">{def.tagline}</p>
                      </div>
                      {role === r && <div className="w-1 h-1 rounded-full bg-white/40 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Nav */}
        <nav className="space-y-1">
          {visibleNav.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-[#1e1e2a] text-white font-medium'
                    : 'text-[#71717a] hover:text-white hover:bg-[#18181f]'
                }`
              }
            >
              <Icon className="w-4 h-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Role hint at bottom */}
        <div className="mt-auto px-3 pt-4 border-t border-[#27272a]">
          <div className="flex items-center gap-1.5 mb-2">
            <User className="w-3 h-3 text-[#3f3f46]" />
            <span className={`text-[10px] font-medium ${colors.text}`}>{roleDef.label} view</span>
          </div>
          <p className="text-[10px] text-[#52525b] leading-relaxed">
            Oct 2026: SNAP cost-share shifts to 25/75. 40K recipients at risk.
          </p>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}

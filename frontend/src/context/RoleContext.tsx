import { createContext, useContext, useState } from 'react';

export type Role = 'caseworker' | 'supervisor' | 'executive' | 'data_engineer';

export interface RoleDef {
  label: string;
  tagline: string;
  defaultPath: string;
  nav: Array<'/' | '/queue' | '/chat' | '/pipeline' | '/settings'>;
  accent: string;
}

export const ROLES: Record<Role, RoleDef> = {
  caseworker: {
    label: 'Caseworker',
    tagline: 'Case review & verification',
    defaultPath: '/queue',
    nav: ['/queue'],
    accent: 'text-[#6366f1]',
  },
  supervisor: {
    label: 'Supervisor',
    tagline: 'Team oversight & QC management',
    defaultPath: '/',
    nav: ['/', '/queue', '/chat'],
    accent: 'text-amber-400',
  },
  executive: {
    label: 'Executive',
    tagline: 'Strategic overview & policy',
    defaultPath: '/',
    nav: ['/', '/chat'],
    accent: 'text-green-400',
  },
  data_engineer: {
    label: 'Data Engineer',
    tagline: 'Pipeline health & data quality',
    defaultPath: '/pipeline',
    nav: ['/pipeline', '/settings'],
    accent: 'text-cyan-400',
  },
};

interface RoleContextValue {
  role: Role;
  setRole: (r: Role) => void;
}

const RoleContext = createContext<RoleContextValue>({
  role: 'supervisor',
  setRole: () => {},
});

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [role, setRoleState] = useState<Role>(() => {
    return (localStorage.getItem('snap-qc-role') as Role) || 'supervisor';
  });

  const setRole = (r: Role) => {
    setRoleState(r);
    localStorage.setItem('snap-qc-role', r);
  };

  return (
    <RoleContext.Provider value={{ role, setRole }}>
      {children}
    </RoleContext.Provider>
  );
}

export const useRole = () => useContext(RoleContext);

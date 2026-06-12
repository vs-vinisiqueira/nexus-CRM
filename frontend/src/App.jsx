import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import Overview from './pages/Overview.jsx';
import Leads from './pages/Leads.jsx';
import Collect from './pages/Collect.jsx';
import Attendants from './pages/Attendants.jsx';
import Settings from './pages/Settings.jsx';

const NAV = [
  { to: '/visao-geral', label: 'Visão geral', icon: '📊' },
  { to: '/leads', label: 'Leads', icon: '🗂️' },
  { to: '/coletar', label: 'Coletar', icon: '🔎' },
  { to: '/atendentes', label: 'Atendentes', icon: '👥' },
  { to: '/configuracoes', label: 'Configurações', icon: '⚙️' },
];

function Sidebar() {
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 font-bold text-white">
          N
        </div>
        <div>
          <p className="font-semibold leading-tight text-slate-800">Nexus</p>
          <p className="text-xs text-slate-500">CRM de prospecção</p>
        </div>
      </div>
      <nav className="flex-1 space-y-1 px-3">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'
              }`
            }
          >
            <span>{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="px-5 py-4 text-[11px] leading-snug text-slate-400">
        Prospecção humana assistida. Sem disparo automático em massa.
      </div>
    </aside>
  );
}

export default function App() {
  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <Routes>
            <Route path="/" element={<Navigate to="/visao-geral" replace />} />
            <Route path="/visao-geral" element={<Overview />} />
            <Route path="/leads" element={<Leads />} />
            <Route path="/coletar" element={<Collect />} />
            <Route path="/atendentes" element={<Attendants />} />
            <Route path="/configuracoes" element={<Settings />} />
            <Route path="*" element={<Navigate to="/visao-geral" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { api, auth } from './api.js';
import { Spinner } from './components/ui.jsx';
import Login from './pages/Login.jsx';
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

function Sidebar({ user, onLogout }) {
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
      <div className="border-t border-slate-100 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-700">{user?.username}</p>
            <p className="text-[11px] text-slate-400">{user?.role}</p>
          </div>
          <button
            onClick={onLogout}
            className="rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100"
          >
            Sair
          </button>
        </div>
      </div>
    </aside>
  );
}

export default function App() {
  // undefined = verificando sessão; null = deslogado; objeto = logado
  const [user, setUser] = useState(undefined);
  // true = não conseguimos falar com o servidor (não é sessão inválida)
  const [netError, setNetError] = useState(false);
  const [nonce, setNonce] = useState(0); // bump para reexecutar o bootstrap

  useEffect(() => {
    let active = true;
    async function bootstrap() {
      if (!auth.token) {
        if (active) setUser(null);
        return;
      }
      try {
        const { user: u } = await api.me();
        if (active) {
          setNetError(false);
          setUser(u);
        }
      } catch (err) {
        if (!active) return;
        if (err && err.status === 401) {
          // Sessão inválida — o token já foi limpo em req(). Vai para o Login.
          setUser(null);
        } else {
          // Falha de rede/servidor: NÃO descarta o token; oferece tentar de novo.
          setNetError(true);
        }
      }
    }
    bootstrap();

    const onUnauthorized = () => setUser(null);
    window.addEventListener('nexus-unauthorized', onUnauthorized);
    return () => {
      active = false;
      window.removeEventListener('nexus-unauthorized', onUnauthorized);
    };
  }, [nonce]);

  async function handleLogout() {
    await api.logout();
    setUser(null);
  }

  if (netError && user === undefined) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm text-slate-600">Não foi possível conectar ao servidor.</p>
        <button
          onClick={() => {
            setNetError(false);
            setNonce((n) => n + 1);
          }}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Tentar de novo
        </button>
      </div>
    );
  }

  if (user === undefined) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  if (!user) return <Login onLogin={setUser} />;

  return (
    <div className="flex h-full">
      <Sidebar user={user} onLogout={handleLogout} />
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

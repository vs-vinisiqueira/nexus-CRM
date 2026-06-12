import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, STATUS_LABELS } from '../api.js';
import { Button, Card, EmptyState, Spinner, StatusBadge } from '../components/ui.jsx';

const PIPELINE_ORDER = ['pendente', 'qualificado', 'contatado', 'respondeu', 'convertido', 'descartado'];

function Kpi({ label, value, accent = 'text-slate-800' }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-3xl font-semibold ${accent}`}>{value}</p>
    </Card>
  );
}

export default function Overview() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [assignResult, setAssignResult] = useState(null);
  const [error, setError] = useState(null);

  async function load() {
    try {
      setStats(await api.stats());
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function assign(leadId) {
    try {
      const result = await api.assignLead(leadId);
      setAssignResult(result);
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner className="h-6 w-6" /></div>;
  if (error && !stats) return <EmptyState title="Não foi possível carregar">{error}</EmptyState>;

  const counts = stats.counts || {};

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-800">Visão geral</h1>
        <p className="text-sm text-slate-500">Panorama do pipeline e fila de leads quentes do dia.</p>
      </header>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Kpi label="Total de leads" value={stats.total} />
        <Kpi label="Qualificados" value={counts.qualificado || 0} accent="text-blue-600" />
        <Kpi label="Responderam" value={counts.respondeu || 0} accent="text-emerald-600" />
        <Kpi label="Convertidos" value={counts.convertido || 0} accent="text-violet-600" />
        <Kpi label="Coletados hoje" value={stats.collectedToday} />
        <Kpi label="Atendentes ativos" value={stats.activeAttendants} />
        <Kpi label="Contatados" value={counts.contatado || 0} accent="text-amber-600" />
        <Kpi label="Descartados" value={counts.descartado || 0} accent="text-rose-500" />
      </div>

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Distribuição do pipeline</h2>
        <div className="space-y-2">
          {PIPELINE_ORDER.map((s) => {
            const v = counts[s] || 0;
            const pct = stats.total ? Math.round((v / stats.total) * 100) : 0;
            return (
              <div key={s} className="flex items-center gap-3">
                <div className="w-28 text-sm text-slate-600">{STATUS_LABELS[s]}</div>
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-indigo-500" style={{ width: `${pct}%` }} />
                </div>
                <div className="w-12 text-right text-sm tabular-nums text-slate-500">{v}</div>
              </div>
            );
          })}
        </div>
      </Card>

      {assignResult && (
        <Card className="border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-medium text-emerald-800">
                Lead atribuído a {assignResult.attendant.name}
              </p>
              <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-white p-3 text-xs text-slate-600">
                {assignResult.briefing}
              </pre>
              <div className="mt-2 flex gap-2">
                {assignResult.notifyLink && (
                  <a href={assignResult.notifyLink} target="_blank" rel="noreferrer">
                    <Button variant="success">Notificar atendente (WhatsApp)</Button>
                  </a>
                )}
                {assignResult.leadContactLink && (
                  <a href={assignResult.leadContactLink} target="_blank" rel="noreferrer">
                    <Button variant="secondary">Abrir conversa com o lead</Button>
                  </a>
                )}
              </div>
            </div>
            <Button variant="ghost" onClick={() => setAssignResult(null)}>✕</Button>
          </div>
        </Card>
      )}

      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">
            🔥 Fila de leads quentes ({stats.hotLeads.length})
          </h2>
          <Link to="/leads?status=respondeu" className="text-sm text-indigo-600 hover:underline">
            ver todos
          </Link>
        </div>
        {stats.hotLeads.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">
            Nenhum lead aguardando atendimento. 🎉
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="pb-2 font-medium">Negócio</th>
                <th className="pb-2 font-medium">Segmento</th>
                <th className="pb-2 font-medium">Atendente</th>
                <th className="pb-2 text-right font-medium">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {stats.hotLeads.map((l) => (
                <tr key={l.id}>
                  <td className="py-2 font-medium text-slate-700">{l.name}</td>
                  <td className="py-2 text-slate-500">{l.segment || '—'}</td>
                  <td className="py-2 text-slate-500">{l.attendant_name || <span className="text-amber-600">não atribuído</span>}</td>
                  <td className="py-2 text-right">
                    <Button variant="secondary" onClick={() => assign(l.id)}>
                      {l.attendant_name ? 'Reatribuir' : 'Atribuir'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

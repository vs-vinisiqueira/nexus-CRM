import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Button, Card, EmptyState, Field, Input, Spinner } from '../components/ui.jsx';

export default function Attendants() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: '', whatsapp: '' });
  const [error, setError] = useState(null);

  async function load() {
    setLoading(true);
    try {
      setList(await api.listAttendants());
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function add(e) {
    e.preventDefault();
    setError(null);
    try {
      await api.createAttendant(form);
      setForm({ name: '', whatsapp: '' });
      await load();
    } catch (e2) {
      setError(e2.message);
    }
  }

  async function toggle(a) {
    await api.updateAttendant(a.id, { active: !a.active });
    await load();
  }

  async function remove(a) {
    if (!confirm(`Remover ${a.name}?`)) return;
    await api.deleteAttendant(a.id);
    await load();
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold text-slate-800">Atendentes</h1>
        <p className="text-sm text-slate-500">Os responsáveis que recebem os leads quentes por rodízio.</p>
      </header>

      <Card className="p-5">
        <form onSubmit={add} className="flex flex-wrap items-end gap-3">
          <Field label="Nome"><Input value={form.name} required onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="WhatsApp" hint="com DDD, ex.: 11988887777">
            <Input value={form.whatsapp} required onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} />
          </Field>
          <Button type="submit" className="mb-px">+ Adicionar</Button>
        </form>
        {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
      </Card>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner className="h-6 w-6" /></div>
      ) : list.length === 0 ? (
        <EmptyState title="Nenhum atendente cadastrado">Adicione os 4 responsáveis para distribuir os leads.</EmptyState>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-2 font-medium">Nome</th>
                <th className="px-4 py-2 font-medium">WhatsApp</th>
                <th className="px-4 py-2 font-medium">Leads em aberto</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 text-right font-medium">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.map((a) => (
                <tr key={a.id}>
                  <td className="px-4 py-2.5 font-medium text-slate-700">{a.name}</td>
                  <td className="px-4 py-2.5 text-slate-500">{a.whatsapp}</td>
                  <td className="px-4 py-2.5 text-slate-500">{a.open_leads}</td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${a.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
                      {a.active ? 'ativo' : 'inativo'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Button variant="ghost" onClick={() => toggle(a)}>{a.active ? 'Desativar' : 'Ativar'}</Button>
                    <Button variant="ghost" className="text-rose-600" onClick={() => remove(a)}>Remover</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Button, Card, Field, Input, Spinner } from '../components/ui.jsx';

const SUGGESTED = ['salão de beleza', 'barbearia', 'clínica odontológica', 'restaurante', 'oficina mecânica', 'pet shop', 'academia', 'lanchonete'];

export default function Collect() {
  const [form, setForm] = useState({ segment: '', neighborhood: '', city: 'Guarulhos', limit: 15, autoSave: true });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function run(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setResult(await api.collect(form));
    } catch (e2) {
      setError(e2.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold text-slate-800">Coletar leads</h1>
        <p className="text-sm text-slate-500">
          Descobre negócios via Google Search e <strong>confirma no Google Maps que não têm site próprio</strong>.
          Só dados públicos de negócio, para qualificação — nenhuma mensagem é enviada aqui.
        </p>
      </header>

      <Card className="p-5">
        <form onSubmit={run} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Field label="Segmento" hint="ex.: salão de beleza">
              <Input value={form.segment} onChange={(e) => setForm({ ...form, segment: e.target.value })} placeholder="salão de beleza" />
            </Field>
            <Field label="Bairro">
              <Input value={form.neighborhood} onChange={(e) => setForm({ ...form, neighborhood: e.target.value })} placeholder="Vila Galvão" />
            </Field>
            <Field label="Cidade">
              <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </Field>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {SUGGESTED.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setForm({ ...form, segment: s })}
                className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600 hover:bg-slate-200"
              >
                {s}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <Field label="Limite">
              <Input
                type="number" min="1" max="50" value={form.limit}
                onChange={(e) => setForm({ ...form, limit: Number(e.target.value) })}
                className="w-24"
              />
            </Field>
            <label className="mb-2 flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={form.autoSave} onChange={(e) => setForm({ ...form, autoSave: e.target.checked })} />
              Salvar automaticamente no pipeline (como “qualificado”)
            </label>
            <Button type="submit" disabled={loading} className="mb-2 ml-auto">
              {loading ? <><Spinner className="mr-2" /> Coletando…</> : 'Coletar'}
            </Button>
          </div>
        </form>
      </Card>

      {error && <Card className="border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</Card>}

      {loading && (
        <p className="text-center text-sm text-slate-500">
          Buscando no Google e confirmando no Maps… isso pode levar alguns segundos por negócio.
        </p>
      )}

      {result && result.configured === false && (
        <Card className="border-amber-200 bg-amber-50 p-4">
          <p className="font-medium text-amber-800">Chave da SerpAPI não configurada</p>
          <p className="mt-1 text-sm text-amber-700">
            A coleta usa a SerpAPI para consultar Google e Maps. Cadastre sua chave em{' '}
            <Link to="/configuracoes" className="font-medium underline">Configurações</Link> e tente de novo.
          </p>
        </Card>
      )}

      {result && result.configured && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-4 text-sm text-slate-600">
            <span><strong>{result.discovered}</strong> descobertos</span>
            <span className="text-emerald-700"><strong>{result.leads.length}</strong> sem site (válidos)</span>
            <span className="text-slate-400"><strong>{result.skipped.length}</strong> descartados</span>
            {form.autoSave && <span className="text-indigo-700"><strong>{result.saved}</strong> salvos no pipeline</span>}
          </div>

          {result.leads.length > 0 && (
            <Card className="overflow-hidden">
              <div className="border-b border-slate-100 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800">
                Leads válidos (sem site próprio)
              </div>
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-4 py-2 font-medium">Negócio</th>
                    <th className="px-4 py-2 font-medium">Telefone</th>
                    <th className="px-4 py-2 font-medium">Endereço</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {result.leads.map((l, i) => (
                    <tr key={`${l.name}-${i}`}>
                      <td className="px-4 py-2 font-medium text-slate-700">{l.name}</td>
                      <td className="px-4 py-2 text-slate-500">{l.phone || '—'}</td>
                      <td className="px-4 py-2 text-slate-500">{l.address || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!form.autoSave && (
                <p className="px-4 py-2 text-xs text-slate-400">
                  Pré-visualização (não salvo). Marque “Salvar automaticamente” e colete de novo para gravar no pipeline.
                </p>
              )}
            </Card>
          )}

          {result.skipped.length > 0 && (
            <Card className="p-4">
              <p className="mb-2 text-sm font-medium text-slate-600">Descartados</p>
              <ul className="space-y-1 text-sm text-slate-500">
                {result.skipped.map((s, i) => (
                  <li key={`${s.name}-${i}`}>
                    <span className="text-slate-700">{s.name}</span> — {s.reason}
                    {s.websiteUrl && <span className="text-slate-400"> ({s.websiteUrl})</span>}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

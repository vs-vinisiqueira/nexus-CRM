import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, STATUS_LABELS, TRANSITIONS } from '../api.js';
import { Button, Card, EmptyState, Field, Input, Spinner, StatusBadge } from '../components/ui.jsx';

const STATUS_FILTERS = ['', 'pendente', 'qualificado', 'contatado', 'respondeu', 'convertido', 'descartado'];

function NewLeadForm({ onCreated, onClose }) {
  const [form, setForm] = useState({ name: '', segment: '', phone: '', neighborhood: '', source: 'manual' });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const lead = await api.createLead(form);
      onCreated(lead);
    } catch (e2) {
      setError(e2.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Nome do negócio">
        <Input value={form.name} required onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Segmento">
          <Input value={form.segment} onChange={(e) => setForm({ ...form, segment: e.target.value })} />
        </Field>
        <Field label="WhatsApp / telefone">
          <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </Field>
      </div>
      <Field label="Bairro">
        <Input value={form.neighborhood} onChange={(e) => setForm({ ...form, neighborhood: e.target.value })} />
      </Field>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button type="submit" disabled={saving}>{saving ? 'Salvando…' : 'Criar lead'}</Button>
      </div>
    </form>
  );
}

function MessageLog({ lead, onChange }) {
  const [body, setBody] = useState('');
  const [direction, setDirection] = useState('out');
  const [sending, setSending] = useState(false);

  async function add(e) {
    e.preventDefault();
    if (!body.trim()) return;
    setSending(true);
    try {
      await api.addMessage(lead.id, { direction, body });
      setBody('');
      await onChange();
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <div className="max-h-48 space-y-1.5 overflow-y-auto rounded-lg bg-slate-50 p-3">
        {(lead.messages || []).length === 0 ? (
          <p className="text-center text-xs text-slate-400">Sem mensagens registradas.</p>
        ) : (
          lead.messages.map((m) => (
            <div key={m.id} className={`flex ${m.direction === 'out' ? 'justify-end' : 'justify-start'}`}>
              <span
                className={`max-w-[80%] rounded-lg px-3 py-1.5 text-sm ${
                  m.direction === 'out' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200'
                }`}
              >
                {m.body}
              </span>
            </div>
          ))
        )}
      </div>
      <form onSubmit={add} className="mt-2 flex gap-2">
        <select
          value={direction}
          onChange={(e) => setDirection(e.target.value)}
          className="rounded-lg border border-slate-300 px-2 text-sm"
        >
          <option value="out">Nós</option>
          <option value="in">Lead</option>
        </select>
        <Input value={body} placeholder="Registrar mensagem…" onChange={(e) => setBody(e.target.value)} />
        <Button type="submit" disabled={sending}>Registrar</Button>
      </form>
    </div>
  );
}

function WhatsAppPanel({ lead, onChange }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const windowOpen =
    lead.last_inbound_at && Date.now() - new Date(lead.last_inbound_at).getTime() < 24 * 3600 * 1000;

  async function toggleOptIn() {
    setBusy(true);
    try {
      await api.optIn(lead.id, !lead.opt_in);
      await onChange();
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (!text.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      await api.sendWhatsapp(lead.id, { text });
      setText('');
      setMsg({ ok: true, text: 'Mensagem enviada pela Cloud API.' });
      await onChange();
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">WhatsApp oficial (Cloud API)</p>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${windowOpen ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
          {windowOpen ? 'janela 24h aberta' : 'janela 24h fechada'}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2 text-sm">
        <span className="text-slate-500">Opt-in:</span>
        <span className={lead.opt_in ? 'font-medium text-emerald-600' : 'text-slate-400'}>{lead.opt_in ? 'sim' : 'não'}</span>
        <Button variant="ghost" disabled={busy} onClick={toggleOptIn}>
          {lead.opt_in ? 'remover' : 'registrar opt-in'}
        </Button>
      </div>
      <div className="mt-2 flex gap-2">
        <Input
          value={text}
          placeholder={windowOpen ? 'Mensagem livre…' : 'Janela fechada — requer template'}
          disabled={!windowOpen || busy}
          onChange={(e) => setText(e.target.value)}
        />
        <Button disabled={!windowOpen || busy} onClick={send}>Enviar</Button>
      </div>
      {!windowOpen && (
        <p className="mt-1 text-[11px] text-slate-400">
          Fora da janela de 24h só dá para iniciar com template aprovado pela Meta.
        </p>
      )}
      {msg && <p className={`mt-1 text-sm ${msg.ok ? 'text-emerald-600' : 'text-rose-600'}`}>{msg.text}</p>}
    </div>
  );
}

function LeadDetail({ id, onClose, onMutated }) {
  const [lead, setLead] = useState(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState(null);
  const [qualifyResult, setQualifyResult] = useState(null);

  async function load() {
    setLead(await api.getLead(id));
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  async function changeStatus(status) {
    setBusy(true);
    try {
      await api.updateLead(id, { status });
      await load();
      onMutated();
    } finally {
      setBusy(false);
    }
  }

  async function qualify() {
    setBusy(true);
    setQualifyResult(null);
    try {
      const r = await api.qualifyLead(id);
      setQualifyResult(r.qualification);
      await load();
      onMutated();
    } finally {
      setBusy(false);
    }
  }

  async function genDraft() {
    setBusy(true);
    try {
      setDraft(await api.draftMessage(id));
    } finally {
      setBusy(false);
    }
  }

  async function assign() {
    setBusy(true);
    try {
      const r = await api.assignLead(id);
      await load();
      onMutated();
      if (r.notifyLink) window.open(r.notifyLink, '_blank');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm('Excluir este lead?')) return;
    await api.deleteLead(id);
    onMutated();
    onClose();
  }

  if (!lead) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between border-b border-slate-100 p-5">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">{lead.name}</h2>
          <div className="mt-1 flex items-center gap-2">
            <StatusBadge status={lead.status} />
            <span className="text-sm text-slate-500">{lead.segment || 'sem segmento'}</span>
          </div>
        </div>
        <Button variant="ghost" onClick={onClose}>✕</Button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div><dt className="text-slate-400">Telefone</dt><dd className="text-slate-700">{lead.phone || '—'}</dd></div>
          <div><dt className="text-slate-400">Bairro / cidade</dt><dd className="text-slate-700">{[lead.neighborhood, lead.city].filter(Boolean).join(' — ')}</dd></div>
          <div><dt className="text-slate-400">Fonte</dt><dd className="text-slate-700">{lead.source}</dd></div>
          <div>
            <dt className="text-slate-400">Site próprio?</dt>
            <dd className="text-slate-700">
              {lead.has_website === null ? 'não verificado' : lead.has_website ? `sim (${lead.website_url || 'detectado'})` : 'não'}
            </dd>
          </div>
        </dl>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Ações</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" disabled={busy} onClick={qualify}>Verificar site</Button>
            <Button variant="secondary" disabled={busy} onClick={genDraft}>Gerar rascunho</Button>
            <Button variant="secondary" disabled={busy} onClick={assign}>Atribuir (rodízio)</Button>
            {TRANSITIONS[lead.status].map((s) => (
              <Button key={s} disabled={busy} onClick={() => changeStatus(s)}>
                → {STATUS_LABELS[s]}
              </Button>
            ))}
            <Button variant="danger" disabled={busy} onClick={remove}>Excluir</Button>
          </div>
        </div>

        {qualifyResult && (
          <Card className="bg-slate-50 p-3 text-sm">
            <p className="font-medium text-slate-700">
              Resultado: {qualifyResult.confidence === 'low'
                ? 'inconclusivo (configure a SerpAPI)'
                : qualifyResult.hasWebsite ? 'tem site próprio' : 'sem site próprio ✅'}
            </p>
            {qualifyResult.evidence?.length > 0 && (
              <ul className="mt-1 list-inside list-disc text-xs text-slate-500">
                {qualifyResult.evidence.map((e) => <li key={e} className="truncate">{e}</li>)}
              </ul>
            )}
          </Card>
        )}

        {draft && (
          <Card className="bg-indigo-50 p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-500">
                Rascunho ({draft.source === 'ai' ? 'IA' : 'template'})
              </p>
              <Button variant="ghost" onClick={() => navigator.clipboard.writeText(draft.draft)}>copiar</Button>
            </div>
            <p className="mt-1 text-sm text-slate-700">{draft.draft}</p>
            <p className="mt-1 text-[11px] text-slate-400">Revise e envie manualmente pelo seu WhatsApp.</p>
          </Card>
        )}

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Conversa</p>
          <MessageLog lead={lead} onChange={async () => { await load(); onMutated(); }} />
        </div>

        <WhatsAppPanel lead={lead} onChange={async () => { await load(); onMutated(); }} />
      </div>
    </div>
  );
}

export default function Leads() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const status = searchParams.get('status') || '';
  const [selected, setSelected] = useState(null);
  const [showNew, setShowNew] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setLeads(await api.listLeads({ status, q }));
    } finally {
      setLoading(false);
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [status]);

  function setStatus(s) {
    const next = new URLSearchParams(searchParams);
    if (s) next.set('status', s); else next.delete('status');
    setSearchParams(next);
  }

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Leads</h1>
          <p className="text-sm text-slate-500">Pipeline de prospecção.</p>
        </div>
        <Button onClick={() => setShowNew(true)}>+ Novo lead</Button>
      </header>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <form
            onSubmit={(e) => { e.preventDefault(); load(); }}
            className="flex flex-1 gap-2"
          >
            <Input placeholder="Buscar por nome ou segmento…" value={q} onChange={(e) => setQ(e.target.value)} />
            <Button variant="secondary" type="submit">Buscar</Button>
          </form>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {STATUS_FILTERS.map((s) => (
              <option key={s} value={s}>{s ? STATUS_LABELS[s] : 'Todos os status'}</option>
            ))}
          </select>
        </div>
      </Card>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner className="h-6 w-6" /></div>
      ) : leads.length === 0 ? (
        <EmptyState title="Nenhum lead encontrado">
          Use a aba <strong>Coletar</strong> para buscar negócios sem site, ou crie um lead manualmente.
        </EmptyState>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-2 font-medium">Negócio</th>
                <th className="px-4 py-2 font-medium">Segmento</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Site?</th>
                <th className="px-4 py-2 font-medium">Telefone</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {leads.map((l) => (
                <tr
                  key={l.id}
                  onClick={() => setSelected(l.id)}
                  className="cursor-pointer hover:bg-indigo-50/40"
                >
                  <td className="px-4 py-2.5 font-medium text-slate-700">{l.name}</td>
                  <td className="px-4 py-2.5 text-slate-500">{l.segment || '—'}</td>
                  <td className="px-4 py-2.5"><StatusBadge status={l.status} /></td>
                  <td className="px-4 py-2.5 text-slate-500">
                    {l.has_website === null ? '—' : l.has_website ? 'sim' : 'não'}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">{l.phone || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Slide-over de detalhe */}
      {selected && (
        <div className="fixed inset-0 z-20 flex justify-end bg-slate-900/30" onClick={() => setSelected(null)}>
          <div
            className="h-full w-full max-w-lg bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <LeadDetail
              id={selected}
              onClose={() => setSelected(null)}
              onMutated={load}
            />
          </div>
        </div>
      )}

      {/* Modal novo lead */}
      {showNew && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/30 p-4" onClick={() => setShowNew(false)}>
          <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <Card className="p-5">
              <h2 className="mb-4 text-lg font-semibold text-slate-800">Novo lead</h2>
              <NewLeadForm
                onClose={() => setShowNew(false)}
                onCreated={() => { setShowNew(false); load(); }}
              />
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

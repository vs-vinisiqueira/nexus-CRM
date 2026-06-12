import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Button, Card, Field, Input, Spinner } from '../components/ui.jsx';

const KEYS = [
  {
    key: 'SERPAPI_KEY',
    label: 'SerpAPI',
    desc: 'Habilita a coleta de leads (Google Search + Maps) e a verificação de site. Obtenha em serpapi.com.',
  },
  {
    key: 'ANTHROPIC_API_KEY',
    label: 'Anthropic (Claude)',
    desc: 'Habilita rascunhos de mensagem gerados por IA. Sem a chave, usa um template. Obtenha em console.anthropic.com.',
  },
  {
    key: 'WHATSAPP_TOKEN',
    label: 'WhatsApp Cloud API — Access Token',
    desc: 'Token de acesso da WhatsApp Business Platform (Meta). Necessário para enviar mensagens oficiais.',
  },
  {
    key: 'WHATSAPP_PHONE_ID',
    label: 'WhatsApp Cloud API — Phone Number ID',
    desc: 'ID do número (não o número em si) da sua WhatsApp Business Account.',
  },
  {
    key: 'WHATSAPP_VERIFY_TOKEN',
    label: 'WhatsApp Cloud API — Verify Token',
    desc: 'Token que você escolhe e informa também no painel da Meta ao configurar o webhook (URL: /api/webhook).',
  },
];

function KeyRow({ item, status, onSaved }) {
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(null);

  async function save() {
    setSaving(true);
    setSavedMsg(null);
    try {
      await api.putSetting(item.key, value);
      setValue('');
      setSavedMsg(value ? 'Chave salva.' : 'Override removido.');
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  const configured = status?.configured;

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-slate-800">{item.label}</p>
          <p className="mt-0.5 max-w-xl text-sm text-slate-500">{item.desc}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${configured ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
          {configured ? `configurada (${status.source})` : 'não configurada'}
        </span>
      </div>
      <div className="mt-3 flex items-end gap-2">
        <Field label="Nova chave">
          <Input
            type="password"
            value={value}
            placeholder={configured ? '•••••••• (já configurada)' : 'cole a chave aqui'}
            onChange={(e) => setValue(e.target.value)}
          />
        </Field>
        <Button className="mb-px" disabled={saving || !value} onClick={save}>
          {saving ? 'Salvando…' : 'Salvar'}
        </Button>
      </div>
      {savedMsg && <p className="mt-2 text-sm text-emerald-600">{savedMsg}</p>}
    </Card>
  );
}

export default function Settings() {
  const [status, setStatus] = useState(null);

  async function load() {
    setStatus(await api.getSettings());
  }
  useEffect(() => { load(); }, []);

  if (!status) return <div className="flex justify-center py-20"><Spinner className="h-6 w-6" /></div>;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold text-slate-800">Configurações</h1>
        <p className="text-sm text-slate-500">
          Cadastre as chaves de API. Ficam salvas no banco e podem ser adicionadas a qualquer momento.
        </p>
      </header>

      {KEYS.map((item) => (
        <KeyRow key={item.key} item={item} status={status[item.key]} onSaved={load} />
      ))}

      <p className="text-xs text-slate-400">
        Observação de segurança: as chaves são guardadas no banco em texto. Para produção, restrinja o acesso ao
        banco e considere cifrar os valores sensíveis em repouso.
      </p>
    </div>
  );
}

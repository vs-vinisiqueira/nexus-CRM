/** Cliente fino da API Nexus. Usa o proxy do Vite (/api -> backend:3001). */

const TOKEN_KEY = 'nexus_token';

export const auth = {
  get token() {
    return localStorage.getItem(TOKEN_KEY);
  },
  set(token) {
    localStorage.setItem(TOKEN_KEY, token);
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
  },
};

async function req(method, path, body) {
  const hadToken = Boolean(auth.token);
  const headers = {};
  if (body) headers['content-type'] = 'application/json';
  if (hadToken) headers.authorization = `Bearer ${auth.token}`;

  const res = await fetch(path, {
    method,
    headers: Object.keys(headers).length ? headers : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  // Só tratamos 401 como "sessão expirou" quando havia um token. Um 401 numa
  // tentativa de login (sem token) é credencial errada — quem chamou trata o erro.
  if (res.status === 401 && hadToken) {
    auth.clear();
    window.dispatchEvent(new Event('nexus-unauthorized'));
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.payload = data;
    throw err;
  }
  return data;
}

export const api = {
  // auth
  login: async (username, password) => {
    const data = await req('POST', '/api/auth/login', { username, password });
    if (!data || !data.token) {
      throw new Error('Resposta de login inválida do servidor.');
    }
    auth.set(data.token);
    return data.user;
  },
  logout: async () => {
    try {
      await req('POST', '/api/auth/logout');
    } catch {
      /* sessão já pode ter expirado */
    }
    auth.clear();
  },
  me: () => req('GET', '/api/auth/me'),

  // stats
  stats: () => req('GET', '/api/stats'),

  // leads
  listLeads: (params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v != null && v !== '')
    ).toString();
    return req('GET', `/api/leads${qs ? `?${qs}` : ''}`);
  },
  getLead: (id) => req('GET', `/api/leads/${id}`),
  createLead: (data) => req('POST', '/api/leads', data),
  updateLead: (id, data) => req('PATCH', `/api/leads/${id}`, data),
  deleteLead: (id) => req('DELETE', `/api/leads/${id}`),
  qualifyLead: (id) => req('POST', `/api/leads/${id}/qualify`),
  draftMessage: (id) => req('POST', `/api/leads/${id}/draft`),
  addMessage: (id, data) => req('POST', `/api/leads/${id}/messages`, data),
  assignLead: (id, data = {}) => req('POST', `/api/leads/${id}/assign`, data),

  // whatsapp cloud api
  optIn: (id, opted) => req('POST', `/api/leads/${id}/opt-in`, { opted }),
  sendWhatsapp: (id, payload) => req('POST', `/api/leads/${id}/whatsapp/send`, payload),

  // atendentes
  listAttendants: () => req('GET', '/api/attendants'),
  createAttendant: (data) => req('POST', '/api/attendants', data),
  updateAttendant: (id, data) => req('PATCH', `/api/attendants/${id}`, data),
  deleteAttendant: (id) => req('DELETE', `/api/attendants/${id}`),

  // coleta
  collect: (data) => req('POST', '/api/collect', data),

  // settings
  getSettings: () => req('GET', '/api/settings'),
  putSetting: (key, value) => req('PUT', `/api/settings/${key}`, { value }),
};

export const STATUS_LABELS = {
  pendente: 'Pendente',
  qualificado: 'Qualificado',
  contatado: 'Contatado',
  respondeu: 'Respondeu',
  convertido: 'Convertido',
  descartado: 'Descartado',
};

export const STATUS_COLORS = {
  pendente: 'bg-slate-200 text-slate-700',
  qualificado: 'bg-blue-100 text-blue-700',
  contatado: 'bg-amber-100 text-amber-700',
  respondeu: 'bg-emerald-100 text-emerald-700',
  convertido: 'bg-violet-100 text-violet-700',
  descartado: 'bg-rose-100 text-rose-600',
};

// Transições permitidas (espelha o backend) para montar os botões de ação.
export const TRANSITIONS = {
  pendente: ['qualificado', 'descartado'],
  qualificado: ['contatado', 'descartado'],
  contatado: ['respondeu', 'descartado'],
  respondeu: ['convertido', 'descartado'],
  convertido: [],
  descartado: ['pendente'],
};

/**
 * Smoke-test de ponta a ponta da API Nexus. Requer o servidor rodando e o banco
 * migrado. Uso: node scripts/smoke.mjs [baseUrl]
 */
const base = process.argv[2] || 'http://localhost:3001';

let passed = 0;
let failed = 0;

async function call(method, path, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, json };
}

function check(label, cond, extra) {
  if (cond) { passed++; console.log(`  PASS  ${label}`); }
  else { failed++; console.log(`  FAIL  ${label}`, extra ? JSON.stringify(extra) : ''); }
}

async function waitForServer() {
  for (let i = 0; i < 20; i++) {
    try {
      const r = await call('GET', '/health');
      if (r.status === 200) return true;
    } catch { /* ainda subindo */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function main() {
  if (!(await waitForServer())) {
    console.error('servidor não respondeu em /health');
    process.exit(1);
  }

  console.log('\n# health & settings');
  check('GET /health', (await call('GET', '/health')).json?.ok === true);
  const settings = await call('GET', '/api/settings');
  check('GET /api/settings', settings.status === 200 && 'SERPAPI_KEY' in settings.json, settings.json);

  console.log('\n# atendentes');
  const a1 = await call('POST', '/api/attendants', { name: 'Ana', whatsapp: '11988887777' });
  const a2 = await call('POST', '/api/attendants', { name: 'Bruno', whatsapp: '11977776666' });
  check('POST atendente Ana', a1.status === 201 && a1.json.id, a1.json);
  check('POST atendente Bruno', a2.status === 201, a2.json);
  const attendants = await call('GET', '/api/attendants');
  check('GET atendentes >= 2', Array.isArray(attendants.json) && attendants.json.length >= 2);

  console.log('\n# leads — CRUD e pipeline');
  const lead = await call('POST', '/api/leads', {
    name: 'Salão Beleza Pura', segment: 'salão de beleza', phone: '11955554444',
    source: 'google_search', neighborhood: 'Vila Galvão',
  });
  check('POST lead', lead.status === 201 && lead.json.status === 'pendente', lead.json);
  const id = lead.json.id;

  const dup = await call('POST', '/api/leads', { name: 'Dup', phone: '11955554444' });
  check('POST lead duplicado -> 409', dup.status === 409, dup.json);

  // transição inválida: pendente -> convertido
  const badT = await call('PATCH', `/api/leads/${id}`, { status: 'convertido' });
  check('transição inválida bloqueada', badT.status === 409, badT.json);

  // transição válida: pendente -> qualificado -> contatado
  const t1 = await call('PATCH', `/api/leads/${id}`, { status: 'qualificado' });
  check('pendente -> qualificado', t1.status === 200 && t1.json.status === 'qualificado', t1.json);
  const t2 = await call('PATCH', `/api/leads/${id}`, { status: 'contatado' });
  check('qualificado -> contatado', t2.status === 200 && t2.json.status === 'contatado', t2.json);

  console.log('\n# rascunho (fallback template, sem chave de IA)');
  const draft = await call('POST', `/api/leads/${id}/draft`);
  check('POST draft', draft.status === 200 && draft.json.source === 'template' && draft.json.draft?.length > 0, draft.json);

  console.log('\n# mensagens — resposta do lead promove a "respondeu"');
  await call('POST', `/api/leads/${id}/messages`, { direction: 'out', body: 'Olá!' });
  const inMsg = await call('POST', `/api/leads/${id}/messages`, { direction: 'in', body: 'Oi, tenho interesse' });
  check('POST mensagem in', inMsg.status === 201, inMsg.json);
  const afterMsg = await call('GET', `/api/leads/${id}`);
  check('status auto -> respondeu', afterMsg.json.status === 'respondeu', afterMsg.json.status);
  check('histórico tem 2 mensagens', afterMsg.json.messages?.length === 2);

  console.log('\n# atribuição por rodízio');
  const assign1 = await call('POST', `/api/leads/${id}/assign`);
  check('POST assign -> atendente', assign1.status === 200 && assign1.json.attendant?.name, assign1.json);
  check('briefing gerado', typeof assign1.json.briefing === 'string' && assign1.json.briefing.includes('Lead quente'), assign1.json);
  check('link wa.me do lead', /^https:\/\/wa\.me\/55/.test(assign1.json.leadContactLink || ''), assign1.json.leadContactLink);

  console.log('\n# rodízio justo: segundo lead vai para o outro atendente');
  const lead2 = await call('POST', '/api/leads', { name: 'Clínica Sorriso', phone: '11944443333' });
  await call('PATCH', `/api/leads/${lead2.json.id}`, { status: 'qualificado' });
  await call('PATCH', `/api/leads/${lead2.json.id}`, { status: 'contatado' });
  await call('POST', `/api/leads/${lead2.json.id}/messages`, { direction: 'in', body: 'quero saber mais' });
  const assign2 = await call('POST', `/api/leads/${lead2.json.id}/assign`);
  check('segundo assign -> atendente diferente',
    assign1.json.attendant?.id !== assign2.json.attendant?.id,
    { a1: assign1.json.attendant?.name, a2: assign2.json.attendant?.name });

  console.log('\n# coleta sem chave -> configured:false');
  const collect = await call('POST', '/api/collect', { segment: 'restaurante', neighborhood: 'Centro' });
  check('POST collect sem chave', collect.status === 200 && collect.json.configured === false, collect.json);

  console.log('\n# stats');
  const stats = await call('GET', '/api/stats');
  check('GET stats', stats.status === 200 && typeof stats.json.total === 'number' && stats.json.hotLeads, stats.json);

  console.log('\n# WhatsApp Cloud API — webhook, opt-in e travas de conformidade');

  // Handshake de verificação do webhook
  await call('PUT', '/api/settings/WHATSAPP_VERIFY_TOKEN', { value: 'verify-123' });
  const hs = await call('GET', '/api/webhook?hub.mode=subscribe&hub.verify_token=verify-123&hub.challenge=42');
  check('webhook verify ok -> devolve challenge', hs.status === 200 && Number(hs.json) === 42, hs);
  const hsBad = await call('GET', '/api/webhook?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=42');
  check('webhook verify token errado -> 403', hsBad.status === 403, hsBad);

  // Lead em 'contatado' para testar inbound + transição
  const wlead = await call('POST', '/api/leads', { name: 'Pizzaria do Zé', phone: '11933332222' });
  await call('PATCH', `/api/leads/${wlead.json.id}`, { status: 'qualificado' });
  await call('PATCH', `/api/leads/${wlead.json.id}`, { status: 'contatado' });

  // Envio sem Cloud API configurada -> 409
  const sendNoCfg = await call('POST', `/api/leads/${wlead.json.id}/whatsapp/send`, { text: 'oi' });
  check('send sem config -> 409', sendNoCfg.status === 409, sendNoCfg.json);

  // Webhook recebe mensagem do lead
  const inbound = {
    object: 'whatsapp_business_account',
    entry: [{ changes: [{ field: 'messages', value: {
      messaging_product: 'whatsapp',
      messages: [{ from: '5511933332222', id: 'wamid.TESTE', type: 'text', text: { body: 'tenho interesse' } }],
    } }] }],
  };
  const wh = await call('POST', '/api/webhook', inbound);
  check('webhook POST -> 200', wh.status === 200, wh);
  const afterWh = await call('GET', `/api/leads/${wlead.json.id}`);
  check('inbound gravou mensagem whatsapp_cloud',
    (afterWh.json.messages || []).some((m) => m.channel === 'whatsapp_cloud' && m.direction === 'in'),
    afterWh.json.messages);
  check('inbound abriu a janela (last_inbound_at)', Boolean(afterWh.json.last_inbound_at), afterWh.json.last_inbound_at);
  check('inbound promoveu contatado -> respondeu', afterWh.json.status === 'respondeu', afterWh.json.status);

  // Configura credenciais dummy para testar as travas (que rodam ANTES da rede)
  await call('PUT', '/api/settings/WHATSAPP_TOKEN', { value: 'dummy-token' });
  await call('PUT', '/api/settings/WHATSAPP_PHONE_ID', { value: '000000' });

  // Template sem opt-in -> 409
  const tplNoOptin = await call('POST', `/api/leads/${wlead.json.id}/whatsapp/send`, { template: { name: 'boas_vindas' } });
  check('template sem opt-in -> 409', tplNoOptin.status === 409, tplNoOptin.json);

  // Opt-in
  const optin = await call('POST', `/api/leads/${wlead.json.id}/opt-in`, { opted: true });
  check('opt-in registrado', optin.status === 200 && optin.json.opt_in === true, optin.json);

  // Texto livre com janela fechada (lead sem inbound) -> 409
  const wlead2 = await call('POST', '/api/leads', { name: 'Bar do Tião', phone: '11922221111' });
  const closed = await call('POST', `/api/leads/${wlead2.json.id}/whatsapp/send`, { text: 'oi' });
  check('texto livre com janela fechada -> 409', closed.status === 409 && /janela/.test(closed.json.error || ''), closed.json);

  // Limpa credenciais dummy
  await call('PUT', '/api/settings/WHATSAPP_TOKEN', { value: '' });
  await call('PUT', '/api/settings/WHATSAPP_PHONE_ID', { value: '' });

  console.log(`\n=== ${passed} passaram, ${failed} falharam ===`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });

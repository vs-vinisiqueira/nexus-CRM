import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// --- Stubs do ambiente de browser (localStorage / window / fetch) ---
function installStubs() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  const events = [];
  globalThis.window = { dispatchEvent: (e) => events.push(e.type) };
  globalThis.__events = events;
}

let nextResponse;
globalThis.fetch = async (path, opts) => {
  globalThis.__lastFetch = { path, opts };
  return nextResponse;
};

function respond({ status = 200, ok = status < 400, json = {} } = {}) {
  nextResponse = { status, ok, json: async () => json };
}

// Importa depois de garantir que os globais existem (módulo não os usa no load).
installStubs();
const { api, auth } = await import('../src/api.js');

beforeEach(() => {
  installStubs();
  globalThis.__lastFetch = undefined;
});

test('login com sucesso guarda o token e devolve o usuário', async () => {
  respond({ json: { token: 'tok-123', user: { username: 'admin' } } });
  const user = await api.login('admin', 'admin');
  assert.deepEqual(user, { username: 'admin' });
  assert.equal(auth.token, 'tok-123');
});

test('login com resposta sem token lança erro e NÃO guarda token', async () => {
  respond({ json: {} }); // 200 mas sem token (fix #6)
  await assert.rejects(() => api.login('admin', 'admin'), /Resposta de login inválida/);
  assert.equal(auth.token, null);
});

test('requisição autenticada anexa o header Authorization: Bearer', async () => {
  auth.set('meu-token');
  respond({ json: { ok: true } });
  await api.stats();
  assert.equal(globalThis.__lastFetch.opts.headers.authorization, 'Bearer meu-token');
});

test('401 COM token: limpa o token e dispara nexus-unauthorized', async () => {
  auth.set('token-vivo');
  respond({ status: 401, json: { error: 'não autenticado' } });
  await assert.rejects(() => api.stats());
  assert.equal(auth.token, null);
  assert.ok(globalThis.__events.includes('nexus-unauthorized'));
});

test('401 SEM token (falha de login): NÃO dispara nexus-unauthorized (fix #4)', async () => {
  // sem token previamente
  respond({ status: 401, json: { error: 'credenciais inválidas' } });
  await assert.rejects(() => api.login('admin', 'errada'), (err) => err.status === 401);
  assert.equal(globalThis.__events.includes('nexus-unauthorized'), false);
  assert.equal(auth.token, null);
});

test('204 No Content devolve null sem tentar parsear JSON', async () => {
  auth.set('t');
  respond({ status: 204, ok: true, json: { naoDeveSerLido: true } });
  const out = await api.logout(); // logout chama req e depois auth.clear()
  assert.equal(out, undefined); // logout não retorna valor
  assert.equal(auth.token, null); // limpou o token localmente
});

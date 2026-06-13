import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, bearerToken } from '../src/services/auth.js';

test('hashPassword gera o formato "salt:hash" (16 bytes salt, 64 bytes hash, em hex)', async () => {
  const stored = await hashPassword('senha-secreta');
  assert.match(stored, /^[0-9a-f]{32}:[0-9a-f]{128}$/);
});

test('hashPassword usa salt aleatório (dois hashes da mesma senha diferem)', async () => {
  const a = await hashPassword('mesma-senha');
  const b = await hashPassword('mesma-senha');
  assert.notEqual(a, b);
});

test('verifyPassword aceita a senha correta', async () => {
  const stored = await hashPassword('correta-123');
  assert.equal(await verifyPassword('correta-123', stored), true);
});

test('verifyPassword rejeita a senha errada', async () => {
  const stored = await hashPassword('correta-123');
  assert.equal(await verifyPassword('errada-123', stored), false);
});

test('verifyPassword rejeita stored malformado (sem ":")', async () => {
  assert.equal(await verifyPassword('x', 'sem-dois-pontos'), false);
});

test('verifyPassword rejeita stored vazio / nulo', async () => {
  assert.equal(await verifyPassword('x', ''), false);
  assert.equal(await verifyPassword('x', null), false);
  assert.equal(await verifyPassword('x', undefined), false);
});

test('verifyPassword rejeita quando o hash tem tamanho diferente (não quebra timingSafeEqual)', async () => {
  // salt válido em hex, mas hash curto -> length mismatch deve retornar false, não lançar.
  const stored = 'aabbccddeeff00112233445566778899:deadbeef';
  assert.equal(await verifyPassword('qualquer', stored), false);
});

test('bearerToken extrai o token de "Authorization: Bearer <token>"', () => {
  const req = { headers: { authorization: 'Bearer abc123' } };
  assert.equal(bearerToken(req), 'abc123');
});

test('bearerToken retorna null sem header ou com esquema diferente', () => {
  assert.equal(bearerToken({ headers: {} }), null);
  assert.equal(bearerToken({ headers: { authorization: 'Basic abc' } }), null);
  assert.equal(bearerToken({ headers: { authorization: 'bearer abc' } }), null); // case-sensitive
});

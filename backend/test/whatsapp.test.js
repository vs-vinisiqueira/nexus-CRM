import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhoneBR, buildWaMeLink } from '../src/utils/whatsapp.js';

test('normaliza número com DDD (11 dígitos -> prefixa 55)', () => {
  assert.equal(normalizePhoneBR('11987654321'), '5511987654321');
});

test('normaliza número fixo com DDD (10 dígitos -> prefixa 55)', () => {
  assert.equal(normalizePhoneBR('1133334444'), '551133334444');
});

test('mantém número que já vem com código do país (55 + 11 dígitos)', () => {
  assert.equal(normalizePhoneBR('5511987654321'), '5511987654321');
});

test('remove máscara/formatação e normaliza', () => {
  assert.equal(normalizePhoneBR('+55 (11) 98765-4321'), '5511987654321');
});

test('remove zero de tronco à esquerda', () => {
  assert.equal(normalizePhoneBR('011987654321'), '5511987654321');
});

test('retorna null para entradas implausíveis', () => {
  assert.equal(normalizePhoneBR(''), null);
  assert.equal(normalizePhoneBR(null), null);
  assert.equal(normalizePhoneBR('123'), null);
  assert.equal(normalizePhoneBR('99999999999999999'), null);
});

test('buildWaMeLink monta o link sem texto', () => {
  assert.equal(buildWaMeLink('11987654321'), 'https://wa.me/5511987654321');
});

test('buildWaMeLink anexa o texto com encode de URL', () => {
  const link = buildWaMeLink('11987654321', 'Olá, tudo bem?');
  assert.equal(link, 'https://wa.me/5511987654321?text=Ol%C3%A1%2C%20tudo%20bem%3F');
});

test('buildWaMeLink retorna null para telefone inválido', () => {
  assert.equal(buildWaMeLink('123', 'oi'), null);
});

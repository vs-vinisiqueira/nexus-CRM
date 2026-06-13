import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isOwnSite } from '../src/services/leadQualifier.js';

test('considera site próprio um domínio comum do negócio', () => {
  assert.equal(isOwnSite('https://padariadobairro.com.br'), true);
  assert.equal(isOwnSite('http://www.salao-da-ana.com'), true);
});

test('NÃO considera site próprio redes sociais e agregadores', () => {
  assert.equal(isOwnSite('https://instagram.com/negocio'), false);
  assert.equal(isOwnSite('https://www.facebook.com/negocio'), false);
  assert.equal(isOwnSite('https://www.ifood.com.br/delivery/negocio'), false);
  assert.equal(isOwnSite('https://maps.google.com/?q=negocio'), false);
  assert.equal(isOwnSite('https://wa.me/5511999999999'), false);
});

test('trata subdomínios de agregadores como não-próprios', () => {
  assert.equal(isOwnSite('https://loja.booking.com/x'), false);
  assert.equal(isOwnSite('https://m.facebook.com/negocio'), false);
});

test('ignora o prefixo www ao comparar', () => {
  assert.equal(isOwnSite('https://www.instagram.com/negocio'), false);
});

test('um domínio que apenas contém o nome de um agregador NÃO é falso-positivo', () => {
  // "meuinstagram.com" não é instagram.com nem termina em ".instagram.com"
  assert.equal(isOwnSite('https://meuinstagram.com.br'), true);
});

test('retorna false para URL inválida', () => {
  assert.equal(isOwnSite('not a url'), false);
  assert.equal(isOwnSite(''), false);
});

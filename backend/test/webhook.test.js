import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { verifyMetaSignature } from '../src/routes/webhook.js';

const SECRET = 'app-secret-de-teste';

/** Monta um req falso com corpo cru e cabeçalho de assinatura. */
function fakeReq(rawBody, signatureHeader) {
  return {
    rawBody: rawBody == null ? rawBody : Buffer.from(rawBody),
    get(name) {
      return name.toLowerCase() === 'x-hub-signature-256' ? signatureHeader : undefined;
    },
  };
}

function sign(rawBody, secret) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(Buffer.from(rawBody)).digest('hex');
}

test('aceita assinatura válida sobre o corpo cru exato', () => {
  const body = JSON.stringify({ entry: [{ id: '1' }] });
  assert.equal(verifyMetaSignature(fakeReq(body, sign(body, SECRET)), SECRET), true);
});

test('rejeita assinatura forjada (hex arbitrário)', () => {
  const body = JSON.stringify({ entry: [] });
  assert.equal(verifyMetaSignature(fakeReq(body, 'sha256=deadbeef'), SECRET), false);
});

test('rejeita assinatura feita com outro segredo', () => {
  const body = JSON.stringify({ entry: [] });
  const sig = sign(body, 'segredo-do-atacante');
  assert.equal(verifyMetaSignature(fakeReq(body, sig), SECRET), false);
});

test('rejeita quando o corpo foi adulterado após a assinatura', () => {
  const original = JSON.stringify({ entry: [{ status: 'ok' }] });
  const sig = sign(original, SECRET);
  const tampered = JSON.stringify({ entry: [{ status: 'forjado' }] });
  assert.equal(verifyMetaSignature(fakeReq(tampered, sig), SECRET), false);
});

test('rejeita sem cabeçalho de assinatura', () => {
  const body = JSON.stringify({ entry: [] });
  assert.equal(verifyMetaSignature(fakeReq(body, undefined), SECRET), false);
});

test('rejeita cabeçalho sem o prefixo "sha256="', () => {
  const body = JSON.stringify({ entry: [] });
  const raw = crypto.createHmac('sha256', SECRET).update(Buffer.from(body)).digest('hex');
  assert.equal(verifyMetaSignature(fakeReq(body, raw), SECRET), false);
});

test('rejeita quando não há corpo cru capturado', () => {
  assert.equal(verifyMetaSignature(fakeReq(null, sign('{}', SECRET)), SECRET), false);
});

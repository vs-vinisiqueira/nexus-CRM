/**
 * Autenticação do dashboard: hash de senha (scrypt) e sessões opacas em banco.
 * Usa apenas o módulo `crypto` nativo — sem dependências externas.
 */
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { query } from '../db/pool.js';

// scrypt assíncrono: roda no thread pool do libuv e NÃO bloqueia o event loop.
const scrypt = promisify(crypto.scrypt);

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

/** Gera "salt:hash" para guardar no banco. */
export async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = (await scrypt(password, salt, 64)).toString('hex');
  return `${salt}:${hash}`;
}

/** Compara senha em texto com o "salt:hash" guardado (tempo constante). */
export async function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = await scrypt(password, salt, 64);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

/** Cria uma sessão e devolve o token opaco. */
export async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await query('INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)', [
    token,
    userId,
    expiresAt,
  ]);
  // Limpeza oportunista de sessões expiradas — mantém a tabela enxuta sem precisar de cron.
  query('DELETE FROM sessions WHERE expires_at < now()').catch((err) =>
    console.warn('[auth] limpeza de sessões expiradas falhou:', err.message)
  );
  return { token, expiresAt };
}

/** Resolve o usuário de um token de sessão válido (não expirado). */
export async function getSessionUser(token) {
  if (!token) return null;
  const { rows } = await query(
    `SELECT u.id, u.username, u.role
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token = $1 AND s.expires_at > now()`,
    [token]
  );
  return rows[0] || null;
}

export async function deleteSession(token) {
  if (token) await query('DELETE FROM sessions WHERE token = $1', [token]);
}

/** Cria o usuário admin inicial se ainda não houver nenhum usuário. */
export async function seedAdminIfEmpty() {
  // Checagem barata para o caso comum (já populado): evita calcular o hash à toa.
  const { rows } = await query('SELECT COUNT(*)::int AS c FROM users');
  if (rows[0].c > 0) return null;
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'admin';
  // ON CONFLICT torna o seed atômico: se dois migrates correrem em paralelo,
  // o segundo vira no-op (rowCount 0) em vez de quebrar com unique_violation.
  const { rowCount } = await query(
    `INSERT INTO users (username, password_hash, role)
     VALUES ($1, $2, 'admin')
     ON CONFLICT (username) DO NOTHING`,
    [username, await hashPassword(password)]
  );
  if (rowCount === 0) return null; // outro processo criou o admin primeiro
  return { username, usedDefaultPassword: !process.env.ADMIN_PASSWORD };
}

export function bearerToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

/** Middleware: exige sessão válida; injeta req.user e req.token. */
export async function requireAuth(req, res, next) {
  try {
    const token = bearerToken(req);
    const user = await getSessionUser(token);
    if (!user) return res.status(401).json({ error: 'não autenticado' });
    req.user = user;
    req.token = token;
    next();
  } catch (err) {
    next(err);
  }
}

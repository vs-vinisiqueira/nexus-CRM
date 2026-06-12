import { Router } from 'express';
import { query } from '../db/pool.js';
import {
  createSession,
  deleteSession,
  requireAuth,
  verifyPassword,
} from '../services/auth.js';

export const authRouter = Router();

/** POST /api/auth/login { username, password } -> { token, user, expiresAt } */
authRouter.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'username e password são obrigatórios' });
    }
    const { rows } = await query('SELECT * FROM users WHERE username = $1', [username]);
    const user = rows[0];
    // Mesma resposta para usuário inexistente ou senha errada (evita enumeração).
    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: 'credenciais inválidas' });
    }
    const { token, expiresAt } = await createSession(user.id);
    res.json({ token, expiresAt, user: { id: user.id, username: user.username, role: user.role } });
  } catch (err) {
    next(err);
  }
});

/** POST /api/auth/logout — encerra a sessão atual. */
authRouter.post('/logout', requireAuth, async (req, res, next) => {
  try {
    await deleteSession(req.token);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

/** GET /api/auth/me — usuário da sessão atual. */
authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

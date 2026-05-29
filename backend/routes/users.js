import express from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { sql } from '../db.js';
import { auth } from '../middleware/auth.js';
import { logActivity } from '../middleware/logger.js';
import { sendStaffInvite } from '../email.js';

const router = express.Router();

function adminOnly(req, res) {
  if (req.user.role !== 'admin') { res.status(403).json({ error: 'Forbidden.' }); return false; }
  return true;
}

// GET /api/users
router.get('/', auth, async (req, res, next) => {
  try {
    if (!adminOnly(req, res)) return;
    const rows = await sql`SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC`;
    res.json(rows);
  } catch (err) {
    console.error('GET /users error:', err);
    next(err);
  }
});

// POST /api/users — direct creation with admin-set password
router.post('/', auth, async (req, res, next) => {
  try {
    if (!adminOnly(req, res)) return;
    const { name, email, password, role } = req.body;
    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'name, email, password, and role are required.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }
    const existing = await sql`SELECT id FROM users WHERE email = ${email}`;
    if (existing[0]) return res.status(409).json({ error: 'A user with that email already exists.' });

    const passwordHash = await bcrypt.hash(password, 12);
    const rows = await sql`
      INSERT INTO users (name, email, password_hash, role)
      VALUES (${name}, ${email}, ${passwordHash}, ${role})
      RETURNING id, name, email, role, created_at
    `;
    await logActivity(req.user.id, req.user.name, req.user.role, 'create_user', 'user', rows[0].id, `Created user ${email}`);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('POST /users error:', err);
    next(err);
  }
});

// POST /api/users/invite — send invite email
router.post('/invite', auth, async (req, res, next) => {
  try {
    if (!adminOnly(req, res)) return;
    const { name, email, role } = req.body;
    if (!name || !email || !role) {
      return res.status(400).json({ error: 'name, email, and role are required.' });
    }
    const existing = await sql`SELECT id FROM users WHERE email = ${email}`;
    if (existing[0]) return res.status(409).json({ error: 'A user with that email already exists.' });

    const plainToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(plainToken).digest('hex');
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours

    await sql`
      INSERT INTO invite_tokens (email, name, role, token_hash, expires_at)
      VALUES (${email}, ${name}, ${role}, ${tokenHash}, ${expiresAt})
    `;
    const inviteLink = `${process.env.FRONTEND_URL}/accept-invite?token=${plainToken}`;
    await sendStaffInvite(email, name, inviteLink);
    await logActivity(req.user.id, req.user.name, req.user.role, 'invite_user', 'user', null, `Invited ${email} as ${role}`);
    res.json({ message: `Invite sent to ${email}` });
  } catch (err) {
    console.error('POST /users/invite error:', err);
    next(err);
  }
});

// PUT /api/users/:id — update name, email, role
router.put('/:id', auth, async (req, res, next) => {
  try {
    if (!adminOnly(req, res)) return;
    const { name, email, role } = req.body;
    if (!name || !email || !role) {
      return res.status(400).json({ error: 'name, email, and role are required.' });
    }
    const rows = await sql`
      UPDATE users SET name = ${name}, email = ${email}, role = ${role}
      WHERE id = ${req.params.id}
      RETURNING id, name, email, role, created_at
    `;
    if (!rows[0]) return res.status(404).json({ error: 'User not found.' });
    await logActivity(req.user.id, req.user.name, req.user.role, 'update_user', 'user', rows[0].id, `Updated user ${email}`);
    res.json(rows[0]);
  } catch (err) {
    console.error('PUT /users/:id error:', err);
    next(err);
  }
});

// PUT /api/users/:id/password — admin sets new password directly
router.put('/:id/password', auth, async (req, res, next) => {
  try {
    if (!adminOnly(req, res)) return;
    const { password } = req.body;
    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const rows = await sql`
      UPDATE users SET password_hash = ${passwordHash}
      WHERE id = ${req.params.id} RETURNING id
    `;
    if (!rows[0]) return res.status(404).json({ error: 'User not found.' });
    await logActivity(req.user.id, req.user.name, req.user.role, 'reset_password', 'user', rows[0].id, 'Admin reset password');
    res.json({ message: 'Password updated.' });
  } catch (err) {
    console.error('PUT /users/:id/password error:', err);
    next(err);
  }
});

// DELETE /api/users/:id
router.delete('/:id', auth, async (req, res, next) => {
  try {
    if (!adminOnly(req, res)) return;
    if (String(req.user.id) === String(req.params.id)) {
      return res.status(400).json({ error: 'You cannot delete your own account.' });
    }
    const rows = await sql`DELETE FROM users WHERE id = ${req.params.id} RETURNING id, email`;
    if (!rows[0]) return res.status(404).json({ error: 'User not found.' });
    await logActivity(req.user.id, req.user.name, req.user.role, 'delete_user', 'user', rows[0].id, `Deleted user ${rows[0].email}`);
    res.json({ message: 'User deleted.' });
  } catch (err) {
    console.error('DELETE /users/:id error:', err);
    next(err);
  }
});

export default router;

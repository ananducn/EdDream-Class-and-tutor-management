import express from 'express';
import bcrypt from 'bcrypt';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { sql } from '../db.js';
import { auth } from '../middleware/auth.js';
import { sendPasswordReset, sendStaffInvite } from '../email.js';

const router = express.Router();

// Throttle the unauthenticated endpoints. bcrypt(12) makes each guess expensive
// but nothing capped how many could be attempted, so a password could be brute
// forced given time. Counted per IP — server.js sets `trust proxy` so that is the
// real client address behind Railway's proxy, not the proxy's own.
//
// Successful logins don't count against the limit, so a staff member who signs in
// correctly is never locked out by someone else's failed attempts from a shared
// office IP.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
});

// Password reset and invite acceptance are also unauthenticated and guessable
// (a token in the body), so they get their own, tighter budget.
const tokenLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again later.' },
});

// POST /api/auth/login
router.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }
  const rows = await sql`SELECT * FROM users WHERE email = ${email}`;
  const user = rows[0];
  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }
  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }
  const token = jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );
  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
});

// GET /api/auth/me
router.get('/me', auth, async (req, res) => {
  const rows = await sql`SELECT id, name, email, role FROM users WHERE id = ${req.user.id}`;
  const user = rows[0];
  if (!user) return res.status(404).json({ error: 'User not found.' });
  res.json(user);
});

// POST /api/auth/forgot-password
router.post('/forgot-password', tokenLimiter, async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required.' });
  }
  const rows = await sql`SELECT id FROM users WHERE email = ${email}`;
  const user = rows[0];
  // Always respond the same — never reveal whether an email exists
  if (user) {
    const plainToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(plainToken).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await sql`
      INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
      VALUES (${user.id}, ${tokenHash}, ${expiresAt})
    `;
    const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${plainToken}`;
    await sendPasswordReset(email, resetLink);
  }
  res.json({ message: 'If that email exists, a reset link has been sent.' });
});

// POST /api/auth/reset-password
router.post('/reset-password', tokenLimiter, async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) {
    return res.status(400).json({ error: 'Token and new password are required.' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const rows = await sql`
    SELECT * FROM password_reset_tokens
    WHERE token_hash = ${tokenHash} AND expires_at > NOW()
  `;
  const resetToken = rows[0];
  if (!resetToken) {
    return res.status(400).json({ error: 'Invalid or expired reset link.' });
  }
  const passwordHash = await bcrypt.hash(newPassword, 12);
  await sql`UPDATE users SET password_hash = ${passwordHash} WHERE id = ${resetToken.user_id}`;
  await sql`DELETE FROM password_reset_tokens WHERE id = ${resetToken.id}`;
  res.json({ message: 'Password updated successfully. Please log in.' });
});

// POST /api/auth/accept-invite
router.post('/accept-invite', tokenLimiter, async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) {
    return res.status(400).json({ error: 'Token and password are required.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const rows = await sql`
    SELECT * FROM invite_tokens
    WHERE token_hash = ${tokenHash} AND expires_at > NOW() AND accepted = false
  `;
  const invite = rows[0];
  if (!invite) {
    return res.status(400).json({ error: 'Invalid or expired invite link.' });
  }
  const passwordHash = await bcrypt.hash(password, 12);
  await sql`
    INSERT INTO users (name, email, password_hash, role)
    VALUES (${invite.name}, ${invite.email}, ${passwordHash}, ${invite.role})
  `;
  await sql`UPDATE invite_tokens SET accepted = true WHERE id = ${invite.id}`;
  res.json({ message: 'Account created. Please log in.' });
});

export default router;

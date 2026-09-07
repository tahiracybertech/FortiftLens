// ============================================================
// FortifyLens Backend — Entry Point
// Node.js + Express server with Firebase Admin SDK
// ============================================================

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();

// SECURITY FIX: nothing in this app was rate-limited before, leaving
// every route (auth, invites, analysis, payments) open to brute-force
// and general abuse. Two tiers:
//   - a generous general limiter on all /api/ traffic
//   - a tighter limiter specifically on auth-adjacent routes, where
//     credential/token guessing is the real risk
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,                  // 300 requests per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,                   // 20 attempts per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again later' },
});

// ─── MIDDLEWARE ───────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
app.use('/api/', generalLimiter);
app.use('/api/auth/', authLimiter);
const paymentRoutes = require('./routes/payments');
app.use(
  '/api/payments/webhook',
  express.raw({ type: 'application/json' })
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// ─── ROUTES ───────────────────────────────────────────────────
const authRoutes        = require('./routes/auth');
const projectRoutes     = require('./routes/projects');
const orgRoutes         = require('./routes/organizations');
const userRoutes        = require('./routes/users');
const analysisRoutes    = require('./routes/analysis');
const teamRoutes        = require('./routes/teams');
const superadminRoutes  = require('./routes/superadmin');
const activityRoutes    = require('./routes/activity');
const invitationRoutes  = require('./routes/invitations');
const apiKeyRoutes      = require('./routes/apiKeys');

app.use('/api/auth',        authRoutes);
app.use('/api/projects',    projectRoutes);
app.use('/api/orgs',        orgRoutes);
app.use('/api/users',       userRoutes);
app.use('/api/analysis',    analysisRoutes);
app.use('/api/teams',       teamRoutes);
app.use('/api/superadmin',  superadminRoutes);
app.use('/api/activity',    activityRoutes);
app.use('/api/invitations', invitationRoutes);
app.use('/api/payments',    paymentRoutes);
app.use('/api/api-keys',    apiKeyRoutes);

// ─── HEALTH CHECK ─────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── 404 HANDLER ──────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ─── GLOBAL ERROR HANDLER ─────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Server Error:', err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// ─── START SERVER ─────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`\n🚀 FortifyLens Backend running on http://localhost:${PORT}`);
  console.log(`📖 Health check: http://localhost:${PORT}/api/health\n`);
});

module.exports = app;
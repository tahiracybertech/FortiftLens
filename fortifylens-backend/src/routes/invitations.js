// ============================================================
// FortifyLens — Invitations Routes (secure org join flow)
//
// SECURITY MODEL (matches this project's actual auth.js):
//   - req.user.{uid, email, role, orgId} is populated by verifyToken
//     (middleware/auth.js) on EVERY request, read fresh from the
//     Firestore users/{uid} profile doc. This codebase does NOT use
//     Firebase custom claims — so orgId/role here are written to that
//     same users/{uid} doc, not to the auth token.
//   - orgId/role are NEVER trusted from request body — only from
//     req.user, which itself only ever comes from a verified ID token
//     + a server-side Firestore read (a client cannot forge this).
//   - Codes are single-use (status flips to 'accepted') and expire
//     after 48h. Lookup uses a collectionGroup query since the org
//     isn't known until the code is resolved.
// ============================================================

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { db } = require('../../config/firebase'); // same module auth.js uses
const { FieldValue } = require('firebase-admin/firestore');
const { verifyToken, requireRole } = require('../middleware/auth'); // adjust path to match your project layout

const INVITE_EXPIRY_MS = 48 * 60 * 60 * 1000; // 48 hours

// SECURITY FIX: invite codes are 6 numeric digits (900,000 possible
// values). With a 48h expiry and no rate limiting, that keyspace is
// brute-forceable well within the validity window. This limiter caps
// guesses per IP; consider also lengthening the code (see note below
// INVITE_EXPIRY_MS usage) for defense in depth.
const inviteAttemptLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,                   // 10 attempts per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many invite attempts, please try again later' },
});

// ── POST /api/invitations  (org_admin only — create + send invite) ──────────
router.post('/', verifyToken, requireRole('org_admin'), async (req, res) => {
  try {
    const orgId = req.user.orgId; // from verified req.user, NOT req.body
    if (!orgId) return res.status(403).json({ error: 'No organization context' });

    const { email, role = 'employee', department } = req.body;
    if (!email) return res.status(400).json({ error: 'email is required' });

    // Cryptographically random 6-digit code — not Math.random() (predictable / lower entropy)
    const inviteCode = crypto.randomInt(100000, 999999).toString();

    const inviteRef = db.collection('organizations').doc(orgId).collection('invitations').doc();
    await inviteRef.set({
      email,
      role,                 // role granted on redeem — admin decides this, not the invitee
      department: department || null,
      inviteCode,
      status: 'pending',    // pending -> accepted | expired | revoked
      createdBy: req.user.uid,
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: new Date(Date.now() + INVITE_EXPIRY_MS),
    });

    // TODO: send email via your existing EmailJS/SMTP integration with inviteCode

    await db.collection('activityLogs').add({
      orgId,
      userId: req.user.uid,
      userName: req.user.email,
      action: `Invited ${email} as ${role}`,
      type: 'info',
      createdAt: FieldValue.serverTimestamp(),
    });

    res.json({ success: true, inviteId: inviteRef.id, inviteCode });
  } catch (err) {
    console.error('Create invitation error:', err);
    res.status(500).json({ error: 'Failed to create invitation' });
  }
});

// ── POST /api/invitations/verify  (public — check code validity before signup) ──
router.post('/verify', inviteAttemptLimiter, async (req, res) => {
  try {
    const { inviteCode } = req.body;
    if (!inviteCode) return res.status(400).json({ error: 'inviteCode is required' });

    const snap = await db.collectionGroup('invitations')
      .where('inviteCode', '==', inviteCode)
      .where('status', '==', 'pending')
      .limit(1)
      .get();

    if (snap.empty) {
      return res.status(404).json({ valid: false, error: 'Invalid or already-used code' });
    }

    const invite = snap.docs[0];
    const data = invite.data();
    const expiresAt = data.expiresAt?.toDate ? data.expiresAt.toDate() : new Date(data.expiresAt);

    if (expiresAt < new Date()) {
      await invite.ref.update({ status: 'expired' });
      return res.status(410).json({ valid: false, error: 'This invite code has expired' });
    }

    const orgId = invite.ref.parent.parent.id;
    const orgSnap = await db.collection('organizations').doc(orgId).get();
    const orgName = orgSnap.exists ? (orgSnap.data().name || null) : null;

    res.json({ valid: true, email: data.email, role: data.role, department: data.department, orgName });
  } catch (err) {
    console.error('Verify invitation error:', err);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// ── POST /api/invitations/accept  (authenticated — redeem after signup/login) ──
// IMPORTANT: this must run AFTER the user already has a Firebase Auth account and
// a users/{uid} profile doc (i.e. after normal signup), since verifyToken needs a
// valid ID token, and we write orgId/role into that existing users/{uid} doc.
router.post('/accept', inviteAttemptLimiter, verifyToken, async (req, res) => {
  try {
    const { inviteCode } = req.body;
    if (!inviteCode) return res.status(400).json({ error: 'inviteCode is required' });

    const snap = await db.collectionGroup('invitations')
      .where('inviteCode', '==', inviteCode)
      .where('status', '==', 'pending')
      .limit(1)
      .get();

    if (snap.empty) {
      return res.status(404).json({ error: 'Invalid or already-used code' });
    }

    const inviteDoc = snap.docs[0];
    const invite = inviteDoc.data();
    const expiresAt = invite.expiresAt?.toDate ? invite.expiresAt.toDate() : new Date(invite.expiresAt);
    if (expiresAt < new Date()) {
      await inviteDoc.ref.update({ status: 'expired' });
      return res.status(410).json({ error: 'This invite code has expired' });
    }

    // orgId is the parent of the invitations subcollection: organizations/{orgId}/invitations/{id}
    const orgId = inviteDoc.ref.parent.parent.id;
    const uid = req.user.uid;
    const grantedRole = invite.role || 'employee';

    // ── Write orgId/role onto the user's own profile doc — this is exactly what
    // auth.js's verifyToken reads on every subsequent request, so the new
    // permissions take effect immediately on the user's NEXT API call (no token
    // refresh needed, since this isn't a custom-claims-based setup).
    await db.collection('users').doc(uid).set({
      orgId,
      role: grantedRole,
    }, { merge: true });

    // Fetch fullName from the user's profile doc so the members collection
    // has the name the OrgAdminDashboard Employees table needs to display.
    let fullName = req.user.email; // safe fallback
    try {
      const userSnap = await db.collection('users').doc(uid).get();
      if (userSnap.exists) fullName = userSnap.data().fullName || req.user.email;
    } catch (_) {}

    await db.collection('organizations').doc(orgId).collection('members').doc(uid).set({
      uid,
      email: req.user.email,
      fullName,
      role: grantedRole,
      department: invite.department || null,
      status: 'active',
      joinedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    await inviteDoc.ref.update({
      status: 'accepted',
      acceptedBy: uid,
      acceptedAt: FieldValue.serverTimestamp(),
    });

    await db.collection('activityLogs').add({
      orgId,
      userId: uid,
      userName: req.user.email,
      action: `${req.user.email} joined the organization`,
      type: 'success',
      createdAt: FieldValue.serverTimestamp(),
    });

    res.json({ success: true, orgId, role: grantedRole });
  } catch (err) {
    console.error('Accept invitation error:', err);
    res.status(500).json({ error: 'Failed to accept invitation' });
  }
});

// ── GET /api/invitations  (org_admin only — list all invites for the org) ──
router.get('/', verifyToken, requireRole('org_admin'), async (req, res) => {
  try {
    const orgId = req.user.orgId;
    if (!orgId) return res.status(403).json({ error: 'No organization context' });

    const snap = await db.collection('organizations').doc(orgId).collection('invitations')
      .orderBy('createdAt', 'desc')
      .get();

    res.json({ invitations: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
  } catch (err) {
    console.error('List invitations error:', err);
    res.status(500).json({ error: 'Failed to load invitations' });
  }
});

module.exports = router;
// ============================================================
// FortifyLens — Auth Routes
// Handles profile creation, fetching, and token verification
// ============================================================

const express = require('express');
const router  = express.Router();
const { db }  = require('../../config/firebase');
const { verifyToken } = require('../middleware/auth');
const { FieldValue } = require('firebase-admin/firestore');

/**
 * POST /api/auth/profile
 * Creates the caller's OWN profile in Firestore immediately after
 * Firebase signup. Requires a valid Firebase ID token (the client
 * has one right after signup) — uid/email are taken from the
 * VERIFIED token, never from the request body.
 *
 * SECURITY FIX: this endpoint previously accepted uid, email, role,
 * and orgId directly from the request body with NO auth check,
 * letting anyone create/overwrite any users/{uid} doc and grant
 * themselves role: 'superadmin' with any orgId. Real orgIds/roles
 * beyond the default are only ever granted server-side by
 * POST /api/orgs (org creation) or /api/invitations/accept.
 *
 * Body: { fullName? }
 */
router.post('/profile', verifyToken, async (req, res) => {
  try {
    const { fullName } = req.body;
    const uid   = req.user.uid;
    const email = req.user.email;

    // If a profile already exists, don't let a re-call reset role/orgId —
    // just no-op and return the existing assignment.
    const existing = await db.collection('users').doc(uid).get();
    if (existing.exists) {
      const data = existing.data();
      return res.json({ success: true, uid, orgId: data.orgId });
    }

    // Brand-new profile: always starts as a plain user with a personal
    // workspace (orgId = own uid). Elevated roles/real orgIds are granted
    // later by trusted server-side flows only.
    await db.collection('users').doc(uid).set({
      uid,
      email:     email.toLowerCase().trim(),
      fullName:  fullName || '',
      role:      'user',
      orgId:     uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    res.json({ success: true, uid, orgId: uid });
  } catch (err) {
    console.error('Save profile error:', err);
    res.status(500).json({ error: 'Failed to save profile' });
  }
});

/**
 * GET /api/auth/me
 * Returns the current user's profile from Firestore.
 */
router.get('/me', verifyToken, async (req, res) => {
  try {
    const userDoc = await db.collection('users').doc(req.user.uid).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User profile not found' });
    }
    res.json({ user: { id: userDoc.id, ...userDoc.data() } });
  } catch (err) {
    console.error('Get me error:', err);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

/**
 * PUT /api/auth/me
 * Updates the current user's profile.
 * Body: { fullName?, phoneNumber?, avatarUrl? }
 */
router.put('/me', verifyToken, async (req, res) => {
  try {
    const allowed = ['fullName', 'phoneNumber', 'avatarUrl', 'department', 'jobTitle'];
    const updates = {};
    allowed.forEach(key => {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    });
    updates.updatedAt = FieldValue.serverTimestamp();

    await db.collection('users').doc(req.user.uid).update(updates);
    res.json({ success: true });
  } catch (err) {
    console.error('Update me error:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

/**
 * POST /api/auth/verify-token
 * Simple token validity check.
 */
router.post('/verify-token', verifyToken, (req, res) => {
  res.json({ valid: true, user: req.user });
});

module.exports = router;
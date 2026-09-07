// ============================================================
// FortifyLens — Users Routes
// ============================================================

const express = require('express');
const router  = express.Router();
const { db, auth } = require('../../config/firebase');
const { verifyToken, requireRole } = require('../middleware/auth');
const { sanitizeString } = require('../middleware/validate');
const { FieldValue } = require('firebase-admin/firestore');

/**
 * GET /api/users
 * Returns all users (superadmin only).
 */
router.get('/', verifyToken, requireRole('superadmin'), async (req, res) => {
  try {
    const snap = await db.collection('users').orderBy('createdAt', 'desc').get();
    res.json({ users: snap.docs.map(d => ({ uid: d.id, ...d.data() })) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

/**
 * GET /api/users/:uid
 */
router.get('/:uid', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'superadmin' && req.user.uid !== req.params.uid) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const doc = await db.collection('users').doc(req.params.uid).get();
    if (!doc.exists) return res.status(404).json({ error: 'User not found' });
    res.json({ user: { uid: doc.id, ...doc.data() } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

/**
 * PUT /api/users/:uid
 * Admin can update role; user can only update profile fields.
 */
router.put('/:uid', verifyToken, async (req, res) => {
  try {
    const isSelf       = req.user.uid === req.params.uid;
    const isSuperadmin = req.user.role === 'superadmin';
    const isOrgAdmin   = req.user.role === 'org_admin';

    if (!isSelf && !isSuperadmin && !isOrgAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const updates = {};
    if (req.body.fullName)    updates.fullName    = sanitizeString(req.body.fullName, 100);
    if (req.body.phoneNumber) updates.phoneNumber = sanitizeString(req.body.phoneNumber, 20);
    if (req.body.avatarUrl)   updates.avatarUrl   = sanitizeString(req.body.avatarUrl, 500);

    // SECURITY FIX: role changes used to be gated only by "is the caller
    // an admin of SOME kind" — an org_admin from any org could grant
    // 'superadmin' to any uid on the platform (cross-org privilege
    // escalation). Now: superadmin can grant any role to anyone; an
    // org_admin can only grant 'user'/'employee', and only to a target
    // who is already a member of THEIR OWN org; self can never change
    // their own role.
    if (req.body.role && !isSelf) {
      if (isSuperadmin) {
        const allowed = ['superadmin', 'org_admin', 'user', 'employee'];
        if (allowed.includes(req.body.role)) updates.role = req.body.role;
      } else if (isOrgAdmin) {
        const grantable = ['user', 'employee'];
        if (!grantable.includes(req.body.role)) {
          return res.status(403).json({ error: 'Cannot grant this role' });
        }
        const targetDoc = await db.collection('users').doc(req.params.uid).get();
        const sameOrg = targetDoc.exists && targetDoc.data().orgId === req.user.orgId;
        if (!sameOrg) {
          return res.status(403).json({ error: 'Cannot manage users outside your organization' });
        }
        updates.role = req.body.role;
      }
    }

    updates.updatedAt = FieldValue.serverTimestamp();
    await db.collection('users').doc(req.params.uid).update(updates);

    res.json({ success: true, message: 'User updated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update user' });
  }
});

/**
 * DELETE /api/users/:uid
 * Superadmin only. Removes Firestore profile + Firebase Auth account.
 */
router.delete('/:uid', verifyToken, requireRole('superadmin'), async (req, res) => {
  try {
    await Promise.all([
      db.collection('users').doc(req.params.uid).delete(),
      auth.deleteUser(req.params.uid).catch(() => {}),
    ]);
    res.json({ success: true, message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

module.exports = router;
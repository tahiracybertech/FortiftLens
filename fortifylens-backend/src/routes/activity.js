// ============================================================
// FortifyLens — Activity Log Routes
// ============================================================

const express = require('express');
const router  = express.Router();
const { db }  = require('../../config/firebase');
const { verifyToken } = require('../middleware/auth');
const { FieldValue } = require('firebase-admin/firestore');

/**
 * GET /api/activity
 * Returns activity logs for the user's org.
 */
router.get('/', verifyToken, async (req, res) => {
  try {
    const orgId = req.user.orgId;
    if (!orgId && req.user.role !== 'superadmin') {
      return res.json({ activities: [] });
    }

    let query = db.collection('activityLogs').orderBy('createdAt', 'desc').limit(50);
    if (orgId) query = query.where('orgId', '==', orgId);

    const snap = await query.get();
    res.json({ activities: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch activity logs' });
  }
});

/**
 * POST /api/activity
 * Logs a custom activity event.
 */
router.post('/', verifyToken, async (req, res) => {
  try {
    const { action, type = 'info' } = req.body;
    if (!action) return res.status(400).json({ error: 'action is required' });

    await db.collection('activityLogs').add({
      orgId:    req.user.orgId || null,
      userId:   req.user.uid,
      userName: req.user.email,
      action,
      type,
      createdAt: FieldValue.serverTimestamp(),
    });

    res.status(201).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to log activity' });
  }
});

module.exports = router;

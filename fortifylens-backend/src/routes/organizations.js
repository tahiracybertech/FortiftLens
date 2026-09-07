// ============================================================
// FortifyLens — Organizations Routes
// Org creation, management, members, subscription plans
// ============================================================

const express = require('express');
const router  = express.Router();
const { db }  = require('../../config/firebase');
const { verifyToken, requireRole } = require('../middleware/auth');
const { validateRequired, validateEmail, sanitizeString } = require('../middleware/validate');
const { FieldValue } = require('firebase-admin/firestore');

// SECURITY FIX: routes guarded only by requireRole('org_admin', ...) were
// reachable by an org_admin from ANY org against ANY :orgId in the URL —
// classic broken object-level authorization (IDOR). This helper confirms
// the caller's own org (from the verified token) matches the org they're
// targeting, unless they're a superadmin.
function ownsOrg(req) {
  return req.user.role === 'superadmin' || req.user.orgId === req.params.orgId;
}

/**
 * GET /api/orgs
 * Returns all organizations (superadmin only).
 */
router.get('/', verifyToken, requireRole('superadmin'), async (req, res) => {
  try {
    const snap = await db.collection('organizations').orderBy('createdAt', 'desc').get();
    res.json({ organizations: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch organizations' });
  }
});

/**
 * GET /api/orgs/:orgId
 * Returns a single organization.
 */
router.get('/:orgId', verifyToken, async (req, res) => {
  try {
    // Users can only see their own org; superadmins can see any
    if (req.user.role !== 'superadmin' && req.user.orgId !== req.params.orgId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const doc = await db.collection('organizations').doc(req.params.orgId).get();
    if (!doc.exists) return res.status(404).json({ error: 'Organization not found' });
    res.json({ organization: { id: doc.id, ...doc.data() } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch organization' });
  }
});

/**
 * POST /api/orgs
 * Creates a new organization (called during org_admin signup).
 * Body: { name, industry, orgSize, phoneNumber?, adminUid }
 */
router.post('/', verifyToken, async (req, res) => {
  try {
    const { name, industry, orgSize, phoneNumber } = req.body;
    const check = validateRequired(['name', 'industry', 'orgSize'], req.body);
    if (!check.valid) return res.status(400).json({ error: check.error });

    // SECURITY FIX: this endpoint used to accept an `adminUid` from the
    // request body and grant THAT uid role: 'org_admin' + the new orgId —
    // letting any authenticated user hijack an arbitrary account by
    // reassigning its role/org membership. The creator is now always the
    // one who becomes org_admin; there is no way to name a different uid.
    const adminUid = req.user.uid;

    const orgData = {
      name:        sanitizeString(name, 150),
      industry:    sanitizeString(industry, 100),
      orgSize:     sanitizeString(orgSize, 50),
      adminUid,
      status:      'active',
      currentPlan: 'Starter',
      ...(phoneNumber && { phoneNumber: sanitizeString(phoneNumber, 20) }),
      createdAt:   FieldValue.serverTimestamp(),
      updatedAt:   FieldValue.serverTimestamp(),
    };

    const ref = await db.collection('organizations').add(orgData);

    // Link user to org
    await db.collection('users').doc(adminUid).update({
      orgId: ref.id,
      role:  'org_admin',
    });

    await db.collection('activityLogs').add({
      orgId:    ref.id,
      userId:   req.user.uid,
      userName: req.user.email,
      action:   `Organization "${name}" created`,
      type:     'success',
      createdAt: FieldValue.serverTimestamp(),
    });

    res.status(201).json({ success: true, orgId: ref.id, message: 'Organization created' });
  } catch (err) {
    console.error('Create org error:', err);
    res.status(500).json({ error: 'Failed to create organization' });
  }
});

/**
 * PUT /api/orgs/:orgId
 * Updates organization details.
 */
router.put('/:orgId', verifyToken, requireRole('org_admin', 'superadmin'), async (req, res) => {
  if (!ownsOrg(req)) return res.status(403).json({ error: 'Access denied' });
  try {
    const allowed = ['name', 'industry', 'orgSize', 'phoneNumber', 'currentPlan'];
    const updates = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
    updates.updatedAt = FieldValue.serverTimestamp();

    await db.collection('organizations').doc(req.params.orgId).update(updates);
    res.json({ success: true, message: 'Organization updated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update organization' });
  }
});

/**
 * PATCH /api/orgs/:orgId/status
 * Suspend or activate an organization (superadmin only).
 * Body: { status: 'active' | 'suspended' }
 */
router.patch('/:orgId/status', verifyToken, requireRole('superadmin'), async (req, res) => {
  try {
    const { status } = req.body;
    if (!['active', 'suspended'].includes(status)) {
      return res.status(400).json({ error: 'status must be active or suspended' });
    }
    await db.collection('organizations').doc(req.params.orgId).update({ status });
    res.json({ success: true, message: `Organization ${status}` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update organization status' });
  }
});

// ── MEMBERS ──────────────────────────────────────────────────

/**
 * GET /api/orgs/:orgId/members
 */
router.get('/:orgId/members', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'superadmin' && req.user.orgId !== req.params.orgId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const snap = await db
      .collection('organizations').doc(req.params.orgId)
      .collection('members')
      .orderBy('joinedAt', 'desc')
      .get();
    res.json({ members: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

/**
 * POST /api/orgs/:orgId/members
 * Adds a member to the organization.
 */
router.post('/:orgId/members', verifyToken, requireRole('org_admin', 'superadmin'), async (req, res) => {
  if (!ownsOrg(req)) return res.status(403).json({ error: 'Access denied' });
  try {
    const { userId, email, fullName, jobTitle, department } = req.body;
    const check = validateRequired(['email', 'fullName'], req.body);
    if (!check.valid) return res.status(400).json({ error: check.error });
    if (!validateEmail(email)) return res.status(400).json({ error: 'Invalid email' });

    const ref = await db
      .collection('organizations').doc(req.params.orgId)
      .collection('members')
      .add({
        userId:     userId || '',
        email:      email.toLowerCase().trim(),
        fullName:   sanitizeString(fullName, 100),
        jobTitle:   sanitizeString(jobTitle || '', 100),
        department: sanitizeString(department || '', 100),
        status:     'active',
        joinedAt:   FieldValue.serverTimestamp(),
      });

    res.status(201).json({ success: true, memberId: ref.id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add member' });
  }
});

/**
 * PATCH /api/orgs/:orgId/members/:memberId/status
 */
router.patch('/:orgId/members/:memberId/status', verifyToken, requireRole('org_admin', 'superadmin'), async (req, res) => {
  if (!ownsOrg(req)) return res.status(403).json({ error: 'Access denied' });
  try {
    const { status } = req.body;
    const allowed = ['active', 'offline', 'suspended'];
    if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });

    await db
      .collection('organizations').doc(req.params.orgId)
      .collection('members').doc(req.params.memberId)
      .update({ status });

    res.json({ success: true, message: `Member status updated to ${status}` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update member status' });
  }
});

// ── SUBSCRIPTION PLANS ────────────────────────────────────────

/**
 * GET /api/orgs/plans/all
 * Returns all subscription plan configs.
 */
router.get('/plans/all', verifyToken, async (req, res) => {
  try {
    const snap = await db.collection('subscriptionPlans').get();
    if (snap.empty) {
      // Seed default plans if none exist
      const defaultPlans = [
        { name: 'Starter',    priceMonthly: 0,    isEnabled: true,  isPopular: false, maxUsers: 5,    maxProjects: 3,   features: ['Requirement Analysis', '3 Projects', '5 Team Members', 'Basic Reports'] },
        { name: 'Business',   priceMonthly: 99,   isEnabled: true,  isPopular: true,  maxUsers: 25,   maxProjects: 15,  features: ['All Starter features', 'STRIDE Threat Modeling', 'Code SAST Scanner', '25 Team Members', 'Priority Support'] },
        { name: 'Enterprise', priceMonthly: null, isEnabled: true,  isPopular: false, maxUsers: null, maxProjects: null, features: ['All Business features', 'Unlimited Projects', 'Custom Compliance', 'Dedicated Support', 'SLA Guarantee'] },
      ];
      const batch = db.batch();
      const refs = [];
      defaultPlans.forEach(plan => {
        const ref = db.collection('subscriptionPlans').doc();
        batch.set(ref, plan);
        refs.push({ id: ref.id, ...plan });
      });
      await batch.commit();
      return res.json({ plans: refs });
    }
    res.json({ plans: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch plans' });
  }
});

/**
 * PUT /api/orgs/plans/:planId
 * Updates a subscription plan (superadmin only).
 */
router.put('/plans/:planId', verifyToken, requireRole('superadmin'), async (req, res) => {
  try {
    const allowed = ['isEnabled', 'priceMonthly', 'description', 'maxUsers', 'maxProjects', 'features'];
    const updates = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
    await db.collection('subscriptionPlans').doc(req.params.planId).update(updates);
    res.json({ success: true, message: 'Plan updated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update plan' });
  }
});

module.exports = router;
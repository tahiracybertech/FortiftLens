// ============================================================
// FortifyLens — Projects Routes (UPDATED)
//
// CHANGES FROM ORIGINAL:
// - GET /:projectId/versions  → list all analysis versions for a project
//   (convenience alias to /api/analysis/versions/:projectId)
// All other routes unchanged.
// ============================================================

const express = require('express');
const router  = express.Router();
const { db }  = require('../../config/firebase');
const { verifyToken, requireRole } = require('../middleware/auth');
const {
  validateRequired,
  validateProjectDomain,
  validateProjectPhase,
  sanitizeString,
} = require('../middleware/validate');
const { FieldValue } = require('firebase-admin/firestore');

function resolveOrgId(req) {
  // SECURITY FIX: this used to prefer req.params.orgId over the verified
  // token's orgId. No current route declares an :orgId param, so it was
  // dormant — but any future route added under this router (or this
  // router being remounted with an :orgId param) would have silently let
  // a client override their org via the URL. Trust the token only, same
  // pattern as teams.js's getOrgId().
  return req.user.orgId || null;
}

// SECURITY FIX: PUT /:projectId previously let ANY authenticated org
// member edit ANY project in the org (including riskScore/status),
// regardless of whether they were org_admin or on the project's team.
// This restricts edits to org_admin/superadmin, or a member/lead of a
// team that's actually assigned to this project.
async function canEditProject(req, orgId, projectId) {
  if (req.user.role === 'org_admin' || req.user.role === 'superadmin') return true;

  const teamsSnap = await db.collection('organizations').doc(orgId)
    .collection('teams')
    .where('projectId', '==', projectId)
    .get();

  return teamsSnap.docs.some(d => {
    const t = d.data();
    const memberIds = Array.isArray(t.memberIds) ? t.memberIds : [];
    return memberIds.includes(req.user.uid) || t.leadUserId === req.user.uid;
  });
}

/**
 * GET /api/projects
 */
router.get('/', verifyToken, async (req, res) => {
  try {
    const orgId = resolveOrgId(req);
    if (!orgId) return res.status(400).json({ error: 'No orgId found for user' });

    const snap = await db
      .collection('organizations').doc(orgId)
      .collection('projects')
      .orderBy('createdAt', 'desc')
      .get();

    const projects = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json({ projects });
  } catch (err) {
    console.error('Get projects error:', err);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

/**
 * GET /api/projects/:projectId
 */
router.get('/:projectId', verifyToken, async (req, res) => {
  try {
    const orgId = resolveOrgId(req);
    if (!orgId) return res.status(400).json({ error: 'No orgId found for user' });

    const projectRef = db
      .collection('organizations').doc(orgId)
      .collection('projects').doc(req.params.projectId);

    const [projectDoc, phasesSnap, vulnsSnap, versionsSnap] = await Promise.all([
      projectRef.get(),
      projectRef.collection('phases').get(),
      projectRef.collection('vulnerabilities').get(),
      projectRef.collection('versions').orderBy('createdAt', 'desc').limit(1).get(),
    ]);

    if (!projectDoc.exists) return res.status(404).json({ error: 'Project not found' });

    // How many phases have been analyzed at least once
    const analyzedPhases = phasesSnap.docs
      .filter(d => d.data().status === 'completed')
      .map(d => d.data().phase);

    res.json({
      project: { id: projectDoc.id, ...projectDoc.data() },
      phases:  phasesSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      vulnerabilityCount: vulnsSnap.size,
      analyzedPhases,
      latestVersion: versionsSnap.empty ? null : { id: versionsSnap.docs[0].id, ...versionsSnap.docs[0].data() },
    });
  } catch (err) {
    console.error('Get project error:', err);
    res.status(500).json({ error: 'Failed to fetch project' });
  }
});

/**
 * POST /api/projects
 */
router.post('/', verifyToken, async (req, res) => {
  try {
    const orgId = resolveOrgId(req);
    if (!orgId) return res.status(400).json({ error: 'No orgId found for user' });

    const { name, description, domain = 'web-application', currentPhase = 'requirement', teamId } = req.body;

    const check = validateRequired(['name'], req.body);
    if (!check.valid) return res.status(400).json({ error: check.error });

    if (domain && !validateProjectDomain(domain)) {
      return res.status(400).json({ error: 'Invalid project domain' });
    }
    if (!validateProjectPhase(currentPhase)) {
      return res.status(400).json({ error: 'Invalid project phase' });
    }

    const projectData = {
      orgId,
      createdBy:    req.user.uid,
      name:         sanitizeString(name, 150),
      description:  sanitizeString(description || '', 500),
      domain,
      currentPhase,
      status:       'in-progress',
      progress:     0,
      riskScore:    0,
      versionCount: 0,
      ...(teamId && { teamId }),
      createdAt:    FieldValue.serverTimestamp(),
      updatedAt:    FieldValue.serverTimestamp(),
    };

    const projectRef = await db
      .collection('organizations').doc(orgId)
      .collection('projects')
      .add(projectData);

    // Auto-create the 3 SDLC phase sub-documents
    const phases = ['requirement', 'design', 'development'];
    const batch = db.batch();
    phases.forEach(phase => {
      const phaseRef = projectRef.collection('phases').doc(phase);
      batch.set(phaseRef, {
        phase,
        completion:         0,
        status:             phase === currentPhase ? 'in-progress' : 'pending',
        vulnerabilityCount: 0,
        analysisData:       null,
        latestVersionId:    null,
        createdAt:          FieldValue.serverTimestamp(),
      });
    });
    await batch.commit();

    await db.collection('activityLogs').add({
      orgId,
      userId:    req.user.uid,
      userName:  req.user.email,
      action:    `Created project: ${name}`,
      type:      'success',
      createdAt: FieldValue.serverTimestamp(),
    });

    res.status(201).json({
      success:   true,
      projectId: projectRef.id,
      message:   'Project created successfully',
    });
  } catch (err) {
    console.error('Create project error:', err);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

/**
 * PUT /api/projects/:projectId
 */
router.put('/:projectId', verifyToken, async (req, res) => {
  try {
    const orgId = resolveOrgId(req);
    if (!orgId) return res.status(400).json({ error: 'No orgId found for user' });

    if (!(await canEditProject(req, orgId, req.params.projectId))) {
      return res.status(403).json({ error: 'Only org admins or the assigned team can edit this project' });
    }

    const allowed = ['name', 'description', 'domain', 'currentPhase', 'status', 'progress', 'riskScore', 'teamId', 'lastScanAt'];
    const updates = {};
    allowed.forEach(key => {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    });
    updates.updatedAt = FieldValue.serverTimestamp();

    await db
      .collection('organizations').doc(orgId)
      .collection('projects').doc(req.params.projectId)
      .update(updates);

    res.json({ success: true, message: 'Project updated' });
  } catch (err) {
    console.error('Update project error:', err);
    res.status(500).json({ error: 'Failed to update project' });
  }
});

/**
 * DELETE /api/projects/:projectId
 */
router.delete('/:projectId', verifyToken, requireRole('org_admin', 'superadmin'), async (req, res) => {
  try {
    const orgId = resolveOrgId(req);
    if (!orgId) return res.status(400).json({ error: 'No orgId found' });

    await db
      .collection('organizations').doc(orgId)
      .collection('projects').doc(req.params.projectId)
      .delete();

    res.json({ success: true, message: 'Project deleted' });
  } catch (err) {
    console.error('Delete project error:', err);
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

// ── VULNERABILITIES ──────────────────────────────────────────

router.get('/:projectId/vulnerabilities', verifyToken, async (req, res) => {
  try {
    const orgId = resolveOrgId(req);
    if (!orgId) return res.status(400).json({ error: 'No orgId found' });

    const snap = await db
      .collection('organizations').doc(orgId)
      .collection('projects').doc(req.params.projectId)
      .collection('vulnerabilities')
      .orderBy('createdAt', 'desc')
      .get();

    res.json({ vulnerabilities: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch vulnerabilities' });
  }
});

router.post('/:projectId/vulnerabilities', verifyToken, async (req, res) => {
  try {
    const orgId = resolveOrgId(req);
    if (!orgId) return res.status(400).json({ error: 'No orgId found' });

    const { title, severity, description, recommendation } = req.body;
    const check = validateRequired(['title', 'severity', 'description'], req.body);
    if (!check.valid) return res.status(400).json({ error: check.error });

    const ref = await db
      .collection('organizations').doc(orgId)
      .collection('projects').doc(req.params.projectId)
      .collection('vulnerabilities')
      .add({
        title:          sanitizeString(title, 200),
        severity,
        description:    sanitizeString(description, 1000),
        recommendation: sanitizeString(recommendation || '', 1000),
        isResolved:     false,
        createdAt:      FieldValue.serverTimestamp(),
      });

    res.status(201).json({ success: true, vulnId: ref.id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add vulnerability' });
  }
});

router.patch('/:projectId/vulnerabilities/:vulnId/resolve', verifyToken, async (req, res) => {
  try {
    const orgId = resolveOrgId(req);
    if (!orgId) return res.status(400).json({ error: 'No orgId found' });

    await db
      .collection('organizations').doc(orgId)
      .collection('projects').doc(req.params.projectId)
      .collection('vulnerabilities').doc(req.params.vulnId)
      .update({ isResolved: true, resolvedAt: FieldValue.serverTimestamp() });

    res.json({ success: true, message: 'Vulnerability marked as resolved' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to resolve vulnerability' });
  }
});

// ── VERSION HISTORY (NEW) ──────────────────────────────────────

/**
 * GET /api/projects/:projectId/versions
 * List all analysis versions for a project
 */
router.get('/:projectId/versions', verifyToken, async (req, res) => {
  try {
    const orgId = resolveOrgId(req);
    if (!orgId) return res.status(400).json({ error: 'No orgId found' });

    const versionsSnap = await db
      .collection('organizations').doc(orgId)
      .collection('projects').doc(req.params.projectId)
      .collection('versions')
      .orderBy('createdAt', 'desc')
      .get();

    const versions = versionsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json({ success: true, versions });
  } catch (err) {
    console.error('Get project versions error:', err);
    res.status(500).json({ error: 'Failed to fetch versions' });
  }
});

/**
 * GET /api/projects/:projectId/versions/:versionId
 * Full detail of one version with all phase reports
 */
router.get('/:projectId/versions/:versionId', verifyToken, async (req, res) => {
  try {
    const orgId = resolveOrgId(req);
    if (!orgId) return res.status(400).json({ error: 'No orgId found' });

    const versionRef = db
      .collection('organizations').doc(orgId)
      .collection('projects').doc(req.params.projectId)
      .collection('versions').doc(req.params.versionId);

    const [versionDoc, phasesSnap] = await Promise.all([
      versionRef.get(),
      versionRef.collection('phases').get(),
    ]);

    if (!versionDoc.exists) return res.status(404).json({ error: 'Version not found' });

    const phases = {};
    phasesSnap.docs.forEach(d => { phases[d.id] = d.data(); });

    res.json({
      success: true,
      version: { id: versionDoc.id, ...versionDoc.data() },
      phases,
    });
  } catch (err) {
    console.error('Get version detail error:', err);
    res.status(500).json({ error: 'Failed to fetch version detail' });
  }
});

module.exports = router;
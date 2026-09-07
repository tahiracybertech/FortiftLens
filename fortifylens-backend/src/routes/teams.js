// ============================================================
// FortifyLens — Teams Routes
// ============================================================

const express = require('express');
const router  = express.Router();
const { db }  = require('../../config/firebase');
const { verifyToken, requireRole } = require('../middleware/auth');
const { validateRequired, sanitizeString } = require('../middleware/validate');
const { FieldValue } = require('firebase-admin/firestore');

function getOrgId(req) {
  // SECURITY: only trust orgId from the verified auth token, never from req.body
  return req.user?.orgId || null;
}

/**
 * GET /api/teams/my-projects
 * Returns org projects assigned to teams where the current user is a member.
 * Used by UserDashboard "Organization Projects" section for employees.
 */
router.get('/my-projects', verifyToken, async (req, res) => {
  try {
    const orgId = req.user?.orgId;
    const uid = req.user?.uid;
    if (!orgId || !uid) return res.json({ projects: [] });

    // Check if this member is suspended — suspended members get no projects
    const memberSnap = await db.collection('organizations').doc(orgId)
      .collection('members').doc(uid).get();
    if (memberSnap.exists && memberSnap.data().status === 'suspended') {
      return res.json({ projects: [], suspended: true });
    }

    // Fetch all teams in the org
    const teamsSnap = await db.collection('organizations').doc(orgId).collection('teams').get();
    const myTeams = teamsSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(t => {
        const memberIds = Array.isArray(t.memberIds) ? t.memberIds : [];
        return memberIds.includes(uid) ||
          (t.leadUserId && t.leadUserId !== '' && t.leadUserId !== 'none' && t.leadUserId === uid);
      });

    if (myTeams.length === 0) return res.json({ projects: [] });

    const projectIds = [...new Set(myTeams.map(t => t.projectId).filter(Boolean))];
    if (projectIds.length === 0) return res.json({ projects: [] });

    const results = [];
    for (const projectId of projectIds) {
      const pSnap = await db.collection('organizations').doc(orgId).collection('projects').doc(projectId).get();
      if (!pSnap.exists) continue;
      const p = pSnap.data();
      const team = myTeams.find(t => t.projectId === projectId);
      results.push({
        projectId,
        projectName: p.name,
        description: p.description,
        domain: p.domain,
        currentPhase: p.currentPhase,
        status: p.status,
        progress: p.progress ?? 0,
        riskScore: p.riskScore ?? 0,
        teamId: team.id,
        teamName: team.name,
        orgId,
        lastScanAt: p.lastScanAt ?? null,
      });
    }

    res.json({ projects: results });
  } catch (err) {
    console.error('my-projects error:', err);
    res.status(500).json({ error: 'Failed to fetch org projects' });
  }
});

/**
 * GET /api/teams
 */
router.get('/', verifyToken, async (req, res) => {
  try {
    const orgId = getOrgId(req);
    if (!orgId) return res.status(400).json({ error: 'No orgId found' });

    const snap = await db
      .collection('organizations').doc(orgId)
      .collection('teams')
      .get();

    res.json({ teams: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch teams' });
  }
});

/**
 * POST /api/teams
 * Body: { name, leadUserId, leadName, status?, projectId?, projectName? }
 */
router.post('/', verifyToken, requireRole('org_admin', 'superadmin'), async (req, res) => {
  try {
    const orgId = getOrgId(req);
    console.log('[POST /api/teams] req.user:', JSON.stringify(req.user));
    console.log('[POST /api/teams] orgId resolved:', orgId);
    if (!orgId) return res.status(400).json({ error: 'No orgId found' });

    const check = validateRequired(['name'], req.body);
    if (!check.valid) return res.status(400).json({ error: check.error });

    const { name, leadUserId = '', leadName = '', status = 'active', projectId, projectName } = req.body;

    const ref = await db
      .collection('organizations').doc(orgId)
      .collection('teams')
      .add({
        name:        sanitizeString(name, 100),
        leadUserId,
        leadName:    sanitizeString(leadName, 100),
        status,
        memberCount: 0,
        ...(projectId   && { projectId }),
        ...(projectName && { projectName }),
        createdAt:   FieldValue.serverTimestamp(),
      });

    res.status(201).json({ success: true, teamId: ref.id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create team' });
  }
});

/**
 * PUT /api/teams/:teamId
 */
router.put('/:teamId', verifyToken, requireRole('org_admin', 'superadmin'), async (req, res) => {
  try {
    const orgId = getOrgId(req);
    if (!orgId) return res.status(400).json({ error: 'No orgId found' });

    const allowed = ['name', 'leadUserId', 'leadName', 'status', 'memberCount', 'projectId', 'projectName', 'memberIds'];
    const updates = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
    updates.updatedAt = FieldValue.serverTimestamp();

    await db
      .collection('organizations').doc(orgId)
      .collection('teams').doc(req.params.teamId)
      .update(updates);

    res.json({ success: true, message: 'Team updated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update team' });
  }
});

/**
 * DELETE /api/teams/:teamId
 */
router.delete('/:teamId', verifyToken, requireRole('org_admin', 'superadmin'), async (req, res) => {
  try {
    const orgId = getOrgId(req);
    if (!orgId) return res.status(400).json({ error: 'No orgId found' });

    await db
      .collection('organizations').doc(orgId)
      .collection('teams').doc(req.params.teamId)
      .delete();

    res.json({ success: true, message: 'Team deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete team' });
  }
});

/**
 * GET /api/teams/project-activity/:projectId
 * Returns activity logs for a specific project (filtered by project name).
 * Used by OrgAdminDashboard "View Details" activity feed.
 */
router.get('/project-activity/:projectId', verifyToken, async (req, res) => {
  try {
    const orgId = getOrgId(req);
    if (!orgId) return res.status(403).json({ error: 'No org context' });

    const { projectId } = req.params;

    // Fetch the project name so we can filter activity by it
    const projectSnap = await db.collection('organizations').doc(orgId).collection('projects').doc(projectId).get();
    if (!projectSnap.exists) return res.json({ activity: [] });
    const projectName = projectSnap.data().name || '';

    // Fetch org activity and filter by project name in action string
    const logsSnap = await db.collection('activityLogs')
      .where('orgId', '==', orgId)
      .orderBy('createdAt', 'desc')
      .limit(200)
      .get();

    const activity = logsSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(log => log.action?.toLowerCase().includes(projectName.toLowerCase()))
      .slice(0, 30);

    res.json({ activity });
  } catch (err) {
    console.error('project-activity error:', err);
    res.status(500).json({ error: 'Failed to fetch project activity' });
  }
});

module.exports = router;
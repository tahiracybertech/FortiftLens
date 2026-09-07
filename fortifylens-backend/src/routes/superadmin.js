const express  = require('express');
const router   = express.Router();
const { db }   = require('../../config/firebase');
const { verifyToken, requireRole } = require('../middleware/auth');

const guard = [verifyToken, requireRole('superadmin')];

const PLAN_PRICE = { Starter: 500, Business: 1000 };
const normPlan = p => ['Starter','Business'].includes(p) ? p : 'Starter';
const toISO = ts => {
  if (!ts) return null;
  if (ts.toDate) return ts.toDate().toISOString();
  if (ts._seconds) return new Date(ts._seconds * 1000).toISOString();
  return null;
};

/* ────────────────────────────────────────────────────────────
   GET /api/superadmin/stats
   Platform KPIs — counts BOTH personal + org projects/scans
──────────────────────────────────────────────────────────── */
router.get('/stats', ...guard, async (req, res) => {
  try {
    const [orgsSnap, usersSnap, activitySnap] = await Promise.all([
      db.collection('organizations').get(),
      db.collection('users').get(),
      db.collection('activityLogs').orderBy('createdAt', 'desc').limit(10).get(),
    ]);

    const orgs = orgsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // ── Org projects (organizations/{orgId}/projects/) ──────
    const orgDetails = await Promise.all(orgs.map(async org => {
      const projSnap = await db.collection('organizations').doc(org.id)
        .collection('projects').get();

      const projectDetails = await Promise.all(projSnap.docs.map(async proj => {
        const [phasesSnap, vulnsSnap] = await Promise.all([
          db.collection('organizations').doc(org.id)
            .collection('projects').doc(proj.id).collection('phases').get(),
          db.collection('organizations').doc(org.id)
            .collection('projects').doc(proj.id).collection('vulnerabilities').get(),
        ]);
        const vulns = vulnsSnap.docs.map(d => d.data());
        return {
          phaseCount:    phasesSnap.size,
          openVulns:     vulns.filter(v => !v.isResolved).length,
          criticalVulns: vulns.filter(v => (v.severity ?? '').toLowerCase() === 'critical').length,
        };
      }));

      const plan = normPlan(org.currentPlan ?? org.plan);
      return {
        id: org.id, plan,
        status: (org.status ?? 'active').toLowerCase(),
        mrr:           PLAN_PRICE[plan] ?? 0,
        projects:      projSnap.size,
        scans:         projectDetails.reduce((s, p) => s + p.phaseCount, 0),
        openVulns:     projectDetails.reduce((s, p) => s + p.openVulns, 0),
        criticalVulns: projectDetails.reduce((s, p) => s + p.criticalVulns, 0),
        createdAt:     toISO(org.createdAt),
      };
    }));

    // ── Personal projects (users/{uid}/projects/) ───────────
    // These are created by users directly (not via org teams)
    const personalStats = await Promise.all(usersSnap.docs.map(async userDoc => {
      try {
        const projSnap = await db.collection('users').doc(userDoc.id)
          .collection('projects').get();
        if (projSnap.empty) return { projects: 0, scans: 0, openVulns: 0 };

        const projDetails = await Promise.all(projSnap.docs.map(async proj => {
          const [phasesSnap, vulnsSnap] = await Promise.all([
            db.collection('users').doc(userDoc.id)
              .collection('projects').doc(proj.id).collection('phases').get(),
            db.collection('users').doc(userDoc.id)
              .collection('projects').doc(proj.id).collection('vulnerabilities').get(),
          ]);
          return {
            phaseCount: phasesSnap.size,
            openVulns:  vulnsSnap.docs.filter(d => !d.data().isResolved).length,
          };
        }));

        return {
          projects: projSnap.size,
          scans:    projDetails.reduce((s, p) => s + p.phaseCount, 0),
          openVulns: projDetails.reduce((s, p) => s + p.openVulns, 0),
        };
      } catch { return { projects: 0, scans: 0, openVulns: 0 }; }
    }));

    // ── Totals ──────────────────────────────────────────────
    const planCounts = { Starter: 0, Business: 0, Individual: 0 };
    let mrr = 0;
    let orgProjects = 0, orgScans = 0, orgVulns = 0;
    let activeOrgSubscriptions = 0;

    orgDetails.forEach(o => {
      // Only count orgs with active status in plan distribution
      if (o.status === 'active') {
        if (o.plan in planCounts) planCounts[o.plan] = (planCounts[o.plan] ?? 0) + 1;
        mrr += o.mrr;
        activeOrgSubscriptions++;
      }
      orgProjects += o.projects;
      orgScans    += o.scans;
      orgVulns    += o.openVulns;
    });

    // ── Individual user subscriptions ────────────────────────
    const allUsers = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const activeIndividuals = allUsers.filter(u =>
      u.role === 'user' && u.planStatus === 'active'
    );
    planCounts.Individual = activeIndividuals.length;
    mrr += activeIndividuals.length * 300; // Rs. 300/month per individual

    const personalProjects = personalStats.reduce((s, p) => s + p.projects, 0);
    const personalScans    = personalStats.reduce((s, p) => s + p.scans, 0);
    const personalVulns    = personalStats.reduce((s, p) => s + p.openVulns, 0);

    const activeOrgs = activeOrgSubscriptions;
    const activeSubscriptions = activeOrgSubscriptions + activeIndividuals.length;

    // Signup trend (last 12 months)
    const now = new Date();
    const buckets = {};
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets[d.toLocaleString('default', { month: 'short', year: '2-digit' })] = 0;
    }
    orgs.forEach(o => {
      const iso = toISO(o.createdAt);
      if (!iso) return;
      const k = new Date(iso).toLocaleString('default', { month: 'short', year: '2-digit' });
      if (k in buckets) buckets[k]++;
    });
    const signupTrend = Object.entries(buckets).map(([month, signups]) => ({ month, signups }));

    const recentActivity = activitySnap.docs.map(d => {
      const data = d.data();
      return { id: d.id, ...data, createdAt: toISO(data.createdAt) };
    });

    res.json({
      stats: {
        totalOrgs: orgsSnap.size,
        activeOrgs,
        suspendedOrgs: orgsSnap.size - activeOrgs,
        totalUsers:    usersSnap.size,
        activeSubscriptions,
        activeIndividualUsers: activeIndividuals.length,
        activeOrgSubscriptions,
        // Combined: org + personal projects
        totalProjects: orgProjects + personalProjects,
        orgProjects,
        personalProjects,
        // Combined: org + personal scans
        totalScans: orgScans + personalScans,
        orgScans,
        personalScans,
        // Combined vulnerabilities
        totalVulnerabilities: orgVulns + personalVulns,
        planDistribution: planCounts,
        mrr,
      },
      signupTrend,
      recentActivity,
    });
  } catch (err) {
    console.error('Superadmin stats error:', err);
    res.status(500).json({ error: 'Failed to fetch stats', detail: err.message });
  }
});

/* ────────────────────────────────────────────────────────────
   GET /api/superadmin/orgs
   Full org list with REAL employee + project counts
──────────────────────────────────────────────────────────── */
router.get('/orgs', ...guard, async (req, res) => {
  try {
    const orgsSnap = await db.collection('organizations').get();

    const results = await Promise.all(orgsSnap.docs.map(async d => {
      const org = { id: d.id, ...d.data() };
      const [membersSnap, projectsSnap] = await Promise.all([
        db.collection('organizations').doc(org.id).collection('members').get(),
        db.collection('organizations').doc(org.id).collection('projects').get(),
      ]);
      const plan = normPlan(org.currentPlan ?? org.plan);
      return {
        id: org.id,
        name:          org.name ?? '—',
        adminEmail:    org.adminEmail ?? org.email ?? '—',
        plan,
        status:        org.status ?? 'active',
        employeeCount: membersSnap.size,
        projectCount:  projectsSnap.size,
        mrr:           PLAN_PRICE[plan] ?? 0,
        createdAt:     toISO(org.createdAt),
      };
    }));

    results.sort((a, b) => (b.createdAt ?? '') > (a.createdAt ?? '') ? 1 : -1);
    res.json({ orgs: results });
  } catch (err) {
    console.error('Superadmin orgs error:', err);
    res.status(500).json({ error: 'Failed to fetch orgs', detail: err.message });
  }
});

/* ────────────────────────────────────────────────────────────
   GET /api/superadmin/revenue
──────────────────────────────────────────────────────────── */
router.get('/revenue', ...guard, async (req, res) => {
  try {
    const snap = await db.collection('organizations').get();
    const orgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    let mrr = 0;
    const planDist = { Starter: 0, Business: 0 };
    orgs.forEach(o => {
      const plan = normPlan(o.currentPlan ?? o.plan);
      planDist[plan]++;
      if ((o.status ?? 'active').toLowerCase() === 'active') mrr += PLAN_PRICE[plan] ?? 0;
    });

    // 7-month cumulative revenue trend from real org createdAt
    const now = new Date();
    const monthlyData = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (6 - i), 1);
      const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
      const rev = orgs.filter(o => {
        const created = toISO(o.createdAt);
        return created && new Date(created) <= monthEnd && (o.status ?? 'active').toLowerCase() === 'active';
      }).reduce((s, o) => s + (PLAN_PRICE[normPlan(o.currentPlan ?? o.plan)] ?? 0), 0);
      return { month: d.toLocaleString('default', { month: 'short', year: '2-digit' }), revenue: rev };
    });

    res.json({ mrr, annualProjection: mrr * 12, monthlyData, planDist });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch revenue', detail: err.message });
  }
});

/* ────────────────────────────────────────────────────────────
   GET /api/superadmin/report-data
   All data needed to generate any report type
──────────────────────────────────────────────────────────── */
router.get('/report-data', ...guard, async (req, res) => {
  try {
    const orgsSnap = await db.collection('organizations').get();
    const orgs = orgsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const orgDetails = await Promise.all(orgs.map(async org => {
      const plan = normPlan(org.currentPlan ?? org.plan);
      const [membersSnap, projSnap] = await Promise.all([
        db.collection('organizations').doc(org.id).collection('members').get(),
        db.collection('organizations').doc(org.id).collection('projects').get(),
      ]);

      // Per project: phases, vulns
      const projDetails = await Promise.all(projSnap.docs.map(async proj => {
        const pd = proj.data();
        const [phasesSnap, vulnsSnap] = await Promise.all([
          db.collection('organizations').doc(org.id)
            .collection('projects').doc(proj.id).collection('phases').get(),
          db.collection('organizations').doc(org.id)
            .collection('projects').doc(proj.id).collection('vulnerabilities').get(),
        ]);
        const vulns = vulnsSnap.docs.map(d => d.data());
        const phaseDocs = {};
        phasesSnap.docs.forEach(ph => { phaseDocs[ph.id] = ph.data(); });
        return {
          name:          pd.name ?? proj.id,
          riskScore:     pd.riskScore ?? 0,
          progress:      pd.progress ?? 0,
          currentPhase:  pd.currentPhase ?? '—',
          status:        pd.status ?? 'in-progress',
          phases:        phaseDocs,
          totalVulns:    vulnsSnap.size,
          openVulns:     vulns.filter(v => !v.isResolved).length,
          criticalVulns: vulns.filter(v => (v.severity ?? '').toLowerCase() === 'critical').length,
          highVulns:     vulns.filter(v => (v.severity ?? '').toLowerCase() === 'high').length,
          vulns:         vulns.map(v => ({
            title:    v.title ?? '—',
            severity: v.severity ?? '—',
            phase:    v.phase ?? '—',
            isResolved: v.isResolved ?? false,
            assignedToName: v.assignedToName ?? null,
          })),
        };
      }));

      return {
        id:            org.id,
        name:          org.name ?? '—',
        adminEmail:    org.adminEmail ?? org.email ?? '—',
        plan,
        status:        org.status ?? 'active',
        employeeCount: membersSnap.size,
        projectCount:  projSnap.size,
        mrr:           PLAN_PRICE[plan] ?? 0,
        createdAt:     toISO(org.createdAt),
        projects:      projDetails,
        totalVulns:    projDetails.reduce((s, p) => s + p.totalVulns, 0),
        openVulns:     projDetails.reduce((s, p) => s + p.openVulns, 0),
        criticalVulns: projDetails.reduce((s, p) => s + p.criticalVulns, 0),
        avgRiskScore:  projDetails.length
          ? Math.round(projDetails.reduce((s, p) => s + p.riskScore, 0) / projDetails.length)
          : 0,
        totalScans:    projDetails.reduce((s, p) => s + Object.keys(p.phases).length, 0),
      };
    }));

    // Platform totals
    const totalVulns = orgDetails.reduce((s, o) => s + o.totalVulns, 0);
    const openVulns  = orgDetails.reduce((s, o) => s + o.openVulns, 0);
    const totalScans = orgDetails.reduce((s, o) => s + o.totalScans, 0);

    res.json({ orgs: orgDetails, totalVulns, openVulns, totalScans });
  } catch (err) {
    console.error('report-data error:', err);
    res.status(500).json({ error: 'Failed to fetch report data', detail: err.message });
  }
});

/* ────────────────────────────────────────────────────────────
   GET /api/superadmin/system-health
──────────────────────────────────────────────────────────── */
router.get('/system-health', ...guard, async (req, res) => {
  try {
    const start = Date.now();
    await db.collection('organizations').limit(1).get();
    const dbLatencyMs = Date.now() - start;
    const mem = process.memoryUsage();
    res.json({
      status: 'healthy',
      uptime: Math.floor(process.uptime()),
      uptimePct: 99.99,
      dbLatencyMs,
      memory: {
        used:  Math.round(mem.heapUsed  / 1024 / 1024),
        total: Math.round(mem.heapTotal / 1024 / 1024),
        pct:   Math.round((mem.heapUsed / mem.heapTotal) * 100),
      },
      errorRate: 0,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed', detail: err.message });
  }
});

/* PATCH status / plan + DELETE */
router.patch('/orgs/:id/status', ...guard, async (req, res) => {
  try {
    await db.collection('organizations').doc(req.params.id).update({ status: req.body.status });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.patch('/orgs/:id/plan', ...guard, async (req, res) => {
  try {
    const plan = normPlan(req.body.plan);
    await db.collection('organizations').doc(req.params.id).update({
      plan, currentPlan: plan, mrr: PLAN_PRICE[plan],
    });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.delete('/orgs/:id', ...guard, async (req, res) => {
  try {
    await db.collection('organizations').doc(req.params.id).delete();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
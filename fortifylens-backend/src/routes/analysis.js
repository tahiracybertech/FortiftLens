// ============================================================
// FortifyLens — Analysis Routes (UPDATED: Version History)
//
// CHANGES FROM ORIGINAL:
// ─────────────────────────────────────────────────────────────
// 1. Every analysis call now creates a VERSION in Firestore:
//    organizations/{orgId}/projects/{projectId}/versions/{vN}
//    instead of overwriting phases/requirement etc.
//
// 2. Version numbering: auto-increments (v1, v2, v3...)
//    Each version has:
//    - versionNumber, createdAt, analyzedBy
//    - phases/requirement | design | development  (subcollection)
//
// 3. Phase docs (requirement/design/development) still updated
//    on the project level for quick access / dashboard stats.
//    But full report data lives in the version.
//
// 4. New endpoint:
//    GET /api/analysis/versions/:projectId  → list all versions
//    GET /api/analysis/versions/:projectId/:versionId → single version detail
// ============================================================

const express = require('express');
const router  = express.Router();
const { db }  = require('../../config/firebase');
const { verifyToken } = require('../middleware/auth');
const { verifyTokenOrApiKey } = require('../middleware/apiKeyAuth');
const { analyzeRequirements, analyzeThreatModel, analyzeCode } = require('../services/analysisService');
const { analyzeRequirementsWithAI, analyzeThreatModelWithAI, analyzeCodeWithAI, analyzePhaseMappingWithAI } = require('../services/aiAnalysisService');
const { analyzePipelineConfig } = require('../services/pipelineSecurityService');
const { sanitizeString } = require('../middleware/validate');
const { FieldValue } = require('firebase-admin/firestore');
const https = require('https');

// ── OSV API helper ─────────────────────────────────────────────
function osvQuery(packages) {
  return new Promise((resolve) => {
    // FIX: OSV API expects { queries: [...] } with each entry as { version, package: { name, ecosystem } }
    const queries = packages.map(p => ({
      version: p.version,
      package: { name: p.package.name, ecosystem: p.package.ecosystem },
    }));
    const body = JSON.stringify({ queries });
    const options = {
      hostname: 'api.osv.dev',
      path: '/v1/querybatch',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) {
          console.error('[dep-scan] OSV parse error:', e.message);
          resolve({ results: [] });
        }
      });
    });
    req.on('error', (e) => {
      console.error('[dep-scan] OSV request error:', e.message);
      resolve({ results: [] });
    });
    req.setTimeout(15000, () => {
      console.warn('[dep-scan] OSV timed out');
      req.destroy();
      resolve({ results: [] });
    });
    req.write(body);
    req.end();
  });
}

// ── Parse dependency files ──────────────────────────────────────
function parseDependencies(content, filename) {
  const deps = [];
  try {
    if (filename.endsWith('package.json') || filename.endsWith('package-lock.json')) {
      const json = JSON.parse(content);
      const allDeps = { ...json.dependencies, ...json.devDependencies };
      for (const [name, version] of Object.entries(allDeps)) {
        const v = String(version).replace(/[\^~>=<]/g, '').split(' ')[0].trim();
        if (v && v !== '*') deps.push({ name, version: v, ecosystem: 'npm' });
      }
    } else if (filename.endsWith('requirements.txt')) {
      content.split('\n').forEach(line => {
        line = line.trim();
        if (!line || line.startsWith('#')) return;
        const match = line.match(/^([A-Za-z0-9_.-]+)[=<>!~]+=?([A-Za-z0-9._-]+)?/);
        if (match) deps.push({ name: match[1], version: match[2] || '', ecosystem: 'PyPI' });
      });
    } else if (filename.endsWith('pom.xml')) {
      const matches = content.matchAll(/<dependency>[\s\S]*?<groupId>(.*?)<\/groupId>[\s\S]*?<artifactId>(.*?)<\/artifactId>[\s\S]*?(?:<version>(.*?)<\/version>)?[\s\S]*?<\/dependency>/g);
      for (const m of matches) {
        deps.push({ name: `${m[1]}:${m[2]}`, version: m[3] || '', ecosystem: 'Maven' });
      }
    } else if (filename.endsWith('go.sum') || filename.endsWith('go.mod')) {
      content.split('\n').forEach(line => {
        const match = line.match(/^([^\s]+)\s+v([^\s]+)/);
        if (match) deps.push({ name: match[1], version: match[2], ecosystem: 'Go' });
      });
    }
  } catch {}
  return deps.slice(0, 100); // OSV batch limit
}

// ── Fetch individual OSV vuln detail for better summary ────────
function osvGetVuln(vulnId) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'api.osv.dev',
      path: `/v1/vulns/${vulnId}`,
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(8000, () => { req.destroy(); resolve(null); });
    req.end();
  });
}

function resolveOrgId(req) {
  // SECURITY: orgId must come ONLY from the verified Firebase ID token (req.user),
  // never from req.body — a client could otherwise supply an arbitrary orgId.
  // Additionally, we only write to the org project tree when the client
  // explicitly signals this is an org project (isOrgProject: true).
  // This prevents orphan writes when an org-linked employee analyzes
  // their own personal projects from UserDashboard.
  if (req.body?.isOrgProject === true) {
    return req.user?.orgId || null;
  }
  return null;
}

// ── Helper: get next version number for a project ──────────────
async function getNextVersionNumber(orgId, projectId) {
  const versionsSnap = await db
    .collection('organizations').doc(orgId)
    .collection('projects').doc(projectId)
    .collection('versions')
    .get();
  return versionsSnap.size + 1; // v1, v2, v3...
}

// ── Helper: calculate + update project progress based on completed phases ──
// Progress = (completed phases / 6 total phases) × 100
// Phases: requirement, design, development, sca, pipeline, crossphase
const SDLC_PHASES = ['requirement', 'design', 'development', 'sca', 'pipeline', 'crossphase'];

async function recalculateProgress(orgId, projectId) {
  try {
    const phasesSnap = await db
      .collection('organizations').doc(orgId)
      .collection('projects').doc(projectId)
      .collection('phases')
      .get();

    const approvedPhases  = new Set(phasesSnap.docs.filter(d => d.data().status === 'completed').map(d => d.id));
    const submittedPhases = new Set(phasesSnap.docs.filter(d => d.data().status === 'submitted').map(d => d.id));
    const allActivePhases = new Set([...approvedPhases, ...submittedPhases]);

    // Progress: approved phases count fully, submitted count as 80% (pending review)
    const progress = Math.round(
      ((approvedPhases.size * 1.0 + submittedPhases.size * 0.8) / SDLC_PHASES.length) * 100
    );

    // currentPhase = first phase not yet submitted or approved
    const currentPhase = SDLC_PHASES.find(p => !allActivePhases.has(p)) || 'completed';
    const status = approvedPhases.size >= SDLC_PHASES.length ? 'completed' : 'in-progress';

    await db
      .collection('organizations').doc(orgId)
      .collection('projects').doc(projectId)
      .set({ progress, currentPhase, status, updatedAt: FieldValue.serverTimestamp() }, { merge: true });

    return progress;
  } catch (err) {
    console.error('[recalculateProgress] error:', err);
    return null;
  }
}

// ── Helper: save phase result into a version doc ──────────────
async function saveToVersion(orgId, projectId, phase, phaseData, userId, userEmail) {
  const versionNumber = await getNextVersionNumber(orgId, projectId);
  const versionId = `v${versionNumber}`;

  const versionRef = db
    .collection('organizations').doc(orgId)
    .collection('projects').doc(projectId)
    .collection('versions').doc(versionId);

  // Create version doc
  await versionRef.set({
    versionNumber,
    versionId,
    analyzedPhase: phase,
    analyzedBy: userEmail,
    analyzedByUid: userId,
    createdAt: FieldValue.serverTimestamp(),
  });

  // Save phase data inside version
  await versionRef.collection('phases').doc(phase).set({
    phase,
    ...phaseData,
    savedAt: FieldValue.serverTimestamp(),
  });

  return versionId;
}

/**
 * POST /api/analysis/requirements
 */
router.post('/requirements', verifyToken, async (req, res) => {
  try {
    const {
      projectId,
      authentication = false,
      sensitiveData  = false,
      encryption     = false,
      dataStorage    = false,
      thirdPartyAPIs = false,
      compliance     = [],
      requirementsText = '',
      codeSnippet    = '',
    } = req.body;

    const sanitizedText = sanitizeString(requirementsText || codeSnippet, 10000);
    let result = null;

    if (sanitizedText.trim()) {
      result = await analyzeRequirementsWithAI(sanitizedText);
    }

    if (!result) {
      console.log('[analysis] AI unavailable — using keyword scanner fallback');
      result = analyzeRequirements({
        authentication, sensitiveData, encryption, dataStorage,
        thirdPartyAPIs, compliance,
        requirementsText: sanitizeString(requirementsText, 5000),
        codeSnippet:      sanitizeString(codeSnippet, 10000),
      });
    }

    if (projectId) {
      const orgId = resolveOrgId(req);
      if (orgId) {
        // Only write to the org project tree if this projectId genuinely belongs to the org —
        // prevents orphan subcollections when an org-linked user runs analysis on a personal project.
        const orgProjectRef = db.collection('organizations').doc(orgId).collection('projects').doc(projectId);
        const orgProjectSnap = await orgProjectRef.get();
        let versionId = null;

        if (orgProjectSnap.exists) {
          const phaseData = {
            completion: result.securityScore >= 80 ? 100 : result.securityScore >= 50 ? 75 : 50,
            status: 'submitted',
            analysisData: {
              controls: { authentication, sensitiveData, encryption, dataStorage, thirdPartyAPIs },
              compliance,
              requirementsText: requirementsText.slice(0, 500),
              result,
            },
          };

          // ── 1. Save version (NEW) ──
          versionId = await saveToVersion(
            orgId, projectId, 'requirement', phaseData,
            req.user.uid, req.user.email
          );

          // ── 2. Update project-level phase doc (for quick dashboard access) ──
          await db
            .collection('organizations').doc(orgId)
            .collection('projects').doc(projectId)
            .collection('phases').doc('requirement')
            .set({ phase: 'requirement', latestVersionId: versionId, ...phaseData, updatedAt: FieldValue.serverTimestamp() }, { merge: true });

          // ── 3. Update project stats ──
          await db
            .collection('organizations').doc(orgId)
            .collection('projects').doc(projectId)
            .set({
              riskScore:     result.riskScore,
              securityScore: result.securityScore,
              lastScanAt:    FieldValue.serverTimestamp(),
              updatedAt:     FieldValue.serverTimestamp(),
              latestVersionId: versionId,
            }, { merge: true });

          // ── 4. Save vulnerabilities ──
          const vulnsRef = db
            .collection('organizations').doc(orgId)
            .collection('projects').doc(projectId)
            .collection('vulnerabilities');

          const batch = db.batch();
          result.findings.forEach(finding => {
            const ref = vulnsRef.doc();
            batch.set(ref, {
              title:          finding.issue,
              severity:       finding.severity,
              description:    finding.issue,
              recommendation: finding.recommendation,
              phase:          'requirement',
              versionId,
              isResolved:     false,
              createdAt:      FieldValue.serverTimestamp(),
            });
          });
          await batch.commit();

          // ── 5. Auto-recalculate project progress based on completed phases ──
          await recalculateProgress(orgId, projectId);
        }

        // Always log to the org activity feed for any org-linked user — even on personal projects —
        // so OrgAdminDashboard's Employees/Audit Log views show real activity. Independent of orgProjectSnap.exists.
        await db.collection('activityLogs').add({
          orgId,
          userId:   req.user.uid,
          userName: req.user.email,
          action:   `Requirement analysis${versionId ? ` (${versionId})` : ''} — Risk: ${result.riskScore}/100`,
          type:     result.riskScore > 70 ? 'warning' : 'success',
          createdAt: FieldValue.serverTimestamp(),
        });

        return res.json({ success: true, analysis: result, versionId: versionId ?? undefined });
      }
    }

    res.json({ success: true, analysis: result });
  } catch (err) {
    console.error('Requirement analysis error:', err);
    res.status(500).json({ error: 'Analysis failed' });
  }
});

/**
 * POST /api/analysis/threats
 */
router.post('/threats', verifyToken, async (req, res) => {
  try {
    const { projectId, components = [], designCode = '' } = req.body;

    if (!components || components.length === 0) {
      const autoComponents = [];
      if (designCode.toLowerCase().includes('api') || designCode.toLowerCase().includes('route'))
        autoComponents.push({ name: 'API Service', type: 'API' });
      if (designCode.toLowerCase().includes('database') || designCode.toLowerCase().includes('db') || designCode.toLowerCase().includes('sql'))
        autoComponents.push({ name: 'Database Layer', type: 'Database' });
      if (designCode.toLowerCase().includes('client') || designCode.toLowerCase().includes('frontend') || designCode.toLowerCase().includes('react'))
        autoComponents.push({ name: 'Web Client', type: 'Client' });
      if (designCode.toLowerCase().includes('server') || designCode.toLowerCase().includes('express') || designCode.toLowerCase().includes('node'))
        autoComponents.push({ name: 'Application Server', type: 'Server' });
      if (autoComponents.length === 0)
        autoComponents.push({ name: 'Application', type: 'Server' });
      req.body.components = autoComponents;
    }

    let result = await analyzeThreatModelWithAI(req.body.components, req.body.designCode || '');
    if (!result) {
      console.log('[analysis] AI unavailable — using STRIDE engine fallback');
      result = analyzeThreatModel(req.body.components, req.body.designCode || '');
    }

    if (projectId) {
      const orgId = resolveOrgId(req);
      if (orgId) {
        const orgProjectRef = db.collection('organizations').doc(orgId).collection('projects').doc(projectId);
        const orgProjectSnap = await orgProjectRef.get();
        let versionId = null;

        if (orgProjectSnap.exists) {
          const phaseData = {
            completion: 100,
            status: 'submitted',
            analysisData: { components: req.body.components, result },
          };

          // ── 1. Save version (NEW) ──
          versionId = await saveToVersion(
            orgId, projectId, 'design', phaseData,
            req.user.uid, req.user.email
          );

          // ── 2. Update project-level phase doc ──
          await db
            .collection('organizations').doc(orgId)
            .collection('projects').doc(projectId)
            .collection('phases').doc('design')
            .set({ phase: 'design', latestVersionId: versionId, ...phaseData, updatedAt: FieldValue.serverTimestamp() }, { merge: true });

          await db
            .collection('organizations').doc(orgId)
            .collection('projects').doc(projectId)
            .set({
              riskScore:  result.riskScore,
              lastScanAt: FieldValue.serverTimestamp(),
              updatedAt:  FieldValue.serverTimestamp(),
              latestVersionId: versionId,
            }, { merge: true });

          const vulnsRef = db
            .collection('organizations').doc(orgId)
            .collection('projects').doc(projectId)
            .collection('vulnerabilities');

          const batch = db.batch();
          result.threats.slice(0, 20).forEach(threat => {
            const ref = vulnsRef.doc();
            batch.set(ref, {
              title:          `[${threat.category}] ${threat.component}`,
              severity:       threat.severity,
              description:    threat.description,
              recommendation: threat.mitigation,
              phase:          'design',
              versionId,
              strideCategory: threat.category,
              isResolved:     false,
              createdAt:      FieldValue.serverTimestamp(),
            });
          });
          await batch.commit();
          await recalculateProgress(orgId, projectId);
        }

        await db.collection('activityLogs').add({
          orgId,
          userId:   req.user.uid,
          userName: req.user.email,
          action:   `STRIDE analysis${versionId ? ` (${versionId})` : ''} — ${result.threats.length} threats found`,
          type:     result.criticalCount > 0 ? 'warning' : 'success',
          createdAt: FieldValue.serverTimestamp(),
        });

        return res.json({ success: true, analysis: result, versionId: versionId ?? undefined });
      }
    }

    res.json({ success: true, analysis: result });
  } catch (err) {
    console.error('Threat analysis error:', err);
    res.status(500).json({ error: 'Threat analysis failed' });
  }
});

/**
 * POST /api/analysis/code
 */
router.post('/code', verifyTokenOrApiKey, async (req, res) => {
  try {
    const { projectId, sourceCode = '', language = 'javascript' } = req.body;

    if (!sourceCode.trim()) {
      return res.status(400).json({ error: 'sourceCode is required' });
    }

    let result = await analyzeCodeWithAI(sourceCode, language);
    if (!result) {
      console.log('[analysis] AI unavailable — using SAST scanner fallback');
      result = analyzeCode(sourceCode, language);
    }

    // ── CI provenance: tag every finding with where the scan came from ──
    const source = req.user?.role === 'ci' ? 'ci' : 'manual';
    const commitSha = source === 'ci' ? (req.body.commitSha || null) : null;
    const branch   = source === 'ci' ? (req.body.branch   || null) : null;
    result.vulnerabilities = result.vulnerabilities.map(v => ({ ...v, source, commitSha, branch }));

    if (projectId) {
      const orgId = resolveOrgId(req);
      if (orgId) {
        const orgProjectRef = db.collection('organizations').doc(orgId).collection('projects').doc(projectId);
        const orgProjectSnap = await orgProjectRef.get();
        let versionId = null;

        if (orgProjectSnap.exists) {
          const phaseData = {
            completion: 100,
            status: 'submitted',
            analysisData: {
              language,
              linesScanned: result.linesScanned,
              summary: result.summary,
              riskScore: result.riskScore,
              vulnerabilities: result.vulnerabilities,
              source,
              commitSha,
              branch,
            },
          };

          // ── 1. Save version (NEW) ──
          versionId = await saveToVersion(
            orgId, projectId, 'development', phaseData,
            req.user.uid, req.user.email
          );

          // ── 2. Update project-level phase doc ──
          await db
            .collection('organizations').doc(orgId)
            .collection('projects').doc(projectId)
            .collection('phases').doc('development')
            .set({ phase: 'development', latestVersionId: versionId, ...phaseData, updatedAt: FieldValue.serverTimestamp() }, { merge: true });

          await db
            .collection('organizations').doc(orgId)
            .collection('projects').doc(projectId)
            .set({
              riskScore:  result.riskScore,
              lastScanAt: FieldValue.serverTimestamp(),
              status:     result.riskLevel === 'Critical' ? 'critical' : 'in-progress',
              updatedAt:  FieldValue.serverTimestamp(),
              latestVersionId: versionId,
            }, { merge: true });

          const vulnsRef = db
            .collection('organizations').doc(orgId)
            .collection('projects').doc(projectId)
            .collection('vulnerabilities');

          const batch = db.batch();
          result.vulnerabilities.slice(0, 30).forEach(vuln => {
            const ref = vulnsRef.doc();
            batch.set(ref, {
              title:          vuln.name,
              severity:       vuln.severity,
              description:    `Line ${vuln.lineNumber}: ${vuln.description}`,
              recommendation: vuln.recommendation,
              phase:          'development',
              versionId,
              owasp:          vuln.owasp,
              lineNumber:     vuln.lineNumber,
              isResolved:     false,
              source,
              ...(source === 'ci' ? { commitSha, branch } : {}),
              createdAt:      FieldValue.serverTimestamp(),
            });
          });
          await batch.commit();
          await recalculateProgress(orgId, projectId);
        }

        await db.collection('activityLogs').add({
          orgId,
          userId:   req.user.uid,
          userName: req.user.email,
          action:   `Code review${versionId ? ` (${versionId})` : ''} — ${result.summary.total} issues (${result.summary.critical} critical)`,
          type:     result.summary.critical > 0 ? 'warning' : 'success',
          createdAt: FieldValue.serverTimestamp(),
        });

        return res.json({ success: true, analysis: result, versionId: versionId ?? undefined });
      }
    }

    res.json({ success: true, analysis: result });
  } catch (err) {
    console.error('Code analysis error:', err);
    res.status(500).json({ error: 'Code analysis failed' });
  }
});

/**
 * POST /api/analysis/ai-proxy
 */
router.post('/ai-proxy', verifyToken, async (req, res) => {
  try {
    const { type, content, language = 'javascript', isOrgProject, orgId: bodyOrgId, projectId } = req.body;

    if (type === 'code') {
      if (!content?.trim()) {
        return res.status(400).json({ error: 'content is required' });
      }

      let aiResult = await analyzeCodeWithAI(content, language);
      if (!aiResult) {
        console.log('[analysis] AI unavailable — using SAST scanner fallback for ai-proxy');
        const sastResult = analyzeCode(content, language);
        aiResult = {
          vulnerabilities: sastResult.vulnerabilities.map(v => ({
            id:          v.id,
            line:        v.lineNumber,
            code:        v.codeLine,
            severity:    v.severity.toLowerCase(),
            type:        v.name,
            description: v.description,
            fix:         v.recommendation,
            cwe:         v.owasp,
          })),
          summary:         sastResult.recommendation,
          overallRisk:     sastResult.riskLevel.toLowerCase(),
          recommendations: sastResult.owaspCoverage,
          codeQuality: {
            score:  Math.max(0, 100 - sastResult.riskScore),
            issues: sastResult.vulnerabilities.map(v => `Line ${v.lineNumber}: ${v.name}`),
          },
          aiPowered: false,
        };
      }

      // Save to org project if this is an org-context code review
      // isOrgProject must be true AND orgId must match the verified token (security check)
      if (isOrgProject === true && projectId && req.user?.orgId) {
        const orgId = req.user.orgId; // always use token orgId, never trust body orgId
        try {
          const orgProjectRef = db.collection('organizations').doc(orgId).collection('projects').doc(projectId);
          const orgProjectSnap = await orgProjectRef.get();
          if (orgProjectSnap.exists) {
            const criticalCount = (aiResult.vulnerabilities ?? []).filter(v => v.severity === 'critical').length;
            const phaseData = {
              completion: 100,
              status: 'submitted',
              analysisData: { language, result: aiResult },
            };

            const versionId = await saveToVersion(orgId, projectId, 'development', phaseData, req.user.uid, req.user.email);

            await db.collection('organizations').doc(orgId)
              .collection('projects').doc(projectId)
              .collection('phases').doc('development')
              .set({ phase: 'development', latestVersionId: versionId, ...phaseData, updatedAt: FieldValue.serverTimestamp() }, { merge: true });

            await orgProjectRef.set({
              riskScore:    Math.min(100, (aiResult.vulnerabilities ?? []).length * 5 + criticalCount * 20),
              updatedAt:    FieldValue.serverTimestamp(),
              latestVersionId: versionId,
            }, { merge: true });

            // Save vulnerabilities
            const batch = db.batch();
            (aiResult.vulnerabilities ?? []).forEach(v => {
              const ref = db.collection('organizations').doc(orgId)
                .collection('projects').doc(projectId)
                .collection('vulnerabilities').doc();
              batch.set(ref, {
                title:          v.type || v.description,
                severity:       v.severity,
                description:    v.description,
                recommendation: v.fix,
                phase:          'development',
                versionId,
                isResolved:     false,
                createdAt:      FieldValue.serverTimestamp(),
              });
            });
            await batch.commit();
            await recalculateProgress(orgId, projectId);

            await db.collection('activityLogs').add({
              orgId,
              userId:   req.user.uid,
              userName: req.user.email,
              action:   `Code Review (SAST)${versionId ? ` (${versionId})` : ''} — ${(aiResult.vulnerabilities ?? []).length} issues found`,
              type:     criticalCount > 0 ? 'warning' : 'success',
              createdAt: FieldValue.serverTimestamp(),
            });
          }
        } catch (saveErr) {
          console.error('[ai-proxy] Org project save error (non-fatal):', saveErr);
          // Don't fail the response — the result is still returned to the frontend
        }
      }

      return res.json({ success: true, result: aiResult });
    }

    return res.status(400).json({ error: `Unknown analysis type: ${type}` });
  } catch (err) {
    console.error('AI proxy error:', err);
    res.status(500).json({ error: 'Analysis failed' });
  }
});

// ══════════════════════════════════════════════════════════════
// VERSION HISTORY ENDPOINTS (NEW)
// ══════════════════════════════════════════════════════════════

/**
 * GET /api/analysis/versions/:projectId
 * Returns all versions for a project (list view)
 */
router.get('/versions/:projectId', verifyToken, async (req, res) => {
  try {
    const orgId = req.user.orgId || req.query.orgId;
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
    console.error('Get versions error:', err);
    res.status(500).json({ error: 'Failed to fetch versions' });
  }
});

/**
 * GET /api/analysis/versions/:projectId/:versionId
 * Returns full detail of one version including all its phase reports
 */
router.get('/versions/:projectId/:versionId', verifyToken, async (req, res) => {
  try {
    const orgId = req.user.orgId || req.query.orgId;
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
    res.status(500).json({ error: 'Failed to fetch version' });
  }
});

// ══════════════════════════════════════════════════════════════
// PHASE MAPPING — CROSS-PHASE CONSISTENCY CHECKER
// ══════════════════════════════════════════════════════════════

/**
 * POST /api/analysis/phase-mapping
 * Body: { projectId?, requirementResult?, threatResult?, codeResult?, pipelineResult? }
 * At least one phase result must be provided.
 * Saves result to Firestore history if projectId provided.
 */
router.post('/phase-mapping', verifyToken, async (req, res) => {
  try {
    const { projectId, requirementResult, threatResult, codeResult, pipelineResult, requirementsText } = req.body;

    if (!requirementResult && !threatResult && !codeResult && !pipelineResult) {
      return res.status(400).json({ error: 'At least one phase result (requirementResult, threatResult, codeResult, or pipelineResult) is required' });
    }

    let result = await analyzePhaseMappingWithAI({ requirementResult, threatResult, codeResult, pipelineResult, requirementsText });

    if (!result) {
      console.log('[phase-mapping] AI unavailable — keyword fallback');
      const warnings = [];
      const conflicts = [];

      if (requirementResult && !codeResult) {
        warnings.push({
          id: 'W001', control: 'Code Review',
          requirement: 'Security requirements defined',
          gap: 'Code review phase not completed',
          missingIn: ['code'], severity: 'high',
          recommendation: 'Complete code review to verify implementation matches requirements',
        });
      }
      if (requirementResult && threatResult) {
        const reqScore = requirementResult.securityScore ?? 50;
        const threatRisk = threatResult.riskScore ?? 50;
        if (threatRisk > reqScore + 20) {
          conflicts.push({
            id: 'X001', control: 'Security posture consistency',
            requirement: `Requirements security score: ${reqScore}/100`,
            violation: `Threat model risk score: ${threatRisk}/100 — gap too large`,
            conflictBetween: ['requirement', 'design'], severity: 'high',
            recommendation: 'Review requirements to address threats found in design phase',
          });
        }
      }

      result = {
        summary: 'Keyword-based phase analysis (AI unavailable). Manual review recommended.',
        overallScore: Math.max(20, 70 - conflicts.length * 15 - warnings.length * 8),
        conflicts,
        warnings,
        consistent: [],
        phasesCovered: [
          requirementResult && 'requirement',
          threatResult && 'design',
          codeResult && 'code',
          pipelineResult && 'pipeline',
        ].filter(Boolean),
        phasesGap: ['requirement', 'design', 'code', 'pipeline'].filter(p =>
          !(p === 'requirement' && requirementResult) &&
          !(p === 'design' && threatResult) &&
          !(p === 'code' && codeResult) &&
          !(p === 'pipeline' && pipelineResult)
        ),
        topActions: ['Complete all analysis phases (requirement, design, development, SCA, pipeline) for accurate cross-phase mapping'],
        aiPowered: false,
      };
    }

    // Save to Firestore if projectId provided
    if (projectId) {
      const orgId = resolveOrgId(req);
      if (orgId) {
        const orgProjectRef = db.collection('organizations').doc(orgId).collection('projects').doc(projectId);
        const orgProjectSnap = await orgProjectRef.get();
        let versionId = null;

        if (orgProjectSnap.exists) {
          const versionNumber = await getNextVersionNumber(orgId, projectId);
          versionId = `v${versionNumber}`;

          const versionRef = db
            .collection('organizations').doc(orgId)
            .collection('projects').doc(projectId)
            .collection('versions').doc(versionId);

          await versionRef.set({
            versionNumber,
            versionId,
            analyzedPhase: 'crossphase', // FIX: was 'cross-phase' (hyphenated) — mismatched every
            // other phase key ('crossphase', no hyphen) used in the project-level phases doc,
            // PHASE_CONFIG lookups in ProjectVersionHistory.tsx, and phaseLabel maps in the
            // dashboards. That mismatch caused cross-phase analysis versions to silently fail
            // to render anywhere phase keys are looked up by exact match.
            analyzedBy: req.user.email,
            analyzedByUid: req.user.uid,
            createdAt: FieldValue.serverTimestamp(),
          });

          await versionRef.collection('phases').doc('crossphase').set({
            phase: 'crossphase',
            result,
            phasesCovered: result.phasesCovered,
            overallScore: result.overallScore,
            consistentCount: result.consistent.length,
            warningCount: result.warnings.length,
            conflictCount: result.conflicts.length,
            savedAt: FieldValue.serverTimestamp(),
          });

          await db
            .collection('organizations').doc(orgId)
            .collection('projects').doc(projectId)
            .set({
              lastPhaseMappingAt: FieldValue.serverTimestamp(),
              phaseMappingScore: result.overallScore,
              updatedAt: FieldValue.serverTimestamp(),
            }, { merge: true });

          // Save phase doc so recalculate can count it.
          // FIX: previously didn't store analysisData/result here (only requirement/design/
          // development did), so the full project report had no cross-phase section to pull from.
          await db
            .collection('organizations').doc(orgId)
            .collection('projects').doc(projectId)
            .collection('phases').doc('crossphase')
            .set({
              phase: 'crossphase',
              status: 'submitted',
              completion: result.overallScore,
              latestVersionId: versionId,
              analysisData: { result },
              updatedAt: FieldValue.serverTimestamp(),
            }, { merge: true });

          await recalculateProgress(orgId, projectId);
        }

        await db.collection('activityLogs').add({
          orgId,
          userId:   req.user.uid,
          userName: req.user.email,
          action:   `Cross-phase consistency check — Score: ${result.overallScore}/100, ${result.conflicts.length} conflicts, ${result.warnings.length} warnings`,
          type:     result.conflicts.length > 0 ? 'warning' : 'success',
          createdAt: FieldValue.serverTimestamp(),
        });

        return res.json({ success: true, result, versionId: versionId ?? undefined });
      }
    }

    res.json({ success: true, result });
  } catch (err) {
    console.error('Phase mapping error:', err);
    res.status(500).json({ error: 'Phase mapping failed' });
  }
});

// ══════════════════════════════════════════════════════════════
// DEPENDENCY / SCA SCANNING  (OSV API — free, no key needed)
// ══════════════════════════════════════════════════════════════

/**
 * POST /api/analysis/dependencies
 * Body: { content: string, filename: string, projectId?: string }
 * Accepts the raw text content of package.json / requirements.txt / pom.xml / go.mod
 */
router.post('/dependencies', verifyTokenOrApiKey, async (req, res) => {
  try {
    const { content, filename, projectId } = req.body;
    if (!content || !filename) {
      return res.status(400).json({ error: 'content and filename are required' });
    }

    const deps = parseDependencies(content, filename);
    if (deps.length === 0) {
      return res.json({ success: true, dependencies: [], vulnerabilities: [], totalDeps: 0, vulnCount: 0 });
    }

    // Build OSV batch query
    const packages = deps.map(d => ({
      package: { name: d.name, ecosystem: d.ecosystem },
      version: d.version,
    }));

    const osvData = await osvQuery(packages);
    const results = osvData.results || [];

    // Build raw list with deduplication key = package:vulnId
    const seen = new Set();
    const rawVulns = [];

    results.forEach((result, i) => {
      const dep = deps[i];
      if (!dep || !result.vulns?.length) return;
      result.vulns.forEach(vuln => {
        const dedupKey = `${dep.name}:${vuln.id}`;
        if (seen.has(dedupKey)) return;
        seen.add(dedupKey);

        const cvssScore = vuln.severity?.[0]?.score ?? null;
        let severity = 'Medium';
        if (cvssScore !== null) {
          if (cvssScore >= 9.0)      severity = 'Critical';
          else if (cvssScore >= 7.0) severity = 'High';
          else if (cvssScore >= 4.0) severity = 'Medium';
          else                       severity = 'Low';
        } else {
          const dbSev = (vuln.database_specific?.severity || '').toUpperCase();
          if (dbSev === 'CRITICAL')                            severity = 'Critical';
          else if (dbSev === 'HIGH')                           severity = 'High';
          else if (dbSev === 'MODERATE' || dbSev === 'MEDIUM') severity = 'Medium';
          else if (dbSev === 'LOW')                            severity = 'Low';
        }

        let fixedIn = null;
        for (const aff of vuln.affected || []) {
          for (const range of aff.ranges || []) {
            for (const event of range.events || []) {
              if (event.fixed) { fixedIn = event.fixed; break; }
            }
            if (fixedIn) break;
          }
          if (fixedIn) break;
        }

        const refs = vuln.references || [];
        const advisoryRef = refs.find(r => r.type === 'ADVISORY') || refs.find(r => r.type === 'WEB') || refs[0];
        const link = advisoryRef?.url || `https://osv.dev/vulnerability/${vuln.id}`;

        rawVulns.push({
          package: dep.name,
          version: dep.version,
          ecosystem: dep.ecosystem,
          id: vuln.id,
          // Use summary if available, else details, else we'll fetch
          summary: vuln.summary || vuln.details?.slice(0, 300) || null,
          severity,
          cvssScore,
          aliases: vuln.aliases || [],
          fixedIn,
          link,
        });
      });
    });

    // Fetch summaries for vulns that still have null summary (up to 10 to avoid rate limit)
    const missingIdx = rawVulns.map((v, i) => (!v.summary ? i : -1)).filter(i => i >= 0).slice(0, 10);
    await Promise.all(missingIdx.map(async (i) => {
      const detail = await osvGetVuln(rawVulns[i].id);
      if (detail) {
        rawVulns[i].summary = detail.summary || detail.details?.slice(0, 300) || `Vulnerability in ${rawVulns[i].package}`;
      } else {
        rawVulns[i].summary = `Known vulnerability in ${rawVulns[i].package} ${rawVulns[i].version} — see advisory for details`;
      }
    }));

    // Fill remaining nulls with generic message
    rawVulns.forEach(v => {
      if (!v.summary) v.summary = `Known vulnerability in ${v.package} ${v.version} — see advisory for details`;
    });

    const severityOrder = { Critical: 0, High: 1, Medium: 2, Low: 3 };
    const vulnerabilities = rawVulns.sort((a, b) => (severityOrder[a.severity] ?? 4) - (severityOrder[b.severity] ?? 4));

    // ── CI provenance: tag every finding with where the scan came from ──
    const source = req.user?.role === 'ci' ? 'ci' : 'manual';
    const commitSha = source === 'ci' ? (req.body.commitSha || null) : null;
    const branch   = source === 'ci' ? (req.body.branch   || null) : null;
    vulnerabilities.forEach(v => { v.source = source; v.commitSha = commitSha; v.branch = branch; });

    const summary = {
      totalDeps: deps.length,
      vulnCount: vulnerabilities.length,
      critical: vulnerabilities.filter(v => v.severity === 'Critical').length,
      high: vulnerabilities.filter(v => v.severity === 'High').length,
      medium: vulnerabilities.filter(v => v.severity === 'Medium').length,
      low: vulnerabilities.filter(v => v.severity === 'Low').length,
      ecosystems: [...new Set(deps.map(d => d.ecosystem))],
    };

    // Save to Firestore if projectId provided
    if (projectId) {
      const orgId = resolveOrgId(req);
      if (orgId) {
        const orgProjectRef = db.collection('organizations').doc(orgId).collection('projects').doc(projectId);
        const orgProjectSnap = await orgProjectRef.get();

        if (orgProjectSnap.exists) {
          await orgProjectRef.set({
            lastSCAAt: FieldValue.serverTimestamp(),
            scaVulnCount: summary.vulnCount,
            scaCritical: summary.critical,
            updatedAt: FieldValue.serverTimestamp(),
          }, { merge: true });

          // FIX: SCA scans previously never created a version and never stored the actual
          // scan results (dependencies/vulnerabilities) on the phase doc — only a bare
          // completion flag. That's why dependency scans never showed up in the Version
          // History and were missing from the full project report. Now mirrors the same
          // pattern used by requirement/design/development.
          const phaseData = {
            completion: 100,
            status: 'submitted',
            analysisData: {
              filename,
              dependencies: deps,
              vulnerabilities,
              ...summary,
              source,
              commitSha,
              branch,
            },
          };

          const versionId = await saveToVersion(
            orgId, projectId, 'sca', phaseData,
            req.user.uid, req.user.email
          );

          // Save phase doc so recalculate can count it
          await db
            .collection('organizations').doc(orgId)
            .collection('projects').doc(projectId)
            .collection('phases').doc('sca')
            .set({ phase: 'sca', latestVersionId: versionId, ...phaseData, updatedAt: FieldValue.serverTimestamp() }, { merge: true });

          await recalculateProgress(orgId, projectId);
        }

        await db.collection('activityLogs').add({
          orgId,
          userId: req.user.uid,
          userName: req.user.email,
          action: `SCA scan (${filename}) — ${summary.vulnCount} vulnerabilities in ${summary.totalDeps} dependencies`,
          type: summary.critical > 0 ? 'warning' : summary.high > 0 ? 'warning' : 'success',
          createdAt: FieldValue.serverTimestamp(),
        });
      }
    }

    res.json({ success: true, dependencies: deps, vulnerabilities, ...summary });
  } catch (err) {
    console.error('Dependency scan error:', err);
    res.status(500).json({ error: 'Dependency scan failed' });
  }
});

// ══════════════════════════════════════════════════════════════
// PIPELINE / CI/CD SECURITY SCANNING
// ══════════════════════════════════════════════════════════════

/**
 * POST /api/analysis/pipeline-config
 * Body: { content: string, filename: string, projectId?: string }
 * Scans CI/CD configuration files for security misconfigurations
 */
router.post('/pipeline-config', verifyTokenOrApiKey, async (req, res) => {
  try {
    const { content, filename, projectId } = req.body;
    if (!content || !filename) {
      return res.status(400).json({ error: 'content and filename are required' });
    }

    // Validate filename is a supported CI/CD config file
    const lowerFilename = filename.toLowerCase();
    const isSupported = lowerFilename.endsWith('.yml') || lowerFilename.endsWith('.yaml') ||
      lowerFilename.includes('dockerfile') || lowerFilename.includes('docker-compose');
    if (!isSupported) {
      return res.status(400).json({ error: 'Unsupported file type. Supported: .yml, .yaml, Dockerfile, docker-compose' });
    }

    // Run pipeline security scan
    const result = analyzePipelineConfig(content, filename);
    const { findings, summary, riskScore, riskLevel } = result;

    // Save to Firestore if projectId provided
    if (projectId) {
      const orgId = resolveOrgId(req);
      if (orgId) {
        const orgProjectRef = db.collection('organizations').doc(orgId).collection('projects').doc(projectId);
        const orgProjectSnap = await orgProjectRef.get();

        if (orgProjectSnap.exists) {
          await orgProjectRef.set({
            lastPipelineScanAt: FieldValue.serverTimestamp(),
            pipelineFindings: summary.totalFindings,
            pipelineRiskLevel: riskLevel,
            updatedAt: FieldValue.serverTimestamp(),
          }, { merge: true });

          const phaseData = {
            completion: 100,
            status: 'submitted',
            analysisData: {
              filename,
              findings,
              ...summary,
              riskScore,
              riskLevel,
            },
          };

          const versionId = await saveToVersion(
            orgId, projectId, 'pipeline', phaseData,
            req.user.uid, req.user.email
          );

          // Save phase doc so recalculateProgress can count it
          await db
            .collection('organizations').doc(orgId)
            .collection('projects').doc(projectId)
            .collection('phases').doc('pipeline')
            .set({ phase: 'pipeline', latestVersionId: versionId, ...phaseData, updatedAt: FieldValue.serverTimestamp() }, { merge: true });

          await recalculateProgress(orgId, projectId);
        }

        await db.collection('activityLogs').add({
          orgId,
          userId: req.user.uid,
          userName: req.user.email,
          action: `Pipeline security scan (${filename}) — ${summary.totalFindings} findings (${riskLevel} risk)`,
          type: summary.critical > 0 ? 'warning' : summary.high > 0 ? 'warning' : 'success',
          createdAt: FieldValue.serverTimestamp(),
        });
      }
    }

    res.json({ success: true, findings, ...summary, riskScore, riskLevel });
  } catch (err) {
    console.error('Pipeline security scan error:', err);
    res.status(500).json({ error: 'Pipeline security scan failed' });
  }
});

/**
 * POST /api/analysis/assign-vulnerability
 * Org admin assigns a vulnerability to a team member
 */
router.post('/assign-vulnerability', verifyToken, async (req, res) => {
  try {
    const { projectId, vulnId, assignToUid, note } = req.body;
    const orgId = req.user?.orgId;
    if (!orgId) return res.status(403).json({ error: 'No org context' });
    if (!projectId || !vulnId || !assignToUid) {
      return res.status(400).json({ error: 'projectId, vulnId and assignToUid required' });
    }

    const vulnRef = db.collection('organizations').doc(orgId)
      .collection('projects').doc(projectId)
      .collection('vulnerabilities').doc(vulnId);

    const vulnSnap = await vulnRef.get();
    if (!vulnSnap.exists) return res.status(404).json({ error: 'Vulnerability not found' });

    // Get assignee name from users collection
    const assigneeSnap = await db.collection('users').doc(assignToUid).get();
    const assigneeName = assigneeSnap.exists
      ? (assigneeSnap.data().fullName || assigneeSnap.data().email)
      : assignToUid;

    await vulnRef.update({
      assignedTo:     assignToUid,
      assignedToName: assigneeName,
      assignedBy:     req.user.uid,
      assignedAt:     FieldValue.serverTimestamp(),
      assignNote:     note || '',
    });

    // Send notification to assignee
    await db.collection('users').doc(assignToUid).collection('notifications').add({
      type:      'vulnerability_assigned',
      projectId,
      vulnId,
      title:     vulnSnap.data().title || 'Vulnerability',
      severity:  vulnSnap.data().severity || 'Medium',
      fromName:  req.user.email,
      note:      note || '',
      read:      false,
      createdAt: FieldValue.serverTimestamp(),
    });

    await db.collection('activityLogs').add({
      orgId,
      userId:   req.user.uid,
      userName: req.user.email,
      action:   `Assigned vulnerability "${vulnSnap.data().title}" to ${assigneeName}`,
      type:     'info',
      createdAt: FieldValue.serverTimestamp(),
    });

    res.json({ success: true, assignedToName: assigneeName });
  } catch (err) {
    console.error('assign-vulnerability error:', err);
    res.status(500).json({ error: 'Failed to assign vulnerability' });
  }
});

/**
 * POST /api/analysis/approve-phase
 * Org admin or team lead approves a submitted phase — marks it 'completed'
 * and triggers progress recalculation.
 */
router.post('/approve-phase', verifyToken, async (req, res) => {
  try {
    const { projectId, phase } = req.body;
    const orgId = req.user?.orgId;
    if (!orgId) return res.status(403).json({ error: 'No org context' });
    if (!projectId || !phase) return res.status(400).json({ error: 'projectId and phase required' });

    // Only org_admin or team lead can approve
    if (req.user.role !== 'org_admin' && req.user.role !== 'superadmin') {
      // Check if user is team lead for this project
      const teamsSnap = await db.collection('organizations').doc(orgId).collection('teams')
        .where('projectId', '==', projectId).get();
      const isLead = teamsSnap.docs.some(d => d.data().leadUserId === req.user.uid);
      if (!isLead) return res.status(403).json({ error: 'Only org admin or team lead can approve phases' });
    }

    await db.collection('organizations').doc(orgId)
      .collection('projects').doc(projectId)
      .collection('phases').doc(phase)
      .set({ status: 'completed', approvedBy: req.user.uid, approvedAt: FieldValue.serverTimestamp() }, { merge: true });

    const progress = await recalculateProgress(orgId, projectId);

    await db.collection('activityLogs').add({
      orgId,
      userId: req.user.uid,
      userName: req.user.email,
      action: `Approved phase "${phase}" for project`,
      type: 'success',
      createdAt: FieldValue.serverTimestamp(),
    });

    res.json({ success: true, progress });
  } catch (err) {
    console.error('approve-phase error:', err);
    res.status(500).json({ error: 'Failed to approve phase' });
  }
});

/**
 * POST /api/analysis/reject-phase
 * Org admin or team lead rejects a submitted phase — sets it back to 'needs-revision'
 * with a reason, so the employee knows to redo it.
 */
router.post('/reject-phase', verifyToken, async (req, res) => {
  try {
    const { projectId, phase, reason } = req.body;
    const orgId = req.user?.orgId;
    if (!orgId) return res.status(403).json({ error: 'No org context' });
    if (!projectId || !phase) return res.status(400).json({ error: 'projectId and phase required' });

    if (req.user.role !== 'org_admin' && req.user.role !== 'superadmin') {
      const teamsSnap = await db.collection('organizations').doc(orgId).collection('teams')
        .where('projectId', '==', projectId).get();
      const isLead = teamsSnap.docs.some(d => d.data().leadUserId === req.user.uid);
      if (!isLead) return res.status(403).json({ error: 'Only org admin or team lead can reject phases' });
    }

    await db.collection('organizations').doc(orgId)
      .collection('projects').doc(projectId)
      .collection('phases').doc(phase)
      .set({ status: 'needs-revision', rejectedBy: req.user.uid, rejectedAt: FieldValue.serverTimestamp(), rejectionReason: reason || '' }, { merge: true });

    await recalculateProgress(orgId, projectId);

    // Notify employees on the team
    const teamsSnap = await db.collection('organizations').doc(orgId).collection('teams')
      .where('projectId', '==', projectId).get();
    const memberIds = teamsSnap.docs.flatMap(d => d.data().memberIds ?? []).filter(Boolean);
    for (const memberId of memberIds) {
      await db.collection('users').doc(memberId).collection('notifications').add({
        type: 'phase_rejected',
        projectId,
        phase,
        reason: reason || '',
        fromName: req.user.email,
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    await db.collection('activityLogs').add({
      orgId,
      userId: req.user.uid,
      userName: req.user.email,
      action: `Rejected phase "${phase}" — needs revision${reason ? ': ' + reason : ''}`,
      type: 'warning',
      createdAt: FieldValue.serverTimestamp(),
    });

    res.json({ success: true });
  } catch (err) {
    console.error('reject-phase error:', err);
    res.status(500).json({ error: 'Failed to reject phase' });
  }
});

/**
 * GET /api/analysis/phase-status/:projectId
 * Returns all phases with their status for an org project.
 * Used by UserDashboard to enforce phase locking.
 */
router.get('/phase-status/:projectId', verifyToken, async (req, res) => {
  try {
    const orgId = req.user?.orgId;
    if (!orgId) return res.status(403).json({ error: 'No org context' });

    const phasesSnap = await db.collection('organizations').doc(orgId)
      .collection('projects').doc(req.params.projectId)
      .collection('phases').get();

    const phases = {};
    phasesSnap.docs.forEach(d => {
      phases[d.id] = {
        status: d.data().status,
        completion: d.data().completion,
        submittedBy: d.data().submittedBy,
        approvedBy: d.data().approvedBy,
        rejectionReason: d.data().rejectionReason,
      };
    });

    // Fetch unread notifications for this employee
    // Using single-field filter to avoid composite index requirement
    let notifications = [];
    try {
      const notifSnap = await db.collection('users').doc(req.user.uid)
        .collection('notifications')
        .where('read', '==', false)
        .get();
      // Filter by projectId in memory to avoid composite index
      notifications = notifSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(n => !n.projectId || n.projectId === req.params.projectId);
    } catch (notifErr) {
      // Fallback: fetch all notifications without filter
      try {
        const allNotifSnap = await db.collection('users').doc(req.user.uid)
          .collection('notifications').limit(30).get();
        notifications = allNotifSnap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(n => !n.read && (!n.projectId || n.projectId === req.params.projectId));
      } catch (_) { notifications = []; }
    }

    res.json({ success: true, phases, notifications });
  } catch (err) {
    console.error('phase-status error:', err);
    res.status(500).json({ error: 'Failed to fetch phase status' });
  }
});

/**
 * POST /api/analysis/mark-notification-read
 */
router.post('/mark-notification-read', verifyToken, async (req, res) => {
  try {
    const { notificationId } = req.body;
    await db.collection('users').doc(req.user.uid)
      .collection('notifications').doc(notificationId)
      .update({ read: true });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark read' });
  }
});

module.exports = router;
// ============================================================
// FortifyLens — Pipeline Security Scanner Service
// Detects CI/CD misconfigurations in workflow YAML, Dockerfiles,
// and docker-compose files using regex-based pattern matching.
// ============================================================
//
// Export: analyzePipelineConfig(content, filename)
// Returns: { findings, summary, riskScore, riskLevel }

// ─── PIPELINE DETECTION RULES ─────────────────────────────────

const MAX_FINDINGS = 100;

const SEVERITY_RANK = {
  Critical: 0,
  High:     1,
  Medium:   2,
  Low:      3,
};

const PIPELINE_RULES = [
  {
    id:   'PIPE-001',
    name: 'Unpinned GitHub Actions',
    severity: 'Medium',
    pattern: /uses:\s+[\w\-\.\/]+@(main|master|latest|HEAD)\b/gi,
    category: 'Supply Chain',
    description: 'GitHub Action is referenced by a mutable branch or tag instead of an immutable commit — the pipeline is not reproducible and can be hijacked if the action source is compromised',
    recommendation: 'Pin actions to a full commit SHA (e.g. actions/checkout@8f4b7f84864484a7bf31766abe9204da3cbe65b3) rather than a branch or moving tag.',
    targetFiles: ['.yml', '.yaml'],
  },
  {
    id:   'PIPE-002',
    name: 'Hardcoded Secrets in CI/CD',
    severity: 'High',
    pattern: /(password|secret|token|api_key|apikey|private_key|access_key)\s*[:=]\s*['"][^${\s][^'"]{8,}['"]/gi,
    category: 'Sensitive Data Exposure',
    description: 'Hardcoded credential detected in pipeline or container configuration — anyone with repository access (or a leaked CI log) can read it',
    recommendation: 'Store secrets in the CI provider secret store (e.g. GitHub Encrypted Secrets) or a secrets manager, and reference them as environment variables.',
    targetFiles: ['.yml', '.yaml', 'Dockerfile'],
  },
  {
    id:   'PIPE-003',
    name: 'Docker Running as Root (explicit)',
    severity: 'Medium',
    pattern: /^\s*USER\s+root\s*$/gmi,
    category: 'Container Security',
    description: 'Dockerfile explicitly switches to the root user — container processes run with root privileges',
    recommendation: 'Create a dedicated unprivileged user (RUN useradd -m appuser) and switch to it with USER appuser.',
    targetFiles: ['Dockerfile'],
  },
  {
    id:   'PIPE-004',
    name: 'Privileged Container Execution',
    severity: 'High',
    pattern: /privileged:\s*true|--privileged/gi,
    category: 'Container Security',
    description: 'Container is run in privileged mode — it gains near-host access to devices, kernel capabilities and the host filesystem',
    recommendation: 'Remove privileged mode. If specific capabilities are required, grant them individually with cap_add and drop all others.',
    targetFiles: ['.yml', '.yaml', 'Dockerfile', 'docker-compose'],
  },
  {
    // Two-pass semantic rule — this pattern only detects the trigger event.
    // The full detection (trigger + untrusted PR head ref checkout) runs
    // after the line scan; see "PIPE-005 two-pass detection" below.
    id:   'PIPE-005',
    name: 'pull_request_target Script Injection',
    severity: 'Critical',
    pattern: /pull_request_target/i,
    category: 'Injection',
    description: 'pull_request_target workflow checks out untrusted pull request code while repository secrets stay in context — attacker-controlled refs enable script injection',
    recommendation: 'Never check out PR head refs inside pull_request_target workflows. Use a two-workflow pattern or gate fork PRs behind a label before running untrusted code.',
    targetFiles: ['.yml', '.yaml'],
  },
];

// Determine which pipeline file types a filename matches. A single file can
// match more than one type (docker-compose.yml is both a YAML file and a
// compose file), which keeps each rule's targetFiles targeting accurate.
function getFileTypes(filename) {
  const lower = String(filename || '').toLowerCase();
  const types = [];

  if (lower.endsWith('.yml'))  types.push('.yml');
  if (lower.endsWith('.yaml')) types.push('.yaml');
  if (lower.includes('dockerfile')) types.push('Dockerfile');
  if (lower.includes('docker-compose') || /(^|[\/\\\-_])compose\.(yml|yaml)$/.test(lower)) {
    types.push('docker-compose');
  }

  return types;
}

function analyzePipelineConfig(content, filename = '') {
  const source        = String(content || '');
  const lowerFilename = String(filename || '').toLowerCase();

  // ── 1. Determine file type and applicable rules ────────────
  const fileTypes = getFileTypes(lowerFilename);
  const applicableRules = PIPELINE_RULES.filter(rule =>
    rule.targetFiles.some(target => fileTypes.includes(target))
  );

  const findings = [];
  const lines = source.split('\n');

  // ── 2/3. Line-by-line pattern scan ─────────────────────────
  lines.forEach((line, lineIdx) => {
    const lineNumber  = lineIdx + 1;
    const trimmedLine = line.trim();

    // Skip comment lines (# after optional whitespace)
    if (trimmedLine.startsWith('#')) return;

    applicableRules.forEach(rule => {
      // PIPE-005 is a two-pass semantic rule — handled after the line scan
      if (rule.id === 'PIPE-005') return;

      // PIPE-002: skip variable references — only hardcoded values count
      if (rule.id === 'PIPE-002' && (line.includes('${{') || line.includes('${') || line.includes('$ '))) return;

      const matched = rule.pattern.test(line);
      rule.pattern.lastIndex = 0; // Reset global regex state between tests

      if (matched) {
        findings.push({
          id:             rule.id,
          rule:           rule.name,
          severity:       rule.severity,
          line:           lineNumber,
          code:           trimmedLine,
          description:    rule.description,
          recommendation: rule.recommendation,
          category:       rule.category,
        });
      }
    });
  });

  // ── 4. PIPE-003 (implicit): Dockerfile with no USER directive ──
  // A Dockerfile without any USER instruction runs as root by default.
  if (lowerFilename.includes('dockerfile') && !/^\s*USER\s+/m.test(source)) {
    const rule = PIPELINE_RULES.find(r => r.id === 'PIPE-003');
    findings.push({
      id:             'PIPE-003',
      rule:           'Dockerfile Runs as Root (no USER directive)',
      severity:       'Medium',
      line:           1,
      code:           '(no USER directive found in Dockerfile)',
      description:    'Dockerfile runs as root (no USER directive) — the container defaults to the root user',
      recommendation: rule.recommendation,
      category:       rule.category,
    });
  }

  // ── 5. PIPE-005 two-pass detection: pull_request_target injection ──
  // Pass 1: the workflow triggers on pull_request_target (secrets in context).
  // Pass 2: it also checks out the untrusted PR head ref.
  const pipe005 = applicableRules.find(r => r.id === 'PIPE-005');
  if (pipe005 && pipe005.pattern.test(source)) {
    lines.forEach((line, lineIdx) => {
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith('#')) return; // ignore commented-out refs

      if (/ref:.*github\.event\.pull_request\.head/i.test(line)) {
        findings.push({
          id:             'PIPE-005',
          rule:           pipe005.name,
          severity:       'Critical',
          line:           lineIdx + 1,
          code:           trimmedLine,
          description:    pipe005.description,
          recommendation: pipe005.recommendation,
          category:       pipe005.category,
        });
      }
    });
  }

  // ── 6/7. Sort by severity (Critical > High > Medium > Low), then cap ──
  // Sorted first so the most severe findings survive the 100-finding cap.
  findings.sort((a, b) =>
    SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.line - b.line
  );
  const reported = findings.slice(0, MAX_FINDINGS);

  // ── Summary, risk score and risk level ─────────────────────
  const critical = reported.filter(f => f.severity === 'Critical').length;
  const high     = reported.filter(f => f.severity === 'High').length;
  const medium   = reported.filter(f => f.severity === 'Medium').length;
  const low      = reported.filter(f => f.severity === 'Low').length;

  const riskScore = Math.min(100, critical * 25 + high * 15 + medium * 5 + low * 1);
  const riskLevel =
    riskScore >= 75 ? 'Critical' :
    riskScore >= 50 ? 'High'     :
    riskScore >= 25 ? 'Medium'   :
    riskScore > 0   ? 'Low'      : 'None';

  const summary = {
    totalFindings: reported.length,
    critical,
    high,
    medium,
    low,
    rulesChecked: applicableRules.length,
  };

  return { findings: reported, summary, riskScore, riskLevel };
}

module.exports = { analyzePipelineConfig };

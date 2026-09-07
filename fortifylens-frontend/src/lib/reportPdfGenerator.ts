// ============================================================
// FortifyLens — PDF Report Generator (jsPDF)
// Downloads directly to system — no print dialog
// ============================================================

// ─── Brand colours ────────────────────────────────────────────
type RGB = [number, number, number];

const C = {
  bg:       [10,  14,  26]  as RGB,
  bgCard:   [16,  22,  40]  as RGB,
  accent:   [0,   212, 255] as RGB,
  cyan:     [0,   212, 255] as RGB,   // alias for accent — used in executive summary
  white:    [255, 255, 255] as RGB,
  gray:     [148, 163, 184] as RGB,
  darkGray: [71,  85,  105] as RGB,
  red:      [239, 68,  68]  as RGB,
  orange:   [249, 115, 22]  as RGB,
  yellow:   [234, 179, 8]   as RGB,
  green:    [34,  197, 94]  as RGB,
  purple:   [139, 92, 246]  as RGB,
  teal:     [20,  184, 166] as RGB,
  line:     [30,  41,  59]  as RGB,
};

function sev(s: string): RGB {
  const l = s?.toLowerCase();
  if (l === 'critical') return C.red;
  if (l === 'high')     return C.orange;
  if (l === 'medium')   return C.yellow;
  return [107, 114, 128] as RGB;
}

async function makeDoc() {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  // Dark background on first page
  doc.setFillColor(...C.bg);
  doc.rect(0, 0, pageW, pageH, 'F');

  return { doc, pageW, pageH };
}

function newPage(doc: any, pageW: number, pageH: number) {
  doc.addPage();
  doc.setFillColor(...C.bg);
  doc.rect(0, 0, pageW, pageH, 'F');
  return 15;
}

function drawHeader(doc: any, pageW: number, title: string, sub: string, project: string, badge: string, badgeColor: RGB): number {
  // Header band
  doc.setFillColor(...C.bgCard);
  doc.rect(0, 0, pageW, 50, 'F');
  // Accent bottom line
  doc.setFillColor(...C.accent);
  doc.rect(0, 48, pageW, 2, 'F');

  // Brand
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.accent);
  doc.text('FORTIFYLENS  ·  SECURE SDLC PLATFORM', 14, 9);

  // Title
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.white);
  doc.text(title, 14, 21);

  // Subtitle
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...C.gray);
  doc.text(sub, 14, 29);

  // Meta
  doc.setFontSize(7);
  doc.setTextColor(...C.darkGray);
  const date = new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
  doc.text(`Project: ${project}   ·   ${date}   ·   AI-Powered Analysis`, 14, 38);

  // Badge
  if (badge) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...badgeColor);
    doc.text(badge, pageW - 14, 21, { align: 'right' });
  }

  return 58;
}

function drawSectionTitle(doc: any, pageW: number, text: string, y: number): number {
  doc.setFillColor(...C.bgCard);
  doc.roundedRect(10, y, pageW - 20, 8, 1, 1, 'F');
  doc.setFillColor(...C.accent);
  doc.rect(10, y, 2, 8, 'F');
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.accent);
  doc.text(text.toUpperCase(), 15, y + 5.5);
  return y + 12;
}

function drawSummary(doc: any, pageW: number, text: string, y: number): number {
  const lines: string[] = doc.splitTextToSize(text || 'No summary available.', pageW - 32);
  const h = lines.length * 5 + 10;
  doc.setFillColor(...C.bgCard);
  doc.roundedRect(10, y, pageW - 20, h, 2, 2, 'F');
  doc.setFillColor(...C.accent);
  doc.rect(10, y, 2, h, 'F');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...C.gray);
  doc.text(lines, 16, y + 7);
  return y + h + 5;
}

function drawStats(doc: any, pageW: number, stats: { label: string; value: string | number; color?: RGB }[], y: number): number {
  const w = (pageW - 20) / stats.length;
  stats.forEach((s, i) => {
    const x = 10 + i * w;
    doc.setFillColor(...C.bgCard);
    doc.roundedRect(x + 1, y, w - 2, 16, 1, 1, 'F');
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...(s.color ?? C.white));
    doc.text(String(s.value), x + w / 2, y + 8, { align: 'center' });
    doc.setFontSize(6);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.darkGray);
    doc.text(s.label.toUpperCase(), x + w / 2, y + 13, { align: 'center' });
  });
  return y + 21;
}

function drawCard(
  doc: any, pageW: number, pageH: number,
  opts: { title: string; severity: string; desc: string; fix?: string; id?: string; extra?: [string, string][] },
  y: number, addPage: () => number
): number {
  const sevClr = sev(opts.severity);
  const descLines: string[] = doc.splitTextToSize(opts.desc || '', pageW - 42);
  const fixLines: string[]  = opts.fix ? doc.splitTextToSize(`Fix: ${opts.fix}`, pageW - 42) : [];
  const extraH = (opts.extra ?? []).length * 4.5;
  const cardH  = 7 + descLines.length * 4.5 + (fixLines.length ? fixLines.length * 4.5 + 7 : 0) + extraH + 6;

  if (y + cardH > pageH - 14) y = addPage();

  doc.setFillColor(...C.bgCard);
  doc.roundedRect(10, y, pageW - 20, cardH, 1.5, 1.5, 'F');
  doc.setFillColor(...sevClr);
  doc.rect(10, y, 2.5, cardH, 'F');

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.white);
  doc.text(opts.title, 16, y + 6);

  doc.setFontSize(7);
  doc.setTextColor(...sevClr);
  doc.text(opts.severity.toUpperCase(), pageW - 14, y + 6, { align: 'right' });

  if (opts.id) {
    doc.setFontSize(6.5);
    doc.setTextColor(...C.darkGray);
    doc.text(opts.id, pageW - 14, y + 11, { align: 'right' });
  }

  let cy = y + 12;

  (opts.extra ?? []).forEach(([k, v]) => {
    if (!v) return;
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.darkGray);
    doc.text(`${k}:`, 16, cy);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.gray);
    const vLines: string[] = doc.splitTextToSize(v, pageW - 60);
    doc.text(vLines[0] || '', 16 + doc.getTextWidth(`${k}: `), cy);
    cy += 4.5;
  });

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...C.gray);
  doc.text(descLines, 16, cy);
  cy += descLines.length * 4.5;

  if (fixLines.length) {
    cy += 3;
    doc.setFillColor(8, 40, 20);
    doc.roundedRect(14, cy - 2, pageW - 28, fixLines.length * 4.5 + 4, 1, 1, 'F');
    doc.setFontSize(7.5);
    doc.setTextColor(...C.green);
    doc.text(fixLines, 17, cy + 1.5);
    cy += fixLines.length * 4.5 + 5;
  }

  return y + cardH + 3;
}

function drawRecs(doc: any, pageW: number, pageH: number, items: string[], y: number, addPage: () => number): number {
  items.forEach((item, i) => {
    const lines: string[] = doc.splitTextToSize(item, pageW - 40);
    const h = lines.length * 4.5 + 5;
    if (y + h > pageH - 14) y = addPage();
    doc.setFillColor(...C.bgCard);
    doc.roundedRect(10, y, pageW - 20, h, 1, 1, 'F');
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.accent);
    doc.text(`${i + 1}.`, 14, y + 4.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.gray);
    doc.text(lines, 21, y + 4.5);
    y += h + 2;
  });
  return y;
}

function drawFooter(doc: any, pageW: number, pageH: number, page: number) {
  doc.setFillColor(...C.bgCard);
  doc.rect(0, pageH - 9, pageW, 9, 'F');
  doc.setFontSize(6);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...C.darkGray);
  doc.text('FortifyLens — Confidential Security Report', 14, pageH - 3.5);
  doc.text(`Page ${page}`, pageW - 14, pageH - 3.5, { align: 'right' });
}

// ══════════════════════════════════════════════════════════════
// PUBLIC GENERATORS
// ══════════════════════════════════════════════════════════════

export async function generateRequirementPDF(analysis: any, projectName: string) {
  const { doc, pageW, pageH } = await makeDoc();
  let page = 1;
  const AP = () => { drawFooter(doc, pageW, pageH, page++); return newPage(doc, pageW, pageH); };

  const riskScore = analysis.completenessScore ?? 0;
  const rColor: RGB = riskScore >= 70 ? C.green : riskScore >= 40 ? C.yellow : C.red;
  const vulns   = analysis.vulnerabilities ?? [];
  const missing = analysis.completenessIssues ?? [];
  const recs    = analysis.recommendations ?? [];

  let y = drawHeader(doc, pageW,
    'Security Requirement Analysis',
    'AI-powered SDLC assessment — requirements phase',
    projectName,
    `RISK: ${(analysis.overallRisk ?? 'UNKNOWN').toUpperCase()}`,
    riskScore >= 70 ? C.green : riskScore >= 40 ? C.yellow : C.red
  );

  y = drawSummary(doc, pageW, analysis.summary ?? '', y);
  y += 2;

  const high = vulns.filter((v: any) => v.severity === 'high').length;
  const med  = vulns.filter((v: any) => v.severity === 'medium').length;

  y = drawStats(doc, pageW, [
    { label: 'Total Issues',       value: vulns.length + missing.length, color: vulns.length > 0 ? C.red : C.green },
    { label: 'Security Gaps',      value: vulns.length,    color: vulns.length > 0 ? C.orange : C.green },
    { label: 'High Severity',      value: high,             color: high > 0 ? C.red : C.green },
    { label: 'Medium Severity',    value: med,              color: med > 0 ? C.yellow : C.green },
    { label: 'Security Score',     value: `${riskScore}%`,  color: rColor },
  ], y);
  y += 3;

  if (vulns.length > 0) {
    y = drawSectionTitle(doc, pageW, `Security Gaps (${vulns.length})`, y);
    for (const v of vulns) {
      y = drawCard(doc, pageW, pageH, {
        title: v.type || v.statement || 'Security Gap',
        severity: v.severity ?? 'medium',
        desc: v.description || v.statement || '',
        fix: v.fix || v.recommendation || '',
        id: v.id,
      }, y, AP);
    }
    y += 3;
  }

  if (missing.length > 0) {
    y = drawSectionTitle(doc, pageW, `Missing Requirements (${missing.length})`, y);
    for (const m of missing) {
      y = drawCard(doc, pageW, pageH, {
        title: typeof m === 'string' ? m : m.issue || 'Missing Requirement',
        severity: 'medium',
        desc: 'This security requirement is absent from the document.',
        fix: 'Add an explicit requirement addressing this concern.',
      }, y, AP);
    }
    y += 3;
  }

  if (recs.length > 0) {
    y = drawSectionTitle(doc, pageW, `Recommendations (${recs.length})`, y);
    y = drawRecs(doc, pageW, pageH, recs.map((r: any) => typeof r === 'string' ? r : r.text || String(r)), y, AP);
  }

  drawFooter(doc, pageW, pageH, page);
  doc.save(`${projectName.replace(/\s+/g, '_')}_requirement_analysis.pdf`);
}

export async function generateThreatPDF(threatResult: any, projectName: string) {
  const { doc, pageW, pageH } = await makeDoc();
  let page = 1;
  const AP = () => { drawFooter(doc, pageW, pageH, page++); return newPage(doc, pageW, pageH); };

  const riskScore = threatResult.riskScore ?? 0;
  const rColor: RGB = riskScore >= 70 ? C.red : riskScore >= 40 ? C.orange : C.green;
  const threats    = threatResult.threats ?? [];
  const critical   = threats.filter((t: any) => t.severity === 'Critical').length;
  const high       = threats.filter((t: any) => t.severity === 'High').length;
  const medium     = threats.filter((t: any) => t.severity === 'Medium').length;
  const recs       = threatResult.recommendations ?? threatResult.mitigations ?? [];
  const violations = threatResult.policyViolations ?? [];

  let y = drawHeader(doc, pageW,
    'STRIDE Threat Modeling Report',
    'AI-powered threat analysis — design & architecture phase',
    projectName,
    `RISK SCORE: ${riskScore}/100`,
    rColor
  );

  y = drawSummary(doc, pageW, threatResult.summary ?? `Risk Score: ${riskScore}/100`, y);
  y += 2;

  y = drawStats(doc, pageW, [
    { label: 'Total Threats', value: threats.length,   color: threats.length > 0 ? C.red : C.green },
    { label: 'Critical',      value: critical,          color: critical > 0 ? C.red : C.green },
    { label: 'High',          value: high,              color: high > 0 ? C.orange : C.green },
    { label: 'Medium',        value: medium,            color: medium > 0 ? C.yellow : C.green },
    { label: 'Risk Score',    value: `${riskScore}/100`, color: rColor },
  ], y);
  y += 3;

  if (threats.length > 0) {
    y = drawSectionTitle(doc, pageW, `Identified Threats (${threats.length})`, y);
    for (const t of threats) {
      y = drawCard(doc, pageW, pageH, {
        id: t.id,
        title: t.title ?? t.category ?? 'Threat',
        severity: t.severity ?? 'Medium',
        desc: t.description ?? '',
        fix: t.mitigation ?? t.recommendation ?? '',
        extra: t.category ? [['Category', t.category]] : [],
      }, y, AP);
    }
    y += 3;
  }

  if (violations.length > 0) {
    y = drawSectionTitle(doc, pageW, `Policy Violations (${violations.length})`, y);
    for (const v of violations) {
      y = drawCard(doc, pageW, pageH, {
        title: typeof v === 'string' ? v : v.control || 'Policy Violation',
        severity: 'high',
        desc: 'Compliance policy requirement violated in design phase.',
        fix: 'Review design against compliance framework.',
      }, y, AP);
    }
    y += 3;
  }

  if (recs.length > 0) {
    y = drawSectionTitle(doc, pageW, `Recommendations (${recs.length})`, y);
    y = drawRecs(doc, pageW, pageH, recs.map((r: any) => typeof r === 'string' ? r : r.text || String(r)), y, AP);
  }

  drawFooter(doc, pageW, pageH, page);
  doc.save(`${projectName.replace(/\s+/g, '_')}_threat_model.pdf`);
}

export async function generateCodeReviewPDF(analysis: any, projectName: string, language = 'Code') {
  const { doc, pageW, pageH } = await makeDoc();
  let page = 1;
  const AP = () => { drawFooter(doc, pageW, pageH, page++); return newPage(doc, pageW, pageH); };

  const vulns    = analysis.vulnerabilities ?? [];
  const critical = vulns.filter((v: any) => v.severity === 'critical').length;
  const high     = vulns.filter((v: any) => v.severity === 'high').length;
  const medium   = vulns.filter((v: any) => v.severity === 'medium').length;
  const quality  = analysis.codeQuality?.score ?? 0;
  const recs     = analysis.recommendations ?? [];
  const rColor: RGB = analysis.overallRisk === 'critical' ? C.red
    : analysis.overallRisk === 'high' ? C.orange
    : analysis.overallRisk === 'medium' ? C.yellow : C.green;

  let y = drawHeader(doc, pageW,
    'Code Security Review Report',
    `Static security analysis — ${language}`,
    projectName,
    `RISK: ${(analysis.overallRisk ?? 'LOW').toUpperCase()}`,
    rColor
  );

  y = drawSummary(doc, pageW, analysis.summary ?? '', y);
  y += 2;

  y = drawStats(doc, pageW, [
    { label: 'Vulnerabilities', value: vulns.length,    color: vulns.length > 0 ? C.red : C.green },
    { label: 'Critical',        value: critical,         color: critical > 0 ? C.red : C.green },
    { label: 'High',            value: high,             color: high > 0 ? C.orange : C.green },
    { label: 'Medium',          value: medium,           color: medium > 0 ? C.yellow : C.green },
    { label: 'Code Quality',    value: `${quality}/100`, color: quality >= 70 ? C.green : quality >= 40 ? C.yellow : C.red },
  ], y);
  y += 3;

  if (vulns.length > 0) {
    y = drawSectionTitle(doc, pageW, `Vulnerabilities (${vulns.length})`, y);
    for (const v of vulns) {
      y = drawCard(doc, pageW, pageH, {
        id: v.cwe || v.id,
        title: v.type || 'Vulnerability',
        severity: v.severity,
        desc: v.description || '',
        fix: v.fix || '',
        extra: [
          ...(v.line ? [['Line', String(v.line)] as [string, string]] : []),
          ...(v.code ? [['Code', v.code.slice(0, 80)] as [string, string]] : []),
        ],
      }, y, AP);
    }
    y += 3;
  }

  const qualityIssues = analysis.codeQuality?.issues ?? [];
  if (qualityIssues.length > 0) {
    y = drawSectionTitle(doc, pageW, `Code Quality Issues (${qualityIssues.length})`, y);
    y = drawRecs(doc, pageW, pageH, qualityIssues, y, AP);
    y += 3;
  }

  if (recs.length > 0) {
    y = drawSectionTitle(doc, pageW, `Recommendations (${recs.length})`, y);
    y = drawRecs(doc, pageW, pageH, recs.map((r: any) => typeof r === 'string' ? r : r.text || String(r)), y, AP);
  }

  drawFooter(doc, pageW, pageH, page);
  doc.save(`${projectName.replace(/\s+/g, '_')}_code_review.pdf`);
}

export async function generateDependencyPDF(scanResult: any, projectName: string, filename = 'package.json') {
  const { doc, pageW, pageH } = await makeDoc();
  let page = 1;
  const AP = () => { drawFooter(doc, pageW, pageH, page++); return newPage(doc, pageW, pageH); };

  const vulns     = scanResult.vulnerabilities ?? [];
  const critCount = scanResult.critical ?? 0;
  const highCount = scanResult.high ?? 0;
  const rColor: RGB = critCount > 0 ? C.red : highCount > 0 ? C.orange : scanResult.vulnCount > 0 ? C.yellow : C.green;

  let y = drawHeader(doc, pageW,
    'Dependency Vulnerability Report',
    `SCA scan powered by Google OSV — ${filename}`,
    projectName,
    `${scanResult.vulnCount ?? 0} CVEs FOUND`,
    rColor
  );

  const status = scanResult.vulnCount === 0
    ? 'No known vulnerabilities found — all dependencies are clean.'
    : critCount > 0
    ? `Critical risk — ${critCount} critical CVEs require immediate action.`
    : `${scanResult.vulnCount} vulnerabilities found — review and update affected packages.`;

  y = drawSummary(doc, pageW, status, y);
  y += 2;

  y = drawStats(doc, pageW, [
    { label: 'Packages Scanned', value: scanResult.totalDeps ?? 0,    color: C.white },
    { label: 'Vulnerable',       value: scanResult.vulnCount ?? 0,    color: scanResult.vulnCount > 0 ? C.red : C.green },
    { label: 'Critical',         value: critCount,                     color: critCount > 0 ? C.red : C.green },
    { label: 'High',             value: highCount,                     color: highCount > 0 ? C.orange : C.green },
    { label: 'Medium',           value: scanResult.medium ?? 0,        color: (scanResult.medium ?? 0) > 0 ? C.yellow : C.green },
  ], y);
  y += 3;

  if (vulns.length > 0) {
    y = drawSectionTitle(doc, pageW, `Vulnerability Details (${vulns.length} unique CVEs)`, y);
    for (const v of vulns) {
      y = drawCard(doc, pageW, pageH, {
        id: v.id,
        title: `${v.package} v${v.version}`,
        severity: v.severity,
        desc: v.summary || `Known vulnerability in ${v.package}`,
        fix: v.fixedIn ? `Upgrade to v${v.fixedIn}` : 'No fix available — check advisory',
        extra: [
          ['Ecosystem', v.ecosystem ?? ''],
          ...(v.cvssScore ? [['CVSS', String(v.cvssScore)] as [string, string]] : []),
          ...(v.aliases?.length ? [['Also known as', v.aliases.slice(0, 2).join(', ')] as [string, string]] : []),
        ],
      }, y, AP);
    }

    if (y + 10 < pageH - 14) {
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...C.darkGray);
      const withFix = vulns.filter((v: any) => v.fixedIn).length;
      doc.text(`${withFix} of ${vulns.length} vulnerabilities have known fixes available`, pageW / 2, y + 5, { align: 'center' });
    }
  }

  drawFooter(doc, pageW, pageH, page);
  doc.save(`${projectName.replace(/\s+/g, '_')}_dependency_scan.pdf`);
}

export async function generateCrossPhasePDF(result: any, projectName: string) {
  const { doc, pageW, pageH } = await makeDoc();
  let page = 1;
  const AP = () => { drawFooter(doc, pageW, pageH, page++); return newPage(doc, pageW, pageH); };

  const score      = result.overallScore ?? 0;
  const sColor: RGB = score >= 75 ? C.green : score >= 50 ? C.yellow : C.red;
  const conflicts  = result.conflicts ?? [];
  const warnings   = result.warnings ?? [];
  const consistent = result.consistent ?? [];
  const compliance = result.complianceDrift ?? [];
  const actions    = result.topActions ?? [];

  let y = drawHeader(doc, pageW,
    'Cross-Phase Consistency Report',
    'AI security audit — requirements → design → code',
    projectName,
    `CONSISTENCY: ${score}/100`,
    sColor
  );

  y = drawSummary(doc, pageW, result.summary ?? '', y);
  y += 2;

  y = drawStats(doc, pageW, [
    { label: 'Consistency Score', value: `${score}/100`,    color: sColor },
    { label: 'Conflicts',         value: conflicts.length,  color: conflicts.length > 0 ? C.red : C.green },
    { label: 'Warnings',          value: warnings.length,   color: warnings.length > 0 ? C.yellow : C.green },
    { label: 'Consistent',        value: consistent.length, color: consistent.length > 0 ? C.green : C.gray },
    { label: 'Compliance Drift',  value: compliance.length, color: compliance.length > 0 ? C.red : C.green },
  ], y);
  y += 3;

  if (result.phasesCovered?.length) {
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.darkGray);
    doc.text(`Phases covered: ${result.phasesCovered.join(' → ')}`, 14, y);
    y += 7;
  }

  if (actions.length > 0) {
    y = drawSectionTitle(doc, pageW, 'Top Priority Actions', y);
    y = drawRecs(doc, pageW, pageH, actions, y, AP);
    y += 3;
  }

  if (compliance.length > 0) {
    y = drawSectionTitle(doc, pageW, `Compliance Drift (${compliance.length})`, y);
    for (const cd of compliance) {
      y = drawCard(doc, pageW, pageH, {
        id: cd.id,
        title: `${cd.framework} — Compliance Violation`,
        severity: cd.severity ?? 'high',
        desc: cd.violation ?? '',
        fix: cd.requirement ? `Requirement: ${cd.requirement}` : undefined,
        extra: [['Found in', cd.foundIn ?? '']],
      }, y, AP);
    }
    y += 3;
  }

  if (conflicts.length > 0) {
    y = drawSectionTitle(doc, pageW, `Conflicts (${conflicts.length})`, y);
    for (const c of conflicts) {
      y = drawCard(doc, pageW, pageH, {
        id: c.id,
        title: c.control,
        severity: c.severity ?? 'high',
        desc: c.violation ?? '',
        fix: c.recommendation ?? '',
        extra: [
          ['Requirement', c.requirement ?? ''],
          ['Between', (c.conflictBetween ?? []).join(' ↔ ')],
        ],
      }, y, AP);
    }
    y += 3;
  }

  if (warnings.length > 0) {
    y = drawSectionTitle(doc, pageW, `Warnings (${warnings.length})`, y);
    for (const w of warnings) {
      y = drawCard(doc, pageW, pageH, {
        id: w.id,
        title: w.control,
        severity: w.severity ?? 'medium',
        desc: w.gap ?? '',
        fix: w.recommendation ?? '',
        extra: [
          ['Required',   w.requirement ?? ''],
          ['Missing in', (w.missingIn ?? []).join(', ')],
        ],
      }, y, AP);
    }
    y += 3;
  }

  if (consistent.length > 0) {
    y = drawSectionTitle(doc, pageW, `Consistent Controls (${consistent.length})`, y);
    for (const c of consistent) {
      if (y + 14 > pageH - 14) y = AP();
      doc.setFillColor(8, 40, 20);
      doc.roundedRect(10, y, pageW - 20, 12, 1, 1, 'F');
      doc.setFillColor(...C.green);
      doc.rect(10, y, 2.5, 12, 'F');
      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...C.green);
      doc.text(`✓ ${c.control}`, 16, y + 5.5);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...C.darkGray);
      doc.text(`${(c.phases ?? []).join(' · ')}  ·  ${c.confidence ?? ''} confidence`, 16, y + 10);
      y += 15;
    }
  }

  drawFooter(doc, pageW, pageH, page);
  doc.save(`${projectName.replace(/\s+/g, '_')}_cross_phase.pdf`);
}

// ─── Combined Full Project PDF ─────────────────────────────────
export async function generateFullProjectPDF(
  projectName: string,
  opts: {
    requirementResult?: any;
    threatResult?: any;
    codeResult?: any;
    depScanResult?: any;
    pipelineResult?: any;
    crossPhaseResult?: any;
    codeLanguage?: string;
    depFileName?: string;
    pipelineFilename?: string;
  }
) {
  const { doc, pageW, pageH } = await makeDoc();
  let page = 1;
  const AP = () => { drawFooter(doc, pageW, pageH, page++); return newPage(doc, pageW, pageH); };

  const { requirementResult: rr, threatResult: tr, codeResult: cr, depScanResult: dr, pipelineResult: pr, crossPhaseResult: xr } = opts;

  // Cover page
  doc.setFillColor(...C.bg);
  doc.rect(0, 0, pageW, pageH, 'F');

  // Accent lines
  doc.setFillColor(...C.accent);
  doc.rect(0, 0, 3, pageH, 'F');
  doc.setFillColor(...C.purple);
  doc.rect(6, 0, 1.5, pageH, 'F');

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.accent);
  doc.text('FORTIFYLENS', 20, 40);

  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...C.darkGray);
  doc.text('SECURE SOFTWARE DEVELOPMENT LIFECYCLE PLATFORM', 20, 47);

  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.white);
  doc.text('Security Assessment', 20, 80);
  doc.text('Report', 20, 91);

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...C.gray);
  doc.text(projectName, 20, 105);

  doc.setFontSize(8);
  doc.setTextColor(...C.darkGray);
  const date = new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  doc.text(date, 20, 113);

  // Phase coverage on cover
  const phases = [
    { label: 'Requirements Analysis',     done: !!rr, color: C.accent },
    { label: 'Threat Modeling (STRIDE)',   done: !!tr, color: C.purple },
    { label: 'Code Review (SAST)',         done: !!cr, color: C.green },
    { label: 'Dependency Scanning (SCA)', done: !!dr, color: C.orange },
    { label: 'Pipeline Security',         done: !!pr, color: C.teal },
    { label: 'Cross-Phase Consistency',   done: !!xr, color: C.yellow },
  ];

  let py = 135;
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.darkGray);
  doc.text('PHASES INCLUDED', 20, py); py += 7;

  phases.forEach(ph => {
    doc.setFillColor(...(ph.done ? ph.color : C.darkGray as RGB));
    doc.circle(22, py - 1.5, 2, 'F');
    doc.setFontSize(8);
    doc.setFont('helvetica', ph.done ? 'bold' : 'normal');
    doc.setTextColor(...(ph.done ? C.white : C.darkGray));
    doc.text(ph.label, 27, py);
    py += 8;
  });

  // Overall score box
  const scores = [
    rr?.completenessScore ?? rr?.securityScore ?? null,
    tr?.riskScore != null ? 100 - tr.riskScore : null,
    cr?.codeQuality?.score ?? null,
    xr?.overallScore ?? null,
  ].filter(s => s !== null) as number[];
  const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

  if (avgScore !== null) {
    const sColor: RGB = avgScore >= 70 ? C.green : avgScore >= 40 ? C.yellow : C.red;
    doc.setFillColor(...C.bgCard);
    doc.roundedRect(20, py + 5, 60, 28, 3, 3, 'F');
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...sColor);
    doc.text(`${avgScore}`, 50, py + 23, { align: 'center' });
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.darkGray);
    doc.text('OVERALL SECURITY SCORE', 50, py + 30, { align: 'center' });
  }

  drawFooter(doc, pageW, pageH, page);

  // Requirements section
  if (rr) {
    let y = AP();
    // Normalize raw backend shape — AI analysis returns `vulnerabilities`+`ambiguities`,
    // static fallback returns `findings`+`missingRequirements`. Use whichever is present.
    // This matches exactly what RequirementAnalysisReport.tsx shows in the UI card.
    const aiVulns   = rr.vulnerabilities ?? [];
    const rawFindings = rr.findings ?? [];
    // Prefer AI vulnerabilities (what the card shows); fall back to static findings
    const vulns = aiVulns.length > 0 ? aiVulns : rawFindings.map((f: any, i: number) => ({
      id: `f-${i}`,
      type: f.issue || f.name || 'Security Gap',
      description: f.issue || f.description || '',
      fix: f.recommendation || f.fix || '',
      severity: ((f.severity || 'medium').toLowerCase() === 'critical' ? 'high'
               : (f.severity || 'medium').toLowerCase() === 'high'     ? 'high'
               : (f.severity || 'medium').toLowerCase() === 'medium'   ? 'medium'
               :                                                          'low'),
    }));
    const ambiguities = rr.ambiguities ?? [];
    const missing = rr.completenessIssues ?? rr.missingRequirements ?? [];
    const recs    = rr.recommendations ?? rr.securityChecklist ?? [];
    const rScore  = rr.completenessScore ?? rr.securityScore ?? 0;
    // Total Issues = vulnerabilities + ambiguities (matches UI card formula)
    const totalIssues = vulns.length + ambiguities.length;

    y = drawHeader(doc, pageW, 'Phase 1 — Requirements Analysis', 'Security assessment of project requirements', projectName,
      `SCORE: ${rScore}%`, rScore >= 70 ? C.green : rScore >= 40 ? C.yellow : C.red);
    y = drawSummary(doc, pageW, rr.summary ?? '', y); y += 2;
    y = drawStats(doc, pageW, [
      { label: 'Total Issues',    value: totalIssues,    color: totalIssues > 0 ? C.red : C.green },
      { label: 'Security Gaps',   value: vulns.length,   color: vulns.length > 0 ? C.red : C.green },
      { label: 'Ambiguities',     value: ambiguities.length, color: ambiguities.length > 0 ? C.yellow : C.green },
      { label: 'Score',           value: `${rScore}%`,   color: rScore >= 70 ? C.green : C.yellow },
    ], y); y += 3;
    for (const v of vulns) {
      y = drawCard(doc, pageW, pageH, { title: v.type || v.statement || 'Gap', severity: v.severity ?? 'medium', desc: v.description || '', fix: v.fix || '', id: v.id }, y, AP);
    }
    if (ambiguities.length > 0) {
      y = drawSectionTitle(doc, pageW, 'Ambiguities', y);
      for (const a of ambiguities) {
        y = drawCard(doc, pageW, pageH, {
          title: a.statement || a.issue || 'Ambiguity',
          severity: 'low',
          desc: a.description || a.statement || '',
          fix: a.suggestion || a.recommendation || '',
          id: a.id,
        }, y, AP);
      }
    }
    if (recs.length > 0) { y = drawSectionTitle(doc, pageW, 'Recommendations', y); drawRecs(doc, pageW, pageH, recs.map((r: any) => typeof r === 'string' ? r : String(r)), y, AP); }
  }

  // Threat section
  if (tr) {
    let y = AP();
    const threats  = tr.threats ?? [];
    const riskScore = tr.riskScore ?? 0;
    const rColor: RGB = riskScore >= 70 ? C.red : riskScore >= 40 ? C.orange : C.green;

    y = drawHeader(doc, pageW, 'Phase 2 — Threat Modeling (STRIDE)', 'Architecture & design threat analysis', projectName, `RISK: ${riskScore}/100`, rColor);
    y = drawSummary(doc, pageW, tr.summary ?? '', y); y += 2;
    y = drawStats(doc, pageW, [
      { label: 'Threats',  value: threats.length,  color: threats.length > 0 ? C.red : C.green },
      { label: 'Critical', value: threats.filter((t: any) => t.severity === 'Critical').length, color: C.red },
      { label: 'High',     value: threats.filter((t: any) => t.severity === 'High').length,     color: C.orange },
      { label: 'Risk',     value: `${riskScore}/100`, color: rColor },
    ], y); y += 3;
    for (const t of threats) {
      y = drawCard(doc, pageW, pageH, { id: t.id, title: t.title ?? t.category ?? 'Threat', severity: t.severity ?? 'Medium', desc: t.description ?? '', fix: t.mitigation ?? '' }, y, AP);
    }
  }

  // Code review section
  if (cr) {
    let y = AP();
    // Normalize: AI path returns {overallRisk, codeQuality:{score}, summary:string, vulnerabilities[].severity lowercase}.
    // Keyword-fallback path (analyzeCode) returns {riskLevel, riskScore, summary:object, vulnerabilities[].severity capitalized}.
    // Build a consistent shape regardless of which path produced the data.
    const vulns = (cr.vulnerabilities ?? []).map((v: any) => ({
      ...v,
      severity: typeof v.severity === 'string' ? v.severity.toLowerCase() : 'medium',
    }));
    const overallRisk = cr.overallRisk ?? (cr.riskLevel ? String(cr.riskLevel).toLowerCase() : 'low');
    const quality = cr.codeQuality?.score ?? (cr.riskScore != null ? Math.max(0, 100 - cr.riskScore) : 0);
    const summaryText = typeof cr.summary === 'string'
      ? cr.summary
      : (cr.recommendation ?? (cr.summary ? `${cr.summary.total ?? vulns.length} issue(s) found (${cr.summary.critical ?? 0} critical, ${cr.summary.high ?? 0} high).` : ''));
    const rColor: RGB = overallRisk === 'critical' ? C.red : overallRisk === 'high' ? C.orange : overallRisk === 'medium' ? C.yellow : C.green;

    y = drawHeader(doc, pageW, 'Phase 3 — Code Review (SAST)', `Static analysis — ${opts.codeLanguage ?? 'Code'}`, projectName, `RISK: ${overallRisk.toUpperCase()}`, rColor);
    y = drawSummary(doc, pageW, summaryText, y); y += 2;
    y = drawStats(doc, pageW, [
      { label: 'Vulnerabilities', value: vulns.length,    color: vulns.length > 0 ? C.red : C.green },
      { label: 'Critical',        value: vulns.filter((v: any) => v.severity === 'critical').length, color: C.red },
      { label: 'High',            value: vulns.filter((v: any) => v.severity === 'high').length,     color: C.orange },
      { label: 'Code Quality',    value: `${quality}/100`, color: quality >= 70 ? C.green : C.yellow },
    ], y); y += 3;
    for (const v of vulns) {
      y = drawCard(doc, pageW, pageH, { id: v.cwe || v.owasp || v.id, title: v.type || v.name || 'Vulnerability', severity: v.severity, desc: v.description || '', fix: v.fix || v.recommendation || '' }, y, AP);
    }
  }

  // Dependency section
  if (dr) {
    let y = AP();
    const depVulns  = dr.vulnerabilities ?? [];
    const critCount = dr.critical ?? 0;
    const rColor: RGB = critCount > 0 ? C.red : (dr.high ?? 0) > 0 ? C.orange : dr.vulnCount > 0 ? C.yellow : C.green;

    y = drawHeader(doc, pageW, 'Phase 4 — Dependency Scanning', `SCA scan — ${opts.depFileName ?? 'package.json'}`, projectName, `${dr.vulnCount ?? 0} CVEs`, rColor);
    y = drawSummary(doc, pageW, critCount > 0 ? `Critical risk — ${critCount} critical CVEs require immediate action.` : `${dr.vulnCount ?? 0} vulnerabilities found in ${dr.totalDeps ?? 0} packages.`, y); y += 2;
    y = drawStats(doc, pageW, [
      { label: 'Packages', value: dr.totalDeps ?? 0, color: C.white },
      { label: 'CVEs',     value: dr.vulnCount ?? 0, color: dr.vulnCount > 0 ? C.red : C.green },
      { label: 'Critical', value: critCount,          color: critCount > 0 ? C.red : C.green },
      { label: 'High',     value: dr.high ?? 0,       color: (dr.high ?? 0) > 0 ? C.orange : C.green },
    ], y); y += 3;
    for (const v of depVulns.slice(0, 30)) {
      y = drawCard(doc, pageW, pageH, { id: v.id, title: `${v.package} v${v.version}`, severity: v.severity, desc: v.summary || '', fix: v.fixedIn ? `Upgrade to v${v.fixedIn}` : '' }, y, AP);
    }
  }

  // Pipeline security section
  if (pr) {
    let y = AP();
    const pFindings = pr.findings ?? [];
    const pTotal    = pr.totalFindings ?? pFindings.length;
    const pCrit     = pr.critical ?? 0;
    const pColor: RGB = pCrit > 0 ? C.red : (pr.high ?? 0) > 0 ? C.orange : pTotal > 0 ? C.yellow : C.green;

    y = drawHeader(doc, pageW, 'Phase 5 — Pipeline Security', `CI/CD config scan — ${opts.pipelineFilename ?? 'pipeline config'}`, projectName, `RISK: ${pr.riskLevel ?? '—'}`, pColor);
    y = drawSummary(doc, pageW, pCrit > 0 ? `Critical risk — ${pCrit} critical misconfiguration(s) require immediate action.` : `${pTotal} misconfiguration(s) found across ${pr.rulesChecked ?? 0} CI/CD security rules.`, y); y += 2;
    y = drawStats(doc, pageW, [
      { label: 'Findings', value: pTotal,       color: pTotal > 0 ? C.red : C.green },
      { label: 'Critical', value: pCrit,        color: pCrit > 0 ? C.red : C.green },
      { label: 'High',     value: pr.high ?? 0, color: (pr.high ?? 0) > 0 ? C.orange : C.green },
      { label: 'Risk',     value: `${pr.riskScore ?? 0}/100`, color: pColor },
    ], y); y += 4;

    if (pFindings.length > 0) {
      // Findings table — Severity | Rule | Line | Description
      if (y > pageH - 20) y = AP();
      doc.setFillColor(...C.bgCard);
      doc.rect(10, y, pageW - 20, 7, 'F');
      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...C.accent);
      doc.text('SEVERITY', 14, y + 4.5);
      doc.text('RULE', 38, y + 4.5);
      doc.text('LINE', 86, y + 4.5);
      doc.text('DESCRIPTION', 98, y + 4.5);
      y += 9;

      pFindings.slice(0, 40).forEach((f: any, i: number) => {
        const descRaw: string = f.description ?? '';
        const descLines: string[] = doc.splitTextToSize(descRaw.length > 160 ? `${descRaw.slice(0, 157)}...` : descRaw, 92).slice(0, 2);
        const rowH = Math.max(8, descLines.length * 3.5 + 4);
        if (y + rowH > pageH - 14) y = AP();

        // Alternating row background
        if (i % 2 === 0) {
          doc.setFillColor(15, 20, 38);
          doc.rect(10, y - 1, pageW - 20, rowH + 1.5, 'F');
        }

        // Severity badge
        doc.setFillColor(...sev(f.severity ?? 'Medium'));
        doc.roundedRect(12, y, 20, 5.5, 1, 1, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(5.5);
        doc.setFont('helvetica', 'bold');
        doc.text(String(f.severity ?? 'MEDIUM').toUpperCase().slice(0, 8), 22, y + 4, { align: 'center' });

        // Rule
        doc.setTextColor(220, 230, 245);
        doc.setFontSize(6.5);
        doc.text(String(f.rule ?? '').slice(0, 28), 38, y + 4);

        // Line number
        doc.setTextColor(...C.gray);
        doc.setFont('helvetica', 'normal');
        doc.text(f.line != null ? `L${f.line}` : '—', 90, y + 4);

        // Description (wrapped, max 2 lines)
        doc.setFontSize(6.5);
        doc.text(descLines, 98, y + 4);

        y += rowH + 1.5;
      });

      if (pFindings.length > 40) {
        if (y > pageH - 14) y = AP();
        doc.setFontSize(7);
        doc.setTextColor(...C.darkGray);
        doc.text(`+${pFindings.length - 40} more findings not shown`, 14, y + 3);
        y += 7;
      }
    }
  }

  // Cross-phase section
  if (xr) {
    let y = AP();
    const score     = xr.overallScore ?? 0;
    const sColor: RGB = score >= 75 ? C.green : score >= 50 ? C.yellow : C.red;

    y = drawHeader(doc, pageW, 'Phase 6 — Cross-Phase Consistency', 'Requirements → Design → Code consistency audit', projectName, `${score}/100`, sColor);
    y = drawSummary(doc, pageW, xr.summary ?? '', y); y += 2;
    y = drawStats(doc, pageW, [
      { label: 'Score',     value: `${score}/100`,            color: sColor },
      { label: 'Conflicts', value: (xr.conflicts ?? []).length,  color: (xr.conflicts ?? []).length > 0 ? C.red : C.green },
      { label: 'Warnings',  value: (xr.warnings ?? []).length,   color: (xr.warnings ?? []).length > 0 ? C.yellow : C.green },
      { label: 'Consistent', value: (xr.consistent ?? []).length, color: C.green },
    ], y); y += 3;
    for (const c of xr.conflicts ?? []) {
      y = drawCard(doc, pageW, pageH, { id: c.id, title: c.control, severity: c.severity ?? 'high', desc: c.violation ?? '', fix: c.recommendation ?? '' }, y, AP);
    }
    for (const w of xr.warnings ?? []) {
      y = drawCard(doc, pageW, pageH, { id: w.id, title: w.control, severity: w.severity ?? 'medium', desc: w.gap ?? '', fix: w.recommendation ?? '' }, y, AP);
    }
  }

  drawFooter(doc, pageW, pageH, page);
  doc.save(`${projectName.replace(/\s+/g, '_')}_full_security_report.pdf`);
}
// ============================================================
// ORG EXECUTIVE SUMMARY REPORT
// Org-level PDF: all projects, risk posture, team stats
// ============================================================

export interface OrgReportProject {
  name: string
  domain: string
  status: string
  progress: number
  riskScore: number
  currentPhase: string
  teamName?: string
  completedPhases?: number
  vulnCount?: number
  criticalVulns?: number
}

export interface OrgReportData {
  orgName: string
  reportDate: string
  totalProjects: number
  avgRisk: number
  criticalProjects: number
  totalEmployees: number
  projects: OrgReportProject[]
  topRiskyProjects: OrgReportProject[]
}

export async function generateOrgExecutiveSummaryPDF(data: OrgReportData) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = 210;
  const pageH = 297;
  let page = 1;

  const newPage = (d: any, w: number, h: number) => {
    d.addPage();
    d.setFillColor(10, 14, 26);
    d.rect(0, 0, w, h, 'F');
    return 20;
  };
  const AP = () => { drawFooter(doc, pageW, pageH, page++); return newPage(doc, pageW, pageH); };

  // ── Cover Page ──────────────────────────────────────────────
  doc.setFillColor(10, 14, 26);
  doc.rect(0, 0, pageW, pageH, 'F');

  // Header bar
  doc.setFillColor(0, 212, 255);
  doc.rect(0, 0, pageW, 2, 'F');

  // Logo / Brand
  doc.setTextColor(0, 212, 255);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('FORTIFYLENS', 15, 25);
  doc.setTextColor(160, 170, 200);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('SECURE SOFTWARE DEVELOPMENT LIFECYCLE PLATFORM', 15, 31);

  // Title
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(28);
  doc.setFont('helvetica', 'bold');
  doc.text('Executive Security', 15, 75);
  doc.text('Summary Report', 15, 88);

  doc.setFillColor(0, 212, 255);
  doc.rect(15, 93, 50, 1, 'F');

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(160, 170, 200);
  doc.text(data.orgName, 15, 102);
  doc.text(data.reportDate, 15, 109);

  // Org-level risk badge
  const riskColor: RGB = data.avgRisk >= 70 ? C.red : data.avgRisk >= 40 ? C.orange : C.green;
  doc.setFillColor(...riskColor);
  doc.roundedRect(15, 120, 60, 22, 3, 3, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text(`${data.avgRisk}/100`, 45, 133, { align: 'center' });
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text('AVERAGE RISK SCORE', 45, 139, { align: 'center' });

  // Key metrics row
  const metrics = [
    { label: 'Total Projects', value: String(data.totalProjects) },
    { label: 'Employees', value: String(data.totalEmployees) },
    { label: 'Critical Risk', value: String(data.criticalProjects) },
    { label: 'Active Teams', value: String(data.projects.filter(p => p.teamName).length) },
  ];
  let mx = 15;
  metrics.forEach(m => {
    doc.setFillColor(255, 255, 255, 0.05 as any);
    doc.setDrawColor(...C.cyan);
    doc.roundedRect(mx, 150, 43, 22, 2, 2, 'S');
    doc.setTextColor(0, 212, 255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(m.value, mx + 21.5, 162, { align: 'center' });
    doc.setTextColor(160, 170, 200);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text(m.label, mx + 21.5, 169, { align: 'center' });
    mx += 46;
  });

  drawFooter(doc, pageW, pageH, page++);

  // ── Page 2: Project Overview Table ──────────────────────────
  let y = newPage(doc, pageW, pageH);

  doc.setTextColor(0, 212, 255);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Project Security Overview', 15, y);
  y += 3;
  doc.setFillColor(...C.cyan);
  doc.rect(15, y, 180, 0.5, 'F');
  y += 8;

  // Table header
  doc.setFillColor(30, 40, 65);
  doc.rect(15, y, 180, 8, 'F');
  doc.setTextColor(0, 212, 255);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  const cols = [
    { label: 'PROJECT', x: 18 },
    { label: 'DOMAIN', x: 72 },
    { label: 'PHASE', x: 105 },
    { label: 'PROGRESS', x: 138 },
    { label: 'RISK', x: 165 },
    { label: 'STATUS', x: 182 },
  ];
  cols.forEach(c => doc.text(c.label, c.x, y + 5));
  y += 10;

  for (const p of data.projects) {
    if (y > pageH - 20) { y = AP(); }

    // Row bg alternating
    const rowIdx = data.projects.indexOf(p);
    if (rowIdx % 2 === 0) {
      doc.setFillColor(15, 22, 41);
      doc.rect(15, y - 2, 180, 9, 'F');
    }

    doc.setTextColor(220, 230, 245);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text(p.name.slice(0, 22), 18, y + 4);
    doc.text(p.domain?.slice(0, 16) || '—', 72, y + 4);
    doc.text(p.currentPhase || '—', 105, y + 4);

    // Progress bar
    doc.setFillColor(30, 40, 65);
    doc.rect(138, y + 1, 22, 4, 'F');
    const pColor: RGB = p.progress >= 80 ? C.green : p.progress >= 40 ? C.yellow : C.orange;
    doc.setFillColor(...pColor);
    doc.rect(138, y + 1, (22 * p.progress) / 100, 4, 'F');
    doc.setTextColor(160, 170, 200);
    doc.text(`${p.progress}%`, 162, y + 4);

    // Risk score
    const rColor: RGB = p.riskScore >= 70 ? C.red : p.riskScore >= 40 ? C.orange : C.green;
    doc.setTextColor(...rColor);
    doc.setFont('helvetica', 'bold');
    doc.text(`${p.riskScore}/100`, 165, y + 4);

    // Status badge
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(p.status === 'completed' ? C.green[0] : C.cyan[0], p.status === 'completed' ? C.green[1] : C.cyan[1], p.status === 'completed' ? C.green[2] : C.cyan[2]);
    doc.text(p.status || '—', 182, y + 4);

    y += 9;
  }

  drawFooter(doc, pageW, pageH, page++);

  // ── Page 3: Risk Highlights ──────────────────────────────────
  y = newPage(doc, pageW, pageH);

  doc.setTextColor(0, 212, 255);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Risk Highlights & Recommendations', 15, y);
  y += 3;
  doc.setFillColor(...C.cyan);
  doc.rect(15, y, 180, 0.5, 'F');
  y += 10;

  // Top risky projects
  if (data.topRiskyProjects.length > 0) {
    doc.setTextColor(239, 68, 68);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('⚠  Critical/High Risk Projects', 15, y);
    y += 8;

    for (const p of data.topRiskyProjects.slice(0, 5)) {
      if (y > pageH - 25) { y = AP(); }
      const rColor: RGB = p.riskScore >= 70 ? C.red : C.orange;
      doc.setFillColor(...rColor);
      doc.rect(15, y - 1, 3, 12, 'F');
      doc.setTextColor(220, 230, 245);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text(p.name, 22, y + 4);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(160, 170, 200);
      doc.text(`Risk: ${p.riskScore}/100  |  Phase: ${p.currentPhase}  |  Progress: ${p.progress}%${p.teamName ? `  |  Team: ${p.teamName}` : ''}`, 22, y + 9);
      y += 15;
    }
    y += 5;
  }

  // Recommendations
  const recommendations = [
    data.criticalProjects > 0 ? `${data.criticalProjects} project(s) at critical risk — immediate review required` : null,
    data.projects.filter(p => p.progress < 20).length > 0 ? `${data.projects.filter(p => p.progress < 20).length} project(s) with less than 20% SDLC completion — ensure teams are active` : null,
    data.projects.filter(p => !p.teamName).length > 0 ? `${data.projects.filter(p => !p.teamName).length} project(s) without an assigned team` : null,
    data.avgRisk > 60 ? 'Organization-wide average risk is high — consider a security sprint across all projects' : null,
    'Schedule regular STRIDE threat modeling sessions for all active projects',
    'Ensure all projects complete the Dependency Scanning phase to detect known CVEs',
  ].filter(Boolean) as string[];

  doc.setTextColor(0, 212, 255);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Recommendations', 15, y);
  y += 8;

  recommendations.forEach((rec, i) => {
    if (y > pageH - 20) { y = AP(); }
    const isUrgent = rec.includes('critical') || rec.includes('immediate') || rec.includes('high');
    doc.setFillColor(isUrgent ? 239 : 0, isUrgent ? 68 : 212, isUrgent ? 68 : 255, 0.15 as any);
    doc.roundedRect(15, y - 3, 180, 10, 2, 2, 'F');
    doc.setTextColor(isUrgent ? 239 : 0, isUrgent ? 68 : 212, isUrgent ? 68 : 255);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text(`${i + 1}. ${rec}`, 20, y + 3);
    y += 13;
  });

  drawFooter(doc, pageW, pageH, page);
  doc.save(`${data.orgName.replace(/\s+/g, '_')}_Executive_Security_Summary_${new Date().toISOString().split('T')[0]}.pdf`);
}
// ============================================================
// CONSOLIDATED PROJECT REPORT
// Per-project PDF showing all phases, team, vulnerabilities
// ============================================================

export interface ConsolidatedProjectData {
  projectName: string
  domain: string
  status: string
  progress: number
  riskScore: number
  teamName?: string
  teamMembers?: Array<{ name: string; email: string; role?: string }>
  phases: Record<string, {
    status: string
    completion: number
    submittedBy?: string
    approvedBy?: string
    rejectionReason?: string
    result?: any
  }>
  vulnerabilities?: Array<{
    title: string
    severity: string
    description?: string
    recommendation?: string
    phase?: string
    isResolved?: boolean
    assignedToName?: string
  }>
  generatedAt?: string
}

export async function generateConsolidatedProjectPDF(data: ConsolidatedProjectData) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = 210;
  const pageH = 297;
  let page = 1;

  const PHASES_ORDER = ['requirement', 'design', 'development', 'sca', 'crossphase'];
  const PHASE_LABELS: Record<string, string> = {
    requirement:  'Requirements Analysis',
    design:       'Threat Modeling (STRIDE)',
    development:  'Code Review (SAST)',
    sca:          'Dependency Scanning (SCA)',
    crossphase:   'Cross-Phase Consistency',
  };

  const newPage = (d: any) => {
    d.addPage();
    d.setFillColor(10, 14, 26);
    d.rect(0, 0, pageW, pageH, 'F');
    return 20;
  };

  const footer = (d: any, pg: number) => {
    d.setFillColor(0, 212, 255);
    d.rect(0, pageH - 1, pageW, 1, 'F');
    d.setFontSize(7);
    d.setTextColor(100, 120, 150);
    d.text('FortifyLens — Confidential Security Report', 15, pageH - 4);
    d.text(`Page ${pg}`, pageW - 15, pageH - 4, { align: 'right' });
  };

  // ── Cover Page ─────────────────────────────────────────────
  doc.setFillColor(10, 14, 26);
  doc.rect(0, 0, pageW, pageH, 'F');
  doc.setFillColor(0, 212, 255);
  doc.rect(0, 0, pageW, 2, 'F');

  doc.setTextColor(0, 212, 255);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('FORTIFYLENS', 15, 24);
  doc.setTextColor(130, 145, 170);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text('SECURE SDLC PLATFORM', 15, 30);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(26);
  doc.setFont('helvetica', 'bold');
  doc.text('Project Security', 15, 70);
  doc.text('Consolidated Report', 15, 82);

  doc.setFillColor(0, 212, 255);
  doc.rect(15, 87, 45, 0.8, 'F');

  doc.setFontSize(13);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(200, 210, 230);
  doc.text(data.projectName, 15, 96);
  doc.setFontSize(8);
  doc.setTextColor(130, 145, 170);
  doc.text(`Domain: ${data.domain}  |  Generated: ${data.generatedAt ?? new Date().toLocaleDateString()}`, 15, 103);
  if (data.teamName) doc.text(`Team: ${data.teamName}`, 15, 109);

  // Risk badge
  const rColor: RGB = data.riskScore >= 70 ? C.red : data.riskScore >= 40 ? C.orange : C.green;
  doc.setFillColor(...rColor);
  doc.roundedRect(15, 118, 55, 22, 3, 3, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text(`${data.riskScore}/100`, 42.5, 131, { align: 'center' });
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text('RISK SCORE', 42.5, 137, { align: 'center' });

  // Progress
  doc.setFillColor(139, 92, 246);
  doc.roundedRect(78, 118, 45, 22, 3, 3, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text(`${data.progress}%`, 100.5, 131, { align: 'center' });
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text('PROGRESS', 100.5, 137, { align: 'center' });

  // Phase summary strip
  let px = 15;
  PHASES_ORDER.forEach(phase => {
    const pd = data.phases[phase];
    const st = pd?.status ?? 'not-started';
    const fc: RGB = st === 'completed' ? C.green : st === 'submitted' ? C.yellow : st === 'needs-revision' ? C.red : C.gray;
    doc.setFillColor(...fc);
    doc.roundedRect(px, 150, 36, 14, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(5.5);
    doc.setFont('helvetica', 'bold');
    const short = PHASE_LABELS[phase]?.split(' ')[0] ?? phase;
    doc.text(short, px + 18, 157.5, { align: 'center' });
    doc.setFontSize(5);
    doc.setFont('helvetica', 'normal');
    doc.text(st === 'completed' ? '✓ Approved' : st === 'submitted' ? '⏳ Review' : st === 'needs-revision' ? '↩ Revision' : '○ Pending', px + 18, 161.5, { align: 'center' });
    px += 39;
  });

  footer(doc, page++);

  // ── Page 2: SDLC Phase Details ─────────────────────────────
  let y = newPage(doc);

  doc.setTextColor(0, 212, 255);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('SDLC Phase Analysis', 15, y);
  y += 2;
  doc.setFillColor(0, 212, 255);
  doc.rect(15, y, 180, 0.5, 'F');
  y += 8;

  for (const phase of PHASES_ORDER) {
    if (y > pageH - 40) { footer(doc, page++); y = newPage(doc); }

    const pd = data.phases[phase];
    const st = pd?.status ?? 'not-started';
    const completion = pd?.completion ?? 0;
    const statusColor: RGB = st === 'completed' ? C.green : st === 'submitted' ? C.yellow : st === 'needs-revision' ? C.red : C.gray;

    // Phase header
    doc.setFillColor(16, 22, 42);
    doc.rect(15, y, 180, 10, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(PHASE_LABELS[phase] ?? phase, 18, y + 7);
    doc.setFillColor(...statusColor);
    doc.roundedRect(160, y + 1.5, 33, 7, 1.5, 1.5, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7);
    doc.text(st === 'completed' ? 'Approved ✓' : st === 'submitted' ? 'Awaiting Review' : st === 'needs-revision' ? 'Needs Revision' : 'Not Started', 176.5, y + 6.5, { align: 'center' });
    y += 12;

    // Progress bar
    doc.setFillColor(30, 40, 65);
    doc.rect(15, y, 130, 4, 'F');
    if (completion > 0) {
      doc.setFillColor(...statusColor);
      doc.rect(15, y, (130 * completion) / 100, 4, 'F');
    }
    doc.setTextColor(160, 170, 195);
    doc.setFontSize(7);
    doc.text(`${completion}%`, 150, y + 3);
    if (pd?.submittedBy) doc.text(`By: ${pd.submittedBy}`, 165, y + 3, { align: 'right', maxWidth: 30 });
    y += 8;

    if (pd?.rejectionReason) {
      doc.setTextColor(239, 68, 68);
      doc.setFontSize(7);
      doc.text(`↩ Revision requested: ${pd.rejectionReason}`, 18, y);
      y += 6;
    }
    if (pd?.approvedBy) {
      doc.setTextColor(34, 197, 94);
      doc.setFontSize(7);
      doc.text(`✓ Approved by: ${pd.approvedBy}`, 18, y);
      y += 6;
    }

    // Key findings from analysisData
    const result = pd?.result;
    if (result) {
      const findings: string[] = [];
      if (phase === 'requirement') (result.findings ?? []).slice(0, 3).forEach((f: any) => findings.push(`[${f.severity}] ${f.issue?.slice(0, 70) ?? ''}`));
      if (phase === 'design') (result.threats ?? []).slice(0, 3).forEach((t: any) => findings.push(`[${t.category}] ${t.description?.slice(0, 60) ?? ''}`));
      if (phase === 'development') (result.vulnerabilities ?? []).slice(0, 3).forEach((v: any) => findings.push(`[${v.severity}] ${(v.type ?? v.name ?? '').slice(0, 60)}`));
      if (findings.length > 0) {
        doc.setTextColor(160, 170, 195);
        doc.setFontSize(6.5);
        findings.forEach(f => {
          if (y > pageH - 20) { footer(doc, page++); y = newPage(doc); }
          doc.text(`  • ${f}`, 18, y);
          y += 5;
        });
      }
    }
    y += 4;
  }

  // ── Page 3: Team + Vulnerabilities ─────────────────────────
  footer(doc, page++);
  y = newPage(doc);

  // Team section
  if (data.teamMembers && data.teamMembers.length > 0) {
    doc.setTextColor(0, 212, 255);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Team Contributions', 15, y);
    y += 2;
    doc.setFillColor(0, 212, 255);
    doc.rect(15, y, 180, 0.5, 'F');
    y += 8;

    data.teamMembers.forEach(m => {
      if (y > pageH - 20) { footer(doc, page++); y = newPage(doc); }
      doc.setFillColor(16, 22, 42);
      doc.rect(15, y, 180, 9, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text(m.name || m.email, 18, y + 6);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(130, 145, 170);
      doc.setFontSize(7);
      if (m.role) doc.text(m.role, 120, y + 6);
      doc.text(m.email, 155, y + 6, { align: 'right', maxWidth: 50 });
      y += 11;
    });
    y += 6;
  }

  // Vulnerabilities section
  const vulns = data.vulnerabilities ?? [];
  if (vulns.length > 0) {
    if (y > pageH - 50) { footer(doc, page++); y = newPage(doc); }

    doc.setTextColor(0, 212, 255);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`Vulnerabilities (${vulns.length})`, 15, y);
    y += 2;
    doc.setFillColor(0, 212, 255);
    doc.rect(15, y, 180, 0.5, 'F');
    y += 8;

    // Table header
    doc.setFillColor(25, 35, 58);
    doc.rect(15, y, 180, 7, 'F');
    doc.setTextColor(0, 212, 255);
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    doc.text('SEVERITY', 18, y + 5);
    doc.text('FINDING', 42, y + 5);
    doc.text('PHASE', 130, y + 5);
    doc.text('STATUS', 162, y + 5);
    y += 9;

    vulns.slice(0, 40).forEach((v, i) => {
      if (y > pageH - 18) { footer(doc, page++); y = newPage(doc); }

      const sev = (v.severity ?? 'medium').toLowerCase();
      const sevColor: RGB = sev === 'critical' ? C.red : sev === 'high' ? C.orange : sev === 'medium' ? C.yellow : C.gray;

      if (i % 2 === 0) {
        doc.setFillColor(15, 20, 38);
        doc.rect(15, y - 1, 180, 9, 'F');
      }

      doc.setFillColor(...sevColor);
      doc.roundedRect(17, y, 20, 6, 1, 1, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(5.5);
      doc.setFont('helvetica', 'bold');
      doc.text(v.severity?.toUpperCase() ?? 'MEDIUM', 27, y + 4.5, { align: 'center' });

      doc.setTextColor(210, 220, 235);
      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'normal');
      doc.text((v.title ?? v.description ?? '').slice(0, 55), 42, y + 4.5);
      doc.text(v.phase ?? '—', 130, y + 4.5);

      if (v.isResolved) {
        doc.setTextColor(34, 197, 94);
        doc.text('✓ Resolved', 162, y + 4.5);
      } else if (v.assignedToName) {
        doc.setTextColor(0, 212, 255);
        doc.text(v.assignedToName.slice(0, 18), 162, y + 4.5);
      } else {
        doc.setTextColor(130, 145, 170);
        doc.text('Open', 162, y + 4.5);
      }
      y += 9;
    });

    if (vulns.length > 40) {
      doc.setTextColor(130, 145, 170);
      doc.setFontSize(7);
      doc.text(`+${vulns.length - 40} more vulnerabilities not shown`, 15, y + 4);
      y += 8;
    }
  }

  footer(doc, page);
  doc.save(`${data.projectName.replace(/\s+/g, '_')}_Consolidated_Security_Report_${new Date().toISOString().split('T')[0]}.pdf`);
}
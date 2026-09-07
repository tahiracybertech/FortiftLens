import { useState, useEffect } from 'react';
import { AlertTriangle, Shield, Download, CheckCircle2, XCircle, FileText, FileJson, ChevronDown } from 'lucide-react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { generateRequirementPDF } from '../../lib/reportPdfGenerator';

interface Ambiguity {
  id: string;
  statement: string;
  line: number;
  issue: string;
  suggestion: string;
}

interface Vulnerability {
  id: string;
  statement: string;
  line: number;
  severity: 'high' | 'medium' | 'low';
  type: string;
  description: string;
  fix: string;
}

interface AnalysisResult {
  ambiguities: Ambiguity[];
  vulnerabilities: Vulnerability[];
  summary: string;
  overallRisk: 'critical' | 'high' | 'medium' | 'low' | 'safe';
  recommendations: string[];
  completenessScore: number;
  completenessIssues: string[];
}

interface RequirementAnalysisReportProps {
  requirementsText: string;
  onClose?: () => void;
  prefetchedResult?: any;
}

export function RequirementAnalysisReport({ requirementsText, onClose, prefetchedResult }: RequirementAnalysisReportProps) {
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMsg, setLoadingMsg] = useState('Initializing AI analysis...');
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);

  useEffect(() => {
    if (prefetchedResult) {
      // Use the result already fetched by UserDashboard — no second API call needed
      const r = prefetchedResult;
      setAnalysis({
        ambiguities: [],
        vulnerabilities: (r.findings || []).map((f: any, i: number) => ({
          id: `vuln-${i}`,
          statement: f.issue || f.title || 'Security requirement gap',
          line: f.lineNumber || (i + 1),
          severity: ((f.severity || 'medium') === 'Critical' ? 'high'
                   : (f.severity || 'medium') === 'High'     ? 'high'
                   : (f.severity || 'medium') === 'Medium'   ? 'medium'
                   :                                           'low') as 'high' | 'medium' | 'low',
          type: f.issue || f.name || 'Security Gap',
          description: f.issue || f.description || '',
          fix: f.recommendation || '',
        })),
        summary: r.summary || `Risk Score: ${r.riskScore}/100 (${r.riskLevel || 'Unknown'})`,
        overallRisk: (
          r.riskLevel === 'Critical' ? 'critical'
          : r.riskLevel === 'High'    ? 'high'
          : r.riskLevel === 'Medium'  ? 'medium'
          : r.riskScore >= 70         ? 'high'
          : r.riskScore >= 40         ? 'medium'
          :                             'low'
        ) as 'critical' | 'high' | 'medium' | 'low' | 'safe',
        recommendations: r.securityChecklist || [],
        completenessScore: r.securityScore ?? 0,
        completenessIssues: r.missingRequirements || [],
      });
      setLoading(false);
    } else {
      runAIAnalysis();
    }
  }, [requirementsText, prefetchedResult]);

  const runAIAnalysis = async () => {
    setLoading(true);
    const msgs = [
      'Initializing AI analysis...',
      'Scanning for ambiguous statements...',
      'Detecting security gaps...',
      'Evaluating requirement completeness...',
      'Generating recommendations...',
    ];
    let i = 0;
    const interval = setInterval(() => {
      i = (i + 1) % msgs.length;
      setLoadingMsg(msgs[i]);
    }, 1200);

    try {
      // Use the correct backend endpoint and env var name
      const backendUrl = import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_API_URL || 'http://localhost:5000';
      const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken') || '';

      const response = await fetch(`${backendUrl}/api/analysis/requirements`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          requirementsText: requirementsText ?? '',
          codeSnippet:      requirementsText ?? '',
          authentication:   false,
          sensitiveData:    false,
          encryption:       false,
          dataStorage:      false,
          thirdPartyAPIs:   false,
          compliance:       [],
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || data.detail || `Server error ${response.status}`);
      }

      // Backend returns { success: true, analysis: { riskScore, securityScore, findings, ... } }
      const result = data.analysis || data.result || data;

      // Map backend shape → AnalysisResult shape used by this component
      const mapped = {
        ambiguities: [],
        vulnerabilities: (result.findings || []).map((f: any, i: number) => ({
          id: `vuln-${i}`,
          statement: f.issue || f.title || 'Security requirement gap',
          line: f.lineNumber || (i + 1),
          severity: ((f.severity || 'medium') === 'Critical' ? 'high'
                   : (f.severity || 'medium') === 'High'     ? 'high'
                   : (f.severity || 'medium') === 'Medium'   ? 'medium'
                   :                                           'low') as 'high' | 'medium' | 'low',
          type: f.issue || f.name || 'Security Gap',
          description: f.issue || f.description || '',
          fix: f.recommendation || '',
        })),
        summary: result.summary || `Analysis complete — Risk Score: ${result.riskScore}/100 (${result.riskLevel || 'Unknown'})`,
        overallRisk: (
          result.riskLevel === 'Critical' ? 'critical'
          : result.riskLevel === 'High'    ? 'high'
          : result.riskLevel === 'Medium'  ? 'medium'
          : result.riskScore >= 70         ? 'high'
          : result.riskScore >= 40         ? 'medium'
          :                                  'low'
        ) as 'critical' | 'high' | 'medium' | 'low' | 'safe',
        recommendations: result.securityChecklist || [],
        completenessScore: result.securityScore ?? 0,
        completenessIssues: result.missingRequirements || [],
      };

      setAnalysis(mapped);
    } catch (err) {
      console.error('AI analysis failed:', err);
      setAnalysis(fallbackAnalysis(requirementsText ?? ''));
    } finally {
      clearInterval(interval);
      setLoading(false);
    }
  };

  const fallbackAnalysis = (text: string): AnalysisResult => {
    // IMPORTANT: This fallback only runs if the AI API call fails entirely.
    // It must NOT flag correct security requirements as issues.
    // Only flag things that are genuinely absent from the ENTIRE document.
    const lower = text.toLowerCase();
    const vulnerabilities: Vulnerability[] = [];

    // Check for password WITHOUT any hashing/bcrypt mention across the whole document
    const hasPassword = lower.includes('password');
    const hasHashing = lower.includes('bcrypt') || lower.includes('argon2') || lower.includes('hash') || lower.includes('pbkdf2');
    if (hasPassword && !hasHashing) {
      vulnerabilities.push({ id: 'vuln-fallback-1', statement: 'Missing requirement', line: 0, severity: 'high', type: 'Missing Password Hashing', description: 'Document mentions passwords but never specifies a hashing algorithm', fix: 'Add: Passwords must be hashed using bcrypt (cost ≥ 12) or Argon2' });
    }

    // Check for API without authentication mention across the whole document
    const hasApi = lower.includes('api endpoint') || lower.includes('rest api');
    const hasAuth = lower.includes('jwt') || lower.includes('oauth') || lower.includes('bearer') || lower.includes('authentication') || lower.includes('authorize');
    if (hasApi && !hasAuth) {
      vulnerabilities.push({ id: 'vuln-fallback-2', statement: 'Missing requirement', line: 0, severity: 'high', type: 'Missing API Authentication', description: 'API endpoints mentioned without any authentication requirement', fix: 'Add: All API endpoints must require authentication (JWT Bearer token)' });
    }

    return {
      ambiguities: [],
      vulnerabilities,
      summary: vulnerabilities.length === 0
        ? 'AI analysis was unavailable. Static check found no obvious security gaps in the document structure.'
        : `AI analysis unavailable. Static scan found ${vulnerabilities.length} potential gap(s) — re-run for full AI analysis.`,
      overallRisk: vulnerabilities.length > 0 ? 'medium' : 'low',
      recommendations: ['Re-run analysis to get full AI-powered results', 'Check your network connection to the API'],
      completenessScore: (() => {
        let score = 100;
        const l = lower;
        if (!l.includes('auth') && !l.includes('jwt') && !l.includes('login') && !l.includes('oauth')) score -= 20;
        if (!l.includes('encrypt') && !l.includes('tls') && !l.includes('https') && !l.includes('ssl')) score -= 16;
        if (!l.includes('hash') && !l.includes('bcrypt') && !l.includes('argon2') && !l.includes('pbkdf2')) score -= 18;
        if (!l.includes('database') && !l.includes('storage') && !l.includes('db')) score -= 12;
        if (!l.includes('api') && !l.includes('third-party') && !l.includes('integration')) score -= 8;
        if (!l.includes('input validation') && !l.includes('sanitiz') && !l.includes('xss')) score -= 5;
        if (!l.includes('rate limit') && !l.includes('throttl') && !l.includes('brute force')) score -= 5;
        return Math.max(0, Math.min(100, score));
      })(),
      completenessIssues: vulnerabilities.length > 0
        ? vulnerabilities.map(v => v.description)
        : ['AI analysis unavailable — static scan found no critical gaps. Re-run for full results.']
    };
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'critical': return 'text-red-400 bg-red-600/20 border-red-600';
      case 'high': return 'text-orange-400 bg-orange-500/20 border-orange-500';
      case 'medium': return 'text-yellow-400 bg-yellow-500/20 border-yellow-500';
      case 'low': return 'text-blue-400 bg-blue-500/20 border-blue-500';
      default: return 'text-green-400 bg-green-500/20 border-green-500';
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'bg-red-600/10 border-red-600 text-red-400';
      case 'medium': return 'bg-orange-500/10 border-orange-500 text-orange-400';
      default: return 'bg-yellow-500/10 border-yellow-500 text-yellow-400';
    }
  };

  const triggerDownload = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadPDF = async () => {
    if (!analysis) return;
    try {
      await generateRequirementPDF(analysis, 'Security Project');
      toast.success('PDF report downloaded');
    } catch (err) {
      console.error(err);
      toast.error('PDF generation failed');
    }
    setShowDownloadMenu(false);
  };

  const downloadHTML = () => {
    if (!analysis) return;
    const safeText = (requirementsText ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>FortifyLens — Requirement Analysis Report</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',system-ui,sans-serif;background:#f0f4f8;color:#1a202c}
.page{max-width:960px;margin:0 auto;padding:48px 32px}
.header{background:linear-gradient(135deg,#0A0E1A 0%,#0d1829 60%,#001a2e 100%);color:#fff;padding:40px;border-radius:12px;margin-bottom:32px;position:relative;overflow:hidden}
.header::before{content:'';position:absolute;top:-40px;right:-40px;width:200px;height:200px;border-radius:50%;background:rgba(0,212,255,.08)}
.logo{font-size:12px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#00D4FF;margin-bottom:16px}
.header h1{font-size:28px;font-weight:800;margin-bottom:8px}
.meta{display:flex;gap:24px;margin-top:16px;font-size:13px;color:#94a3b8;flex-wrap:wrap}
.risk-pill{display:inline-block;padding:6px 18px;border-radius:20px;font-size:12px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;margin-top:16px;background:${analysis.overallRisk==='safe'?'#064e3b':analysis.overallRisk==='critical'?'#7f1d1d':analysis.overallRisk==='high'?'#7c2d12':'#713f12'};color:${analysis.overallRisk==='safe'?'#6ee7b7':analysis.overallRisk==='critical'?'#fca5a5':analysis.overallRisk==='high'?'#fdba74':'#fde047'}}
.summary-box{background:#fff;border-radius:10px;padding:24px;margin-bottom:24px;box-shadow:0 1px 4px rgba(0,0,0,.08);border-left:4px solid #00D4FF}
.summary-box p{color:#4a5568;line-height:1.7;font-size:15px}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:24px}
.stat{background:#fff;border-radius:10px;padding:20px;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,.08)}
.stat .n{font-size:40px;font-weight:800;line-height:1;margin-bottom:4px}
.stat .l{font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#64748b}
.st .n{color:#dc2626}.sa .n{color:#f59e0b}.sv .n{color:#ea580c}
.section{background:#fff;border-radius:10px;padding:28px;margin-bottom:24px;box-shadow:0 1px 4px rgba(0,0,0,.08)}
.sec-title{font-size:17px;font-weight:700;color:#0A0E1A;margin-bottom:20px;padding-bottom:12px;border-bottom:2px solid #e2e8f0}
.issue-card{border-radius:8px;padding:20px;margin-bottom:16px;border-left:5px solid}
.ic-amb{background:#fefce8;border-color:#ca8a04}
.ic-high{background:#fef2f2;border-color:#dc2626}
.ic-medium{background:#fff7ed;border-color:#ea580c}
.ic-low{background:#fefce8;border-color:#ca8a04}
.badges{display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap}
.badge{display:inline-block;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700}
.bd{background:#1e293b;color:#fff}.bh{background:#fee2e2;color:#dc2626}.bm{background:#ffedd5;color:#ea580c}.bl{background:#fef9c3;color:#ca8a04}.ba{background:#fef9c3;color:#854d0e}
.stmt{font-size:14px;color:#374151;margin:8px 0;padding:8px 12px;background:rgba(0,0,0,.04);border-radius:4px;font-style:italic;border:1px solid rgba(0,0,0,.06)}
.issue-desc{color:#374151;font-size:14px;line-height:1.6;margin:8px 0}
.fix-box{background:#f0fdf4;border:1px solid #86efac;border-radius:6px;padding:10px 14px;margin-top:10px;font-size:13px;color:#166534}
.fix-box strong{display:block;margin-bottom:4px}
.sug-box{background:#eff6ff;border:1px solid #93c5fd;border-radius:6px;padding:10px 14px;margin-top:10px;font-size:13px;color:#1d4ed8}
.sug-box strong{display:block;margin-bottom:4px}
.codeblock{background:#0d1117;color:#e2e8f0;font-family:'Courier New',monospace;font-size:13px;padding:20px;border-radius:8px;overflow-x:auto;line-height:1.7;white-space:pre-wrap}
.recs{list-style:none}
.recs li{display:flex;align-items:flex-start;gap:12px;padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:14px;color:#374151;line-height:1.6}
.recs li::before{content:'→';color:#00D4FF;font-weight:700;flex-shrink:0;margin-top:1px}
.score-row{display:flex;align-items:center;gap:16px;margin-bottom:16px}
.score-circle{width:72px;height:72px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;flex-shrink:0;border:3px solid;background:${(analysis.completenessScore??0)>=80?'#dcfce7':(analysis.completenessScore??0)>=60?'#fef9c3':'#fee2e2'};color:${(analysis.completenessScore??0)>=80?'#166534':(analysis.completenessScore??0)>=60?'#854d0e':'#991b1b'};border-color:${(analysis.completenessScore??0)>=80?'#86efac':(analysis.completenessScore??0)>=60?'#fde047':'#fca5a5'}}
.safe-banner{background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:24px;display:flex;align-items:center;gap:16px;margin-bottom:24px}
.footer{text-align:center;margin-top:48px;padding:24px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:13px}
@media print{body{background:#fff}.page{padding:0}}
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="logo">FortifyLens</div>
    <h1>🛡️ Security Requirement Analysis Report</h1>
    <div class="meta">
      <span>📅 ${new Date().toLocaleString()}</span>
      <span>🔍 AI-Powered Analysis</span>
      <span>📋 Secure SDLC</span>
    </div>
    <div class="risk-pill">Overall Risk: ${(analysis.overallRisk??'safe').toUpperCase()}</div>
  </div>

  <div class="summary-box"><p>${analysis.summary}</p></div>

  <div class="stats">
    <div class="stat st"><div class="n">${(analysis.ambiguities?.length??0)+(analysis.vulnerabilities?.length??0)}</div><div class="l">Total Issues</div></div>
    <div class="stat sa"><div class="n">${analysis.ambiguities?.length??0}</div><div class="l">Ambiguities</div></div>
    <div class="stat sv"><div class="n">${analysis.vulnerabilities?.length??0}</div><div class="l">Security Gaps</div></div>
  </div>

  ${(analysis.ambiguities?.length??0)>0?`
  <div class="section">
    <div class="sec-title">⚠️ Ambiguous Statements (${analysis.ambiguities.length})</div>
    ${analysis.ambiguities.map(a=>`
    <div class="issue-card ic-amb">
      <div class="badges"><span class="badge bd">Line ${a.line}</span><span class="badge ba">AMBIGUOUS</span></div>
      <div class="stmt">"${a.statement}"</div>
      <div class="issue-desc">${a.issue}</div>
      <div class="sug-box"><strong>✏️ Suggested Rewrite:</strong>${a.suggestion}</div>
    </div>`).join('')}
  </div>`:''}

  ${(analysis.vulnerabilities?.length??0)>0?`
  <div class="section">
    <div class="sec-title">🔴 Security Gaps Detected (${analysis.vulnerabilities.length})</div>
    ${analysis.vulnerabilities.map(v=>`
    <div class="issue-card ic-${v.severity}">
      <div class="badges"><span class="badge bd">Line ${v.line}</span><span class="badge b${v.severity[0]}">${v.severity.toUpperCase()}</span></div>
      <div class="stmt">"${v.statement}"</div>
      <div class="issue-desc"><strong>${v.type}:</strong> ${v.description}</div>
      <div class="fix-box"><strong>✅ Required Fix:</strong>${v.fix}</div>
    </div>`).join('')}
  </div>`:`<div class="safe-banner"><span style="font-size:32px">✅</span><div><strong style="color:#166534;font-size:16px">No Security Gaps Detected</strong><br><span style="color:#16a34a;font-size:14px">Requirements passed AI security analysis</span></div></div>`}

  <div class="section">
    <div class="sec-title">📋 Analyzed Requirements</div>
    <div class="codeblock">${safeText}</div>
  </div>

  <div class="section">
    <div class="sec-title">📊 Completeness Score</div>
    <div class="score-row">
      <div class="score-circle">${analysis.completenessScore??0}</div>
      <div><strong style="font-size:15px">Completeness: ${analysis.completenessScore??0}/100</strong><br><span style="color:#64748b;font-size:13px">Based on AI requirements review</span></div>
    </div>
    ${(analysis.completenessIssues?.length??0)>0?`<ul class="recs">${(analysis.completenessIssues??[]).map(i=>`<li>${i}</li>`).join('')}</ul>`:'<p style="color:#10b981;font-size:14px">Requirements appear complete.</p>'}
  </div>

  <div class="section">
    <div class="sec-title">🛡️ Recommendations</div>
    <ul class="recs">${(analysis.recommendations??[]).map(r=>`<li>${r}</li>`).join('')}</ul>
  </div>

  <div class="footer">
    <p><strong>FortifyLens</strong> — Secure SDLC Platform</p>
    <p style="margin-top:6px">Powered by Claude AI &nbsp;·&nbsp; Confidential Report &nbsp;·&nbsp; © ${new Date().getFullYear()}</p>
  </div>
</div>
</body>
</html>`;

    triggerDownload(html, `fortifylens-requirement-report-${new Date().toISOString().split('T')[0]}.html`, 'text/html');
    toast.success('HTML report downloaded');
    setShowDownloadMenu(false);
  };

  const downloadJSON = () => {
    if (!analysis) return;
    const report = {
      meta: { generatedAt: new Date().toISOString(), platform: 'FortifyLens', analysisType: 'AI-Powered Requirement Security Analysis' },
      overallRisk: analysis.overallRisk,
      summary: analysis.summary,
      stats: {
        totalIssues: (analysis.ambiguities?.length??0) + (analysis.vulnerabilities?.length??0),
        ambiguities: analysis.ambiguities?.length??0,
        vulnerabilities: analysis.vulnerabilities?.length??0,
      },
      ambiguities: analysis.ambiguities,
      vulnerabilities: analysis.vulnerabilities,
      completenessScore: analysis.completenessScore,
      completenessIssues: analysis.completenessIssues,
      recommendations: analysis.recommendations,
    };
    triggerDownload(JSON.stringify(report, null, 2), `fortifylens-requirement-report-${new Date().toISOString().split('T')[0]}.json`, 'application/json');
    toast.success('JSON report downloaded');
    setShowDownloadMenu(false);
  };

  const downloadMarkdown = () => {
    if (!analysis) return;
    const md = `# 🛡️ FortifyLens — Requirement Analysis Report

**Generated:** ${new Date().toLocaleString()}
**Overall Risk:** \`${(analysis.overallRisk??'safe').toUpperCase()}\`

---

## Executive Summary

${analysis.summary}

---

## Statistics

| Category | Count |
|----------|-------|
| 🔴 Total Issues | ${(analysis.ambiguities?.length??0)+(analysis.vulnerabilities?.length??0)} |
| ⚠️ Ambiguities | ${analysis.ambiguities?.length??0} |
| 🔒 Security Gaps | ${analysis.vulnerabilities?.length??0} |
| 📊 Completeness Score | ${analysis.completenessScore??0}/100 |

---

## Ambiguous Statements

${(analysis.ambiguities?.length??0)===0?'✅ No ambiguities detected.':(analysis.ambiguities??[]).map((a,i)=>`
### ${i+1}. Line ${a.line}

> "${a.statement}"

**Issue:** ${a.issue}
**Suggestion:** ${a.suggestion}
`).join('\n---\n')}

---

## Security Gaps

${(analysis.vulnerabilities?.length??0)===0?'✅ No security gaps detected.':(analysis.vulnerabilities??[]).map((v,i)=>`
### ${i+1}. ${v.type} — \`${v.severity.toUpperCase()}\` (Line ${v.line})

> "${v.statement}"

**Issue:** ${v.description}
**Fix:** ${v.fix}
`).join('\n---\n')}

---

## Completeness Issues

${(analysis.completenessIssues?.length??0)>0?(analysis.completenessIssues??[]).map(i=>`- ${i}`).join('\n'):'✅ No completeness issues detected.'}

---

## Recommendations

${(analysis.recommendations??[]).map((r,i)=>`${i+1}. ${r}`).join('\n')}

---

*FortifyLens — Secure SDLC Platform | Powered by Claude AI | © ${new Date().getFullYear()}*
`;
    triggerDownload(md, `fortifylens-requirement-report-${new Date().toISOString().split('T')[0]}.md`, 'text/markdown');
    toast.success('Markdown report downloaded');
    setShowDownloadMenu(false);
  };

  // Loading state
  if (loading) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center py-24 space-y-6">
        <div className="relative w-20 h-20">
          <div className="absolute inset-0 rounded-full border-4 border-[#00D4FF]/20 animate-pulse" />
          <div className="absolute inset-0 rounded-full border-4 border-t-[#00D4FF] animate-spin" />
          <Shield className="absolute inset-0 m-auto w-8 h-8 text-[#00D4FF]" />
        </div>
        <div className="text-center">
          <p className="text-white font-semibold text-lg">{loadingMsg}</p>
          <p className="text-gray-400 text-sm mt-1">AI-powered requirement security analysis in progress</p>
        </div>
      </motion.div>
    );
  }

  if (!analysis) return null;

  const totalIssues = (analysis.ambiguities?.length ?? 0) + (analysis.vulnerabilities?.length ?? 0);

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">

      {/* Header */}
      <Card className="p-6 bg-gradient-to-r from-[#0A0E1A] to-[#0d1829] border-[#00D4FF]/30">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Shield className="w-8 h-8 text-[#00D4FF]" />
              <div>
                <h2 className="text-2xl font-bold text-white">Security Requirement Analysis Report</h2>
                <p className="text-gray-400 text-sm">FortifyLens · AI-Powered by Claude</p>
              </div>
            </div>
            <p className="text-gray-300 text-sm mt-2">Generated: {new Date().toLocaleString()}</p>
            <div className={`inline-flex items-center gap-2 mt-3 px-4 py-1.5 rounded-full border text-sm font-bold ${getRiskColor(analysis.overallRisk)}`}>
              Overall Risk: {(analysis.overallRisk ?? 'safe').toUpperCase()}
            </div>
          </div>
          {onClose && <Button onClick={onClose} variant="ghost" className="text-white hover:bg-white/10">✕</Button>}
        </div>
      </Card>

      {/* Summary */}
      <Card className="p-5 bg-[#00D4FF]/5 border-[#00D4FF]/30">
        <p className="text-gray-300 leading-relaxed text-sm">{analysis.summary}</p>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Issues', count: totalIssues, color: 'from-red-600/20 to-red-600/5 border-red-600/30', text: 'text-red-400' },
          { label: 'Ambiguities', count: analysis.ambiguities?.length ?? 0, color: 'from-yellow-500/20 to-yellow-500/5 border-yellow-500/30', text: 'text-yellow-400' },
          { label: 'Security Gaps', count: analysis.vulnerabilities?.length ?? 0, color: 'from-orange-500/20 to-orange-500/5 border-orange-500/30', text: 'text-orange-400' },
        ].map(s => (
          <Card key={s.label} className={`p-4 bg-gradient-to-br ${s.color} border`}>
            <p className="text-xs text-gray-400 mb-1">{s.label}</p>
            <p className={`text-3xl font-bold ${s.text}`}>{s.count}</p>
          </Card>
        ))}
      </div>

      {/* Ambiguities */}
      {(analysis.ambiguities?.length ?? 0) > 0 && (
        <Card className="p-6 bg-white/5 backdrop-blur-sm border-yellow-500/30">
          <div className="flex items-center gap-2 mb-5">
            <AlertTriangle className="w-5 h-5 text-yellow-400" />
            <h3 className="text-xl font-semibold text-white">Ambiguous Statements ({analysis.ambiguities.length})</h3>
          </div>
          <div className="space-y-4">
            {analysis.ambiguities.map((amb) => (
              <motion.div key={amb.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                className="p-4 rounded-lg bg-yellow-500/5 border-l-4 border-yellow-500"
              >
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <Badge variant="outline" className="bg-[#0A0E1A] text-white border-[#00D4FF] text-xs">Line {amb.line}</Badge>
                  <Badge variant="outline" className="bg-yellow-500/20 text-yellow-400 border-yellow-500 text-xs">AMBIGUOUS</Badge>
                </div>
                <div className="bg-yellow-500/10 border border-yellow-500/30 p-3 rounded mb-2">
                  <p className="text-yellow-300 text-sm font-mono italic">"{amb.statement}"</p>
                </div>
                <p className="text-gray-400 text-sm mb-3">{amb.issue}</p>
                <div className="bg-blue-500/10 border border-blue-500/30 p-3 rounded">
                  <p className="text-blue-400 text-xs font-semibold mb-1">✏️ SUGGESTED REWRITE</p>
                  <p className="text-blue-300 text-sm">{amb.suggestion}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </Card>
      )}

      {/* Security Vulnerabilities */}
      {(analysis.vulnerabilities?.length ?? 0) > 0 ? (
        <Card className="p-6 bg-white/5 backdrop-blur-sm border-red-500/30">
          <div className="flex items-center gap-2 mb-5">
            <XCircle className="w-5 h-5 text-red-400" />
            <h3 className="text-xl font-semibold text-white">Security Gaps Detected ({analysis.vulnerabilities.length})</h3>
          </div>
          <div className="space-y-4">
            {analysis.vulnerabilities.map((vuln) => (
              <motion.div key={vuln.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                className={`p-4 rounded-lg border-l-4 ${vuln.severity === 'high' ? 'bg-red-600/5 border-red-600' : vuln.severity === 'medium' ? 'bg-orange-500/5 border-orange-500' : 'bg-yellow-500/5 border-yellow-500'}`}
              >
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <Badge variant="outline" className="bg-[#0A0E1A] text-white border-[#00D4FF] text-xs">Line {vuln.line}</Badge>
                  <Badge variant="outline" className={`text-xs border ${getSeverityColor(vuln.severity)}`}>{vuln.severity.toUpperCase()}</Badge>
                </div>
                <h4 className="text-white font-semibold mb-2">{vuln.type}</h4>
                <div className="bg-red-500/10 border border-red-500/30 p-3 rounded mb-2">
                  <p className="text-red-300 text-sm italic">"{vuln.statement}"</p>
                </div>
                <p className="text-gray-400 text-sm mb-3">{vuln.description}</p>
                <div className="bg-green-500/10 border border-green-500/30 p-3 rounded">
                  <p className="text-green-400 text-xs font-semibold mb-1">✅ REQUIRED FIX</p>
                  <p className="text-green-300 text-sm">{vuln.fix}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </Card>
      ) : (
        <Card className="p-6 bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/30">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-8 h-8 text-green-400" />
            <div>
              <h3 className="text-xl font-semibold text-white">No Security Gaps Detected!</h3>
              <p className="text-gray-400 text-sm mt-1">Requirements passed AI security analysis</p>
            </div>
          </div>
        </Card>
      )}

      {/* Completeness */}
      <Card className="p-6 bg-white/5 backdrop-blur-sm border-[#00D4FF]/20">
        <div className="flex items-center gap-2 mb-4">
          <FileText className="w-5 h-5 text-[#00D4FF]" />
          <h3 className="text-xl font-semibold text-white">Completeness Score</h3>
          <span className={`ml-auto text-2xl font-bold ${(analysis.completenessScore ?? 0) >= 80 ? 'text-green-400' : (analysis.completenessScore ?? 0) >= 60 ? 'text-yellow-400' : 'text-red-400'}`}>
            {analysis.completenessScore ?? 0}/100
          </span>
        </div>
        {(analysis.completenessIssues?.length ?? 0) > 0 ? (
          <div className="space-y-2">
            {(analysis.completenessIssues ?? []).map((issue, i) => (
              <div key={i} className="flex items-start gap-2 text-sm text-gray-300">
                <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                <span>{issue}</span>
              </div>
            ))}
          </div>
        ) : <p className="text-green-400 text-sm">Requirements appear complete.</p>}
      </Card>

      {/* Analyzed Text */}
      <Card className="p-6 bg-white/5 backdrop-blur-sm border-[#00D4FF]/20">
        <div className="flex items-center gap-2 mb-4">
          <FileText className="w-5 h-5 text-[#00D4FF]" />
          <h3 className="text-xl font-semibold text-white">Analyzed Requirements</h3>
        </div>
        <div className="bg-[#0d1117] p-4 rounded-lg border border-[#00D4FF]/10 overflow-x-auto max-h-64">
          <pre className="text-gray-300 font-mono text-sm leading-relaxed whitespace-pre-wrap">{requirementsText}</pre>
        </div>
      </Card>

      {/* Download */}
      <div className="flex items-center gap-4">
        <Button
          onClick={downloadPDF}
          className="bg-gradient-to-r from-[#00D4FF] to-[#00D4FF]/80 hover:from-[#00D4FF]/90 hover:to-[#00D4FF]/70 text-white flex items-center gap-2"
        >
          <Download className="w-4 h-4" />
          Download PDF Report
        </Button>
      </div>

      {/* Recommendations */}
      {(analysis.recommendations?.length ?? 0) > 0 && (
        <Card className="p-6 bg-gradient-to-br from-[#00D4FF]/10 to-[#00D4FF]/5 border-[#00D4FF]/30">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle2 className="w-5 h-5 text-[#00D4FF]" />
            <h3 className="text-xl font-semibold text-white">Recommendations</h3>
          </div>
          <div className="space-y-2">
            {(analysis.recommendations ?? []).map((rec, index) => (
              <div key={index} className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-[#00D4FF]/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-[#00D4FF] text-xs font-semibold">{index + 1}</span>
                </div>
                <p className="text-gray-300 text-sm leading-relaxed">{rec}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

    </motion.div>
  );
}
import { useState, useEffect } from 'react';
import { auth } from '../../lib/firebase';
import { AlertTriangle, Shield, Download, CheckCircle2, XCircle, Code, Bug, FileText, FileJson, ChevronDown } from 'lucide-react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { generateCodeReviewPDF } from '../../lib/reportPdfGenerator';

interface Vulnerability {
  id: string;
  line: number;
  code: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  type: string;
  description: string;
  fix: string;
  cwe: string;
  // CI provenance (present when the scan came from the CLI/CI pipeline)
  source?: 'ci' | 'manual';
  commitSha?: string | null;
  branch?: string | null;
}

interface AnalysisResult {
  vulnerabilities: Vulnerability[];
  summary: string;
  overallRisk: 'critical' | 'high' | 'medium' | 'low' | 'safe';
  recommendations: string[];
  codeQuality: {
    score: number;
    issues: string[];
  };
}

interface CodeReviewReportProps {
  sourceCode: string;
  language?: string;
  onClose?: () => void;
  onAnalysisComplete?: (issueCount: number, risk: string) => void;
  onResult?: (result: any) => void;
  // Org project context — when set, saves result to organizations/{orgId}/projects/{projectId}
  isOrgProject?: boolean;
  orgId?: string;
  projectId?: string;
}

export function CodeReviewReport({ sourceCode, language = 'javascript', onClose, onAnalysisComplete, onResult, isOrgProject, orgId, projectId }: CodeReviewReportProps) {
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMsg, setLoadingMsg] = useState('Initializing AI analysis...');
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);

  useEffect(() => {
    runAIAnalysis();
  }, [sourceCode]);

  const runAIAnalysis = async () => {
    setLoading(true);
    const messages = [
      'Initializing AI analysis...',
      'Scanning for vulnerabilities...',
      'Detecting logic errors & bugs...',
      'Evaluating code quality...',
      'Generating recommendations...',
    ];
    let i = 0;
    const interval = setInterval(() => {
      i = (i + 1) % messages.length;
      setLoadingMsg(messages[i]);
    }, 1200);

    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_API_URL || 'http://localhost:5000';
      // ✅ FIXED: use Firebase ID token (same as apiService.ts)
      let token = '';
      try {
        if (auth.currentUser) {
          token = await auth.currentUser.getIdToken();
        }
      } catch {
        // token stays empty — request will 401 and fall back to static scan
      }

      const response = await fetch(`${backendUrl}/api/analysis/ai-proxy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          type: 'code',
          content: sourceCode ?? '',
          language,
          // Org project context — analysis.js uses these to save phase result to
          // organizations/{orgId}/projects/{projectId}/phases/development
          ...(isOrgProject && orgId && projectId ? { isOrgProject: true, orgId, projectId } : {}),
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || data.detail || `Server error ${response.status}`);
      }

      const parsed: AnalysisResult = data.result;
      setAnalysis(parsed);
      onResult?.(parsed);
      const count = parsed.vulnerabilities?.length ?? 0;
      onAnalysisComplete?.(count, parsed.overallRisk ?? 'safe');
      toast.success(count === 0
        ? 'Code review complete — no vulnerabilities found'
        : `Code review complete — ${count} issue${count !== 1 ? 's' : ''} found (${parsed.overallRisk?.toUpperCase()})`
      );
    } catch (err) {
      console.error('AI analysis failed:', err);
      const fb = fallbackAnalysis(sourceCode ?? '');
      setAnalysis(fb);
      onAnalysisComplete?.(fb.vulnerabilities?.length ?? 0, fb.overallRisk ?? 'safe');
      if (fb.vulnerabilities?.length === 0) {
        toast.info('AI analysis unavailable — static scan found no issues. Re-run for full analysis.');
      } else {
        toast.warning(`AI unavailable — static scan found ${fb.vulnerabilities.length} potential issue(s). Re-run for accurate results.`);
      }
    } finally {
      clearInterval(interval);
      setLoading(false);
    }
  };

  const fallbackAnalysis = (code: string): AnalysisResult => {
    const lines = code.split('\n');
    const vulnerabilities: Vulnerability[] = [];
    lines.forEach((line, index) => {
      const lower = line.toLowerCase().trim();
      if ((lower.includes('query') || lower.includes('sql')) && (lower.includes('+') || lower.includes('${'))) {
        vulnerabilities.push({ id: `v-${index}`, line: index + 1, code: line.trim(), severity: 'critical', type: 'SQL Injection', description: 'User input concatenated into SQL query', fix: 'Use parameterized queries or prepared statements', cwe: 'CWE-89' });
      }
      if ((lower.includes('innerhtml') || lower.includes('dangerouslysetinnerhtml')) && !lower.includes('sanitize')) {
        vulnerabilities.push({ id: `v-${index}`, line: index + 1, code: line.trim(), severity: 'high', type: 'XSS', description: 'Unsanitized input inserted into DOM', fix: 'Use textContent or sanitize with DOMPurify', cwe: 'CWE-79' });
      }
      if ((lower.includes('password') || lower.includes('secret') || lower.includes('apikey')) && lower.includes('=') && !lower.includes('process.env')) {
        vulnerabilities.push({ id: `v-${index}`, line: index + 1, code: line.trim(), severity: 'critical', type: 'Hardcoded Secret', description: 'Credentials hardcoded in source', fix: 'Use environment variables', cwe: 'CWE-798' });
      }
      if (lower.includes('eval(')) {
        vulnerabilities.push({ id: `v-${index}`, line: index + 1, code: line.trim(), severity: 'critical', type: 'Code Injection', description: 'eval() enables arbitrary code execution', fix: 'Remove eval(), use JSON.parse() or safer alternatives', cwe: 'CWE-94' });
      }
    });
    return {
      vulnerabilities,
      summary: vulnerabilities.length > 0 ? `Found ${vulnerabilities.length} security issues via static analysis.` : 'No common vulnerabilities detected.',
      overallRisk: vulnerabilities.some(v => v.severity === 'critical') ? 'critical' : vulnerabilities.some(v => v.severity === 'high') ? 'high' : vulnerabilities.length > 0 ? 'medium' : 'safe',
      recommendations: ['Review all flagged lines carefully', 'Run a full security audit', 'Implement automated scanning in CI/CD'],
      codeQuality: { score: 70, issues: [] }
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
      case 'critical': return 'bg-red-600/10 border-red-600 text-red-400';
      case 'high': return 'bg-orange-500/10 border-orange-500 text-orange-400';
      case 'medium': return 'bg-yellow-500/10 border-yellow-500 text-yellow-400';
      default: return 'bg-blue-500/10 border-blue-500 text-blue-400';
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
      await generateCodeReviewPDF(analysis, 'Security Project', language);
      toast.success('PDF report downloaded');
    } catch (err) {
      console.error(err);
      toast.error('PDF generation failed');
    }
    setShowDownloadMenu(false);
  };

  const downloadHTML = () => {
    if (!analysis) return;
    const crit = analysis.vulnerabilities.filter(v => v.severity === 'critical').length;
    const high = analysis.vulnerabilities.filter(v => v.severity === 'high').length;
    const med = analysis.vulnerabilities.filter(v => v.severity === 'medium').length;
    const low = analysis.vulnerabilities.filter(v => v.severity === 'low').length;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>FortifyLens — Code Security Report</title>
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
.summary{background:#fff;border-radius:10px;padding:24px;margin-bottom:24px;box-shadow:0 1px 4px rgba(0,0,0,.08);border-left:4px solid #00D4FF}
.summary p{color:#4a5568;line-height:1.7;font-size:15px}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px}
.stat{background:#fff;border-radius:10px;padding:20px;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,.08)}
.stat .n{font-size:40px;font-weight:800;line-height:1;margin-bottom:4px}
.stat .l{font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#64748b}
.sc .n{color:#dc2626}.sh .n{color:#ea580c}.sm .n{color:#ca8a04}.sl .n{color:#2563eb}
.section{background:#fff;border-radius:10px;padding:28px;margin-bottom:24px;box-shadow:0 1px 4px rgba(0,0,0,.08)}
.sec-title{font-size:17px;font-weight:700;color:#0A0E1A;margin-bottom:20px;padding-bottom:12px;border-bottom:2px solid #e2e8f0}
.vc{border-radius:8px;padding:20px;margin-bottom:16px;border-left:5px solid}
.vc.critical{background:#fef2f2;border-color:#dc2626}
.vc.high{background:#fff7ed;border-color:#ea580c}
.vc.medium{background:#fefce8;border-color:#ca8a04}
.vc.low{background:#eff6ff;border-color:#2563eb}
.badges{display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap}
.badge{display:inline-block;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700}
.bd{background:#1e293b;color:#fff}.bc{background:#fee2e2;color:#dc2626}.bh{background:#ffedd5;color:#ea580c}.bm{background:#fef9c3;color:#ca8a04}.bl{background:#dbeafe;color:#2563eb}.bw{background:#f1f5f9;color:#64748b}
.vtype{font-size:15px;font-weight:700;color:#1a202c;margin:8px 0}
.vcode{background:#1e1e1e;color:#f87171;font-family:'Courier New',monospace;font-size:13px;padding:10px 14px;border-radius:6px;margin:10px 0;border:1px solid #dc2626;text-decoration:underline;text-decoration-color:#ef4444;text-decoration-thickness:2px;white-space:pre-wrap;word-break:break-all}
.vdesc{color:#374151;font-size:14px;line-height:1.6;margin:8px 0}
.fix{background:#f0fdf4;border:1px solid #86efac;border-radius:6px;padding:10px 14px;margin-top:10px;font-size:13px;color:#166534}
.fix strong{display:block;margin-bottom:4px}
.codeblock{background:#0d1117;color:#e2e8f0;font-family:'Courier New',monospace;font-size:13px;padding:20px;border-radius:8px;overflow-x:auto;line-height:1.7;white-space:pre}
.recs{list-style:none}
.recs li{display:flex;align-items:flex-start;gap:12px;padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:14px;color:#374151;line-height:1.6}
.recs li::before{content:'→';color:#00D4FF;font-weight:700;flex-shrink:0;margin-top:1px}
.qscore{display:flex;align-items:center;gap:16px;margin-bottom:16px}
.qcircle{width:72px;height:72px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;flex-shrink:0;border:3px solid;background:${(analysis.codeQuality?.score??0)>=80?'#dcfce7':(analysis.codeQuality?.score??0)>=60?'#fef9c3':'#fee2e2'};color:${(analysis.codeQuality?.score??0)>=80?'#166534':(analysis.codeQuality?.score??0)>=60?'#854d0e':'#991b1b'};border-color:${(analysis.codeQuality?.score??0)>=80?'#86efac':(analysis.codeQuality?.score??0)>=60?'#fde047':'#fca5a5'}}
.safe{background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:24px;display:flex;align-items:center;gap:16px}
.footer{text-align:center;margin-top:48px;padding:24px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:13px}
@media print{body{background:#fff}.page{padding:0}}
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="logo">FortifyLens</div>
    <h1>🔒 Code Security Analysis Report</h1>
    <div class="meta">
      <span>📅 ${new Date().toLocaleString()}</span>
      <span>💻 ${language.toUpperCase()}</span>
      <span>🤖 AI-Powered Analysis</span>
    </div>
    <div class="risk-pill">Overall Risk: ${(analysis.overallRisk??'safe').toUpperCase()}</div>
  </div>

  <div class="summary"><p>${analysis.summary}</p></div>

  <div class="stats">
    <div class="stat sc"><div class="n">${crit}</div><div class="l">Critical</div></div>
    <div class="stat sh"><div class="n">${high}</div><div class="l">High</div></div>
    <div class="stat sm"><div class="n">${med}</div><div class="l">Medium</div></div>
    <div class="stat sl"><div class="n">${low}</div><div class="l">Low</div></div>
  </div>

  ${analysis.vulnerabilities.length > 0 ? `
  <div class="section">
    <div class="sec-title">⚠️ Vulnerabilities Detected (${analysis.vulnerabilities.length})</div>
    ${analysis.vulnerabilities.map(v=>`
    <div class="vc ${v.severity}">
      <div class="badges">
        <span class="badge bd">Line ${v.line}</span>
        <span class="badge b${v.severity[0]}">${v.severity.toUpperCase()}</span>
        ${v.cwe?`<span class="badge bw">${v.cwe}</span>`:''}
      </div>
      <div class="vtype">${v.type}</div>
      <div class="vcode">${v.code.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
      <div class="vdesc">${v.description}</div>
      <div class="fix"><strong>✅ Recommended Fix:</strong>${v.fix}</div>
    </div>`).join('')}
  </div>` : `<div class="safe"><span style="font-size:32px">✅</span><div><strong style="color:#166534;font-size:16px">No Vulnerabilities Detected</strong><br><span style="color:#16a34a;font-size:14px">Your code passed AI security analysis</span></div></div>`}

  <div class="section">
    <div class="sec-title">📝 Analyzed Source Code</div>
    <div class="codeblock">${(sourceCode??'').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
  </div>

  <div class="section">
    <div class="sec-title">📊 Code Quality</div>
    <div class="qscore">
      <div class="qcircle">${analysis.codeQuality?.score??0}</div>
      <div><strong style="font-size:15px">Quality Score: ${analysis.codeQuality?.score??0}/100</strong><br><span style="color:#64748b;font-size:13px">Based on AI code review</span></div>
    </div>
    ${(analysis.codeQuality?.issues?.length??0)>0?`<ul class="recs">${(analysis.codeQuality?.issues??[]).map(i=>`<li>${i}</li>`).join('')}</ul>`:'<p style="color:#10b981;font-size:14px">No code quality issues detected.</p>'}
  </div>

  <div class="section">
    <div class="sec-title">🛡️ Security Recommendations</div>
    <ul class="recs">${(analysis.recommendations??[]).map(r=>`<li>${r}</li>`).join('')}</ul>
  </div>

  <div class="footer">
    <p><strong>FortifyLens</strong> — Secure SDLC Platform</p>
    <p style="margin-top:6px">Powered by Claude AI &nbsp;·&nbsp; Confidential Report &nbsp;·&nbsp; © ${new Date().getFullYear()}</p>
  </div>
</div>
</body>
</html>`;

    triggerDownload(html, `fortifylens-code-report-${new Date().toISOString().split('T')[0]}.html`, 'text/html');
    toast.success('HTML report downloaded');
    setShowDownloadMenu(false);
  };

  const downloadJSON = () => {
    if (!analysis) return;
    const report = {
      meta: { generatedAt: new Date().toISOString(), platform: 'FortifyLens', language, analysisType: 'AI-Powered Code Security Analysis' },
      overallRisk: analysis.overallRisk,
      summary: analysis.summary,
      stats: {
        total: analysis.vulnerabilities.length,
        critical: analysis.vulnerabilities.filter(v=>v.severity==='critical').length,
        high: analysis.vulnerabilities.filter(v=>v.severity==='high').length,
        medium: analysis.vulnerabilities.filter(v=>v.severity==='medium').length,
        low: analysis.vulnerabilities.filter(v=>v.severity==='low').length,
      },
      vulnerabilities: analysis.vulnerabilities,
      codeQuality: analysis.codeQuality,
      recommendations: analysis.recommendations,
    };
    triggerDownload(JSON.stringify(report, null, 2), `fortifylens-code-report-${new Date().toISOString().split('T')[0]}.json`, 'application/json');
    toast.success('JSON report downloaded');
    setShowDownloadMenu(false);
  };

  const downloadMarkdown = () => {
    if (!analysis) return;
    const crit = analysis.vulnerabilities.filter(v=>v.severity==='critical').length;
    const high = analysis.vulnerabilities.filter(v=>v.severity==='high').length;
    const med = analysis.vulnerabilities.filter(v=>v.severity==='medium').length;
    const low = analysis.vulnerabilities.filter(v=>v.severity==='low').length;

    const md = `# 🔒 FortifyLens — Code Security Analysis Report

**Generated:** ${new Date().toLocaleString()}
**Language:** ${language.toUpperCase()}
**Overall Risk:** \`${(analysis.overallRisk??'safe').toUpperCase()}\`

---

## Executive Summary

${analysis.summary}

---

## Vulnerability Statistics

| Severity | Count |
|----------|-------|
| 🔴 Critical | ${crit} |
| 🟠 High | ${high} |
| 🟡 Medium | ${med} |
| 🔵 Low | ${low} |
| **Total** | **${analysis.vulnerabilities.length}** |

---

## Vulnerabilities Found

${analysis.vulnerabilities.length===0?'✅ No vulnerabilities detected.':analysis.vulnerabilities.map((v,i)=>`
### ${i+1}. ${v.type} — \`${v.severity.toUpperCase()}\`${v.cwe?` (${v.cwe})`:''}

**Line:** ${v.line}
\`\`\`
${v.code}
\`\`\`
**Issue:** ${v.description}
**Fix:** ${v.fix}
`).join('\n---\n')}

---

## Code Quality

**Score:** ${analysis.codeQuality?.score??0}/100

${(analysis.codeQuality?.issues?.length??0)>0?(analysis.codeQuality?.issues??[]).map(i=>`- ${i}`).join('\n'):'✅ No code quality issues detected.'}

---

## Security Recommendations

${(analysis.recommendations??[]).map((r,i)=>`${i+1}. ${r}`).join('\n')}

---

*FortifyLens — Secure SDLC Platform | Powered by Claude AI | © ${new Date().getFullYear()}*
`;
    triggerDownload(md, `fortifylens-code-report-${new Date().toISOString().split('T')[0]}.md`, 'text/markdown');
    toast.success('Markdown report downloaded');
    setShowDownloadMenu(false);
  };

  if (loading) {
    return (
      <motion.div initial={{opacity:0}} animate={{opacity:1}} className="flex flex-col items-center justify-center py-24 space-y-6">
        <div className="relative w-20 h-20">
          <div className="absolute inset-0 rounded-full border-4 border-[#00D4FF]/20 animate-pulse" />
          <div className="absolute inset-0 rounded-full border-4 border-t-[#00D4FF] animate-spin" />
          <Shield className="absolute inset-0 m-auto w-8 h-8 text-[#00D4FF]" />
        </div>
        <div className="text-center">
          <p className="text-white font-semibold text-lg">{loadingMsg}</p>
          <p className="text-gray-400 text-sm mt-1">AI-powered deep code analysis in progress</p>
        </div>
      </motion.div>
    );
  }

  if (!analysis) return null;

  const criticalCount = analysis.vulnerabilities.filter(v=>v.severity==='critical').length;
  const highCount = analysis.vulnerabilities.filter(v=>v.severity==='high').length;
  const mediumCount = analysis.vulnerabilities.filter(v=>v.severity==='medium').length;
  const lowCount = analysis.vulnerabilities.filter(v=>v.severity==='low').length;

  return (
    <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} className="space-y-6">

      <Card className="p-6 bg-gradient-to-r from-[#0A0E1A] to-[#0d1829] border-[#00D4FF]/30">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Code className="w-8 h-8 text-[#00D4FF]" />
              <div>
                <h2 className="text-2xl font-bold text-white">Code Security Analysis Report</h2>
                <p className="text-gray-400 text-sm">FortifyLens · AI-Powered by Claude</p>
              </div>
            </div>
            <p className="text-gray-300 text-sm mt-2">Generated: {new Date().toLocaleString()} · Language: {language.toUpperCase()}</p>
            <div className={`inline-flex items-center gap-2 mt-3 px-4 py-1.5 rounded-full border text-sm font-bold ${getRiskColor(analysis.overallRisk)}`}>
              Overall Risk: {(analysis.overallRisk??'safe').toUpperCase()}
            </div>
          </div>
          {onClose && <Button onClick={onClose} variant="ghost" className="text-white hover:bg-white/10">✕</Button>}
        </div>
      </Card>

      <Card className="p-5 bg-[#00D4FF]/5 border-[#00D4FF]/30">
        <p className="text-gray-300 leading-relaxed text-sm">{analysis.summary}</p>
      </Card>

      <div className="grid grid-cols-4 gap-4">
        {[
          {label:'Critical',count:criticalCount,color:'from-red-600/20 to-red-600/5 border-red-600/30',text:'text-red-400'},
          {label:'High',count:highCount,color:'from-orange-500/20 to-orange-500/5 border-orange-500/30',text:'text-orange-400'},
          {label:'Medium',count:mediumCount,color:'from-yellow-500/20 to-yellow-500/5 border-yellow-500/30',text:'text-yellow-400'},
          {label:'Low',count:lowCount,color:'from-blue-500/20 to-blue-500/5 border-blue-500/30',text:'text-blue-400'},
        ].map(s=>(
          <Card key={s.label} className={`p-4 bg-gradient-to-br ${s.color} border`}>
            <p className="text-xs text-gray-400 mb-1">{s.label}</p>
            <p className={`text-3xl font-bold ${s.text}`}>{s.count}</p>
          </Card>
        ))}
      </div>

      {analysis.vulnerabilities.length > 0 ? (
        <Card className="p-6 bg-white/5 backdrop-blur-sm border-red-500/30">
          <div className="flex items-center gap-2 mb-5">
            <XCircle className="w-5 h-5 text-red-400" />
            <h3 className="text-xl font-semibold text-white">Vulnerabilities Detected ({analysis.vulnerabilities.length})</h3>
          </div>
          <div className="space-y-4">
            {analysis.vulnerabilities.map((vuln)=>(
              <motion.div key={vuln.id} initial={{opacity:0,x:-10}} animate={{opacity:1,x:0}}
                className={`p-4 rounded-lg border-l-4 ${vuln.severity==='critical'?'bg-red-600/5 border-red-600':vuln.severity==='high'?'bg-orange-500/5 border-orange-500':vuln.severity==='medium'?'bg-yellow-500/5 border-yellow-500':'bg-blue-500/5 border-blue-500'}`}
              >
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <Badge variant="outline" className="bg-[#0A0E1A] text-white border-[#00D4FF] text-xs">Line {vuln.line}</Badge>
                  <Badge variant="outline" className={`text-xs border ${getSeverityColor(vuln.severity)}`}>{vuln.severity.toUpperCase()}</Badge>
                  {vuln.cwe && <Badge variant="outline" className="bg-gray-700/50 text-gray-300 border-gray-600 text-xs">{vuln.cwe}</Badge>}
                  {vuln.source === 'ci' && (
                    <Badge variant="outline" className="bg-teal-500/10 text-teal-300 border-teal-500/50 text-xs font-mono">
                      via CI{vuln.commitSha ? ` · commit ${vuln.commitSha.slice(0, 7)}` : ''}
                    </Badge>
                  )}
                </div>
                <h4 className="text-white font-semibold mb-2">{vuln.type}</h4>
                <div className="bg-red-500/10 border border-red-500/30 p-3 rounded mb-2">
                  <code className="text-red-400 text-sm font-mono underline decoration-red-500 decoration-2 break-all">{vuln.code}</code>
                </div>
                <p className="text-gray-400 text-sm mb-3">{vuln.description}</p>
                <div className="bg-green-500/10 border border-green-500/30 p-3 rounded">
                  <p className="text-green-400 text-xs font-semibold mb-1">✅ RECOMMENDED FIX</p>
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
              <h3 className="text-xl font-semibold text-white">No Vulnerabilities Detected!</h3>
              <p className="text-gray-400 text-sm mt-1">Your code passed the AI security analysis</p>
            </div>
          </div>
        </Card>
      )}

      <Card className="p-6 bg-white/5 backdrop-blur-sm border-[#00D4FF]/20">
        <div className="flex items-center gap-2 mb-4">
          <Bug className="w-5 h-5 text-[#00D4FF]" />
          <h3 className="text-xl font-semibold text-white">Code Quality</h3>
          <span className={`ml-auto text-2xl font-bold ${(analysis.codeQuality?.score??0)>=80?'text-green-400':(analysis.codeQuality?.score??0)>=60?'text-yellow-400':'text-red-400'}`}>
            {analysis.codeQuality?.score??0}/100
          </span>
        </div>
        {(analysis.codeQuality?.issues?.length??0) > 0 ? (
          <div className="space-y-2">
            {(analysis.codeQuality?.issues??[]).map((issue,i)=>(
              <div key={i} className="flex items-start gap-2 text-sm text-gray-300">
                <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                <span>{issue}</span>
              </div>
            ))}
          </div>
        ) : <p className="text-green-400 text-sm">No code quality issues detected.</p>}
      </Card>

      <Card className="p-6 bg-white/5 backdrop-blur-sm border-[#00D4FF]/20">
        <div className="flex items-center gap-2 mb-4">
          <FileText className="w-5 h-5 text-[#00D4FF]" />
          <h3 className="text-xl font-semibold text-white">Analyzed Source Code</h3>
        </div>
        <div className="bg-[#0d1117] p-4 rounded-lg border border-[#00D4FF]/10 overflow-x-auto max-h-64">
          <pre className="text-gray-300 font-mono text-sm leading-relaxed">{sourceCode}</pre>
        </div>
      </Card>

      <div className="flex items-center gap-4">
        <Button
          onClick={downloadPDF}
          className="bg-gradient-to-r from-[#00D4FF] to-[#00D4FF]/80 hover:from-[#00D4FF]/90 hover:to-[#00D4FF]/70 text-white flex items-center gap-2"
        >
          <Download className="w-4 h-4" />
          Download PDF Report
        </Button>
      </div>

      {(analysis.recommendations?.length??0) > 0 && (
        <Card className="p-6 bg-gradient-to-br from-[#00D4FF]/10 to-[#00D4FF]/5 border-[#00D4FF]/30">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-5 h-5 text-[#00D4FF]" />
            <h3 className="text-xl font-semibold text-white">Security Recommendations</h3>
          </div>
          <div className="space-y-2">
            {(analysis.recommendations??[]).map((rec,index)=>(
              <div key={index} className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-[#00D4FF]/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-[#00D4FF] text-xs font-semibold">{index+1}</span>
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
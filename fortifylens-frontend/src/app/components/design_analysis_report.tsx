import { useState, useEffect } from 'react';
import { AlertTriangle, Shield, Download, CheckCircle2, XCircle, Layers, FileText, FileJson, ChevronDown, Palette, Layout } from 'lucide-react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { generateThreatPDF } from '../../lib/reportPdfGenerator';

interface DesignIssue {
  id: string;
  component: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  description: string;
  impact: string;
  recommendation: string;
}

interface DesignPattern {
  name: string;
  used: boolean;
  appropriateness: 'appropriate' | 'inappropriate' | 'missing';
  suggestion?: string;
}

interface AnalysisResult {
  issues: DesignIssue[];
  patterns: DesignPattern[];
  summary: string;
  overallQuality: 'excellent' | 'good' | 'fair' | 'poor';
  securityScore: number;
  scalabilityScore: number;
  maintainabilityScore: number;
  recommendations: string[];
  designPrinciples: {
    solid: number;
    dryConcern: number;
    coupling: 'low' | 'medium' | 'high';
    cohesion: 'low' | 'medium' | 'high';
  };
}

interface DesignAnalysisReportProps {
  designDocument: string;
  designType?: string;
  onClose?: () => void;
}

export function DesignAnalysisReport({ designDocument, designType = 'System Architecture', onClose }: DesignAnalysisReportProps) {
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMsg, setLoadingMsg] = useState('Initializing AI analysis...');
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);

  useEffect(() => {
    runAIAnalysis();
  }, [designDocument]);

  const runAIAnalysis = async () => {
    setLoading(true);
    const msgs = [
      'Initializing AI analysis...',
      'Analyzing architecture patterns...',
      'Evaluating security design...',
      'Checking scalability concerns...',
      'Assessing maintainability...',
      'Generating recommendations...',
    ];
    let i = 0;
    const interval = setInterval(() => {
      i = (i + 1) % msgs.length;
      setLoadingMsg(msgs[i]);
    }, 1200);

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1500,
          system: `You are an expert software architecture and design analyst specializing in secure system design. Analyze the provided design document and return ONLY a valid JSON object with no markdown, no backticks, no extra text. Follow this exact structure:
{
  "issues": [
    {
      "id": "issue-1",
      "component": "<component or module name>",
      "severity": "<critical|high|medium|low>",
      "category": "<Security|Performance|Scalability|Maintainability|etc>",
      "description": "<detailed issue description>",
      "impact": "<business/technical impact>",
      "recommendation": "<specific fix or improvement>"
    }
  ],
  "patterns": [
    {
      "name": "<pattern name>",
      "used": <true|false>,
      "appropriateness": "<appropriate|inappropriate|missing>",
      "suggestion": "<optional suggestion if inappropriate or missing>"
    }
  ],
  "summary": "<2-3 sentence executive summary>",
  "overallQuality": "<excellent|good|fair|poor>",
  "securityScore": <integer 0-100>,
  "scalabilityScore": <integer 0-100>,
  "maintainabilityScore": <integer 0-100>,
  "recommendations": ["<actionable recommendation 1>", "<actionable recommendation 2>"],
  "designPrinciples": {
    "solid": <integer 0-100>,
    "dryConcern": <integer 0-100>,
    "coupling": "<low|medium|high>",
    "cohesion": "<low|medium|high>"
  }
}

Analyze for: security architecture flaws (missing encryption, weak auth, no audit logging), single points of failure, scalability bottlenecks, tight coupling, low cohesion, missing error handling, inadequate data validation, poor separation of concerns, lack of monitoring/observability, missing disaster recovery, inadequate API design, database design issues, missing caching strategy, session management flaws, and SOLID principle violations. Evaluate common design patterns (MVC, Microservices, Event-Driven, Repository, Factory, Singleton, etc.) for appropriateness.`,
          messages: [
            {
              role: 'user',
              content: `Analyze this ${designType} design document:\n\n${designDocument ?? ''}`
            }
          ]
        })
      });

      const data = await response.json();
      const text = data.content?.map((c: { type: string; text?: string }) => c.type === 'text' ? c.text : '').join('') ?? '';
      const clean = text.replace(/```json|```/g, '').trim();
      const parsed: AnalysisResult = JSON.parse(clean);
      setAnalysis(parsed);
    } catch (err) {
      console.error('AI analysis failed:', err);
      setAnalysis(fallbackAnalysis(designDocument ?? ''));
    } finally {
      clearInterval(interval);
      setLoading(false);
    }
  };

  const fallbackAnalysis = (text: string): AnalysisResult => {
    const lower = text.toLowerCase();
    const issues: DesignIssue[] = [];

    if (!lower.includes('authentication') && !lower.includes('auth')) {
      issues.push({
        id: 'i-1',
        component: 'Security Layer',
        severity: 'critical',
        category: 'Security',
        description: 'No authentication mechanism specified in design',
        impact: 'Unauthorized access to system resources',
        recommendation: 'Add JWT/OAuth2 authentication layer with role-based access control'
      });
    }

    if (!lower.includes('encrypt') && !lower.includes('ssl') && !lower.includes('tls')) {
      issues.push({
        id: 'i-2',
        component: 'Communication Layer',
        severity: 'high',
        category: 'Security',
        description: 'No encryption specified for data transmission',
        impact: 'Data interception and man-in-the-middle attacks',
        recommendation: 'Implement TLS 1.3 for all communications and encrypt sensitive data at rest'
      });
    }

    if (!lower.includes('logging') && !lower.includes('monitor')) {
      issues.push({
        id: 'i-3',
        component: 'Observability',
        severity: 'medium',
        category: 'Maintainability',
        description: 'No logging or monitoring strategy defined',
        impact: 'Difficult to debug issues and detect security incidents',
        recommendation: 'Implement centralized logging (ELK/Splunk) and monitoring (Prometheus/Grafana)'
      });
    }

    if (!lower.includes('cache') && !lower.includes('redis')) {
      issues.push({
        id: 'i-4',
        component: 'Performance Layer',
        severity: 'medium',
        category: 'Performance',
        description: 'No caching strategy mentioned',
        impact: 'Poor performance under load',
        recommendation: 'Implement Redis/Memcached for frequently accessed data'
      });
    }

    return {
      issues,
      patterns: [
        { name: 'Layered Architecture', used: true, appropriateness: 'appropriate' },
        { name: 'MVC Pattern', used: false, appropriateness: 'missing', suggestion: 'Consider implementing MVC for better separation' }
      ],
      summary: `Found ${issues.length} design issues via static analysis. Primary concerns around security and monitoring.`,
      overallQuality: issues.filter(i => i.severity === 'critical').length > 0 ? 'poor' : issues.length > 2 ? 'fair' : 'good',
      securityScore: 55,
      scalabilityScore: 70,
      maintainabilityScore: 65,
      recommendations: [
        'Implement comprehensive security measures',
        'Add monitoring and logging infrastructure',
        'Define clear API contracts',
        'Document error handling strategy'
      ],
      designPrinciples: {
        solid: 60,
        dryConcern: 70,
        coupling: 'medium',
        cohesion: 'medium'
      }
    };
  };

  const getQualityColor = (quality: string) => {
    switch (quality) {
      case 'excellent': return 'text-green-400 bg-green-600/20 border-green-600';
      case 'good': return 'text-blue-400 bg-blue-500/20 border-blue-500';
      case 'fair': return 'text-yellow-400 bg-yellow-500/20 border-yellow-500';
      default: return 'text-red-400 bg-red-600/20 border-red-600';
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

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-400';
    if (score >= 60) return 'text-yellow-400';
    return 'text-red-400';
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
      // Map design analysis shape to threat PDF shape
      const threatShape = {
        riskScore: analysis.securityScore ?? 50,
        summary: analysis.summary ?? '',
        threats: (analysis.issues ?? []).map((issue: any, i: number) => ({
          id: issue.id ?? `T-${i+1}`,
          title: issue.description ?? issue.category,
          category: issue.category,
          severity: issue.severity,
          description: issue.impact ?? issue.description ?? '',
          mitigation: issue.recommendation ?? '',
        })),
        recommendations: analysis.recommendations ?? [],
        policyViolations: [],
      };
      await generateThreatPDF(threatShape, 'Security Project');
      toast.success('PDF report downloaded');
    } catch (err) {
      console.error(err);
      toast.error('PDF generation failed');
    }
    setShowDownloadMenu(false);
  };

  const downloadHTML = () => {
    if (!analysis) return;
    const crit = analysis.issues.filter(i => i.severity === 'critical').length;
    const high = analysis.issues.filter(i => i.severity === 'high').length;
    const med = analysis.issues.filter(i => i.severity === 'medium').length;
    const low = analysis.issues.filter(i => i.severity === 'low').length;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>FortifyLens — Design Analysis Report</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',system-ui,sans-serif;background:#f0f4f8;color:#1a202c}
.page{max-width:1000px;margin:0 auto;padding:48px 32px}
.header{background:linear-gradient(135deg,#0A0E1A 0%,#0d1829 60%,#001a2e 100%);color:#fff;padding:40px;border-radius:12px;margin-bottom:32px;position:relative;overflow:hidden}
.header::before{content:'';position:absolute;top:-40px;right:-40px;width:200px;height:200px;border-radius:50%;background:rgba(0,212,255,.08)}
.logo{font-size:12px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#00D4FF;margin-bottom:16px}
.header h1{font-size:28px;font-weight:800;margin-bottom:8px}
.meta{display:flex;gap:24px;margin-top:16px;font-size:13px;color:#94a3b8;flex-wrap:wrap}
.quality-pill{display:inline-block;padding:6px 18px;border-radius:20px;font-size:12px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;margin-top:16px;background:${analysis.overallQuality==='excellent'?'#064e3b':analysis.overallQuality==='poor'?'#7f1d1d':analysis.overallQuality==='fair'?'#713f12':'#1e40af'};color:${analysis.overallQuality==='excellent'?'#6ee7b7':analysis.overallQuality==='poor'?'#fca5a5':analysis.overallQuality==='fair'?'#fde047':'#93c5fd'}}
.summary{background:#fff;border-radius:10px;padding:24px;margin-bottom:24px;box-shadow:0 1px 4px rgba(0,0,0,.08);border-left:4px solid #00D4FF}
.summary p{color:#4a5568;line-height:1.7;font-size:15px}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px}
.stat{background:#fff;border-radius:10px;padding:20px;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,.08)}
.stat .n{font-size:40px;font-weight:800;line-height:1;margin-bottom:4px}
.stat .l{font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#64748b}
.sc .n{color:#dc2626}.sh .n{color:#ea580c}.sm .n{color:#ca8a04}.sl .n{color:#2563eb}
.scores{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:24px}
.score-card{background:#fff;border-radius:10px;padding:24px;box-shadow:0 1px 4px rgba(0,0,0,.08)}
.score-card h3{font-size:13px;font-weight:700;color:#64748b;margin-bottom:12px;text-transform:uppercase;letter-spacing:1px}
.score-val{font-size:48px;font-weight:800;line-height:1}
.section{background:#fff;border-radius:10px;padding:28px;margin-bottom:24px;box-shadow:0 1px 4px rgba(0,0,0,.08)}
.sec-title{font-size:17px;font-weight:700;color:#0A0E1A;margin-bottom:20px;padding-bottom:12px;border-bottom:2px solid #e2e8f0}
.issue{border-radius:8px;padding:20px;margin-bottom:16px;border-left:5px solid}
.issue.critical{background:#fef2f2;border-color:#dc2626}
.issue.high{background:#fff7ed;border-color:#ea580c}
.issue.medium{background:#fefce8;border-color:#ca8a04}
.issue.low{background:#eff6ff;border-color:#2563eb}
.badges{display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap}
.badge{display:inline-block;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700}
.bd{background:#1e293b;color:#fff}.bc{background:#fee2e2;color:#dc2626}.bh{background:#ffedd5;color:#ea580c}.bm{background:#fef9c3;color:#ca8a04}.bl{background:#dbeafe;color:#2563eb}.bcat{background:#f1f5f9;color:#475569}
.comp{font-size:15px;font-weight:700;color:#1a202c;margin:8px 0}
.desc{color:#374151;font-size:14px;line-height:1.6;margin:8px 0}
.impact{background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:10px 14px;margin-top:10px;font-size:13px;color:#991b1b}
.impact strong{display:block;margin-bottom:4px}
.rec{background:#f0fdf4;border:1px solid #86efac;border-radius:6px;padding:10px 14px;margin-top:10px;font-size:13px;color:#166534}
.rec strong{display:block;margin-bottom:4px}
.pattern{display:flex;align-items:center;justify-content:space-between;padding:12px;margin-bottom:8px;background:#f8fafc;border-radius:6px;border:1px solid #e2e8f0}
.pattern-name{font-weight:600;color:#1a202c}
.pattern-status{font-size:12px;padding:4px 12px;border-radius:12px;font-weight:700}
.p-app{background:#dcfce7;color:#166534}
.p-inapp{background:#fee2e2;color:#991b1b}
.p-miss{background:#fef3c7;color:#854d0e}
.principles{display:grid;grid-template-columns:repeat(2,1fr);gap:16px}
.principle{padding:16px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0}
.principle h4{font-size:13px;color:#64748b;margin-bottom:8px;text-transform:uppercase}
.principle .val{font-size:24px;font-weight:800}
.recs{list-style:none}
.recs li{display:flex;align-items:flex-start;gap:12px;padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:14px;color:#374151;line-height:1.6}
.recs li::before{content:'→';color:#00D4FF;font-weight:700;flex-shrink:0;margin-top:1px}
.footer{text-align:center;margin-top:48px;padding:24px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:13px}
@media print{body{background:#fff}.page{padding:0}}
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="logo">FortifyLens</div>
    <h1>🏗️ Design Analysis Report</h1>
    <div class="meta">
      <span>📅 ${new Date().toLocaleString()}</span>
      <span>📐 ${designType}</span>
      <span>🤖 AI-Powered Analysis</span>
    </div>
    <div class="quality-pill">Overall Quality: ${(analysis.overallQuality??'good').toUpperCase()}</div>
  </div>

  <div class="summary"><p>${analysis.summary}</p></div>

  <div class="stats">
    <div class="stat sc"><div class="n">${crit}</div><div class="l">Critical</div></div>
    <div class="stat sh"><div class="n">${high}</div><div class="l">High</div></div>
    <div class="stat sm"><div class="n">${med}</div><div class="l">Medium</div></div>
    <div class="stat sl"><div class="n">${low}</div><div class="l">Low</div></div>
  </div>

  <div class="scores">
    <div class="score-card">
      <h3>🔒 Security</h3>
      <div class="score-val" style="color:${analysis.securityScore>=80?'#10b981':analysis.securityScore>=60?'#f59e0b':'#ef4444'}">${analysis.securityScore}</div>
    </div>
    <div class="score-card">
      <h3>📈 Scalability</h3>
      <div class="score-val" style="color:${analysis.scalabilityScore>=80?'#10b981':analysis.scalabilityScore>=60?'#f59e0b':'#ef4444'}">${analysis.scalabilityScore}</div>
    </div>
    <div class="score-card">
      <h3>🔧 Maintainability</h3>
      <div class="score-val" style="color:${analysis.maintainabilityScore>=80?'#10b981':analysis.maintainabilityScore>=60?'#f59e0b':'#ef4444'}">${analysis.maintainabilityScore}</div>
    </div>
  </div>

  ${analysis.issues.length>0?`
  <div class="section">
    <div class="sec-title">⚠️ Design Issues (${analysis.issues.length})</div>
    ${analysis.issues.map(i=>`
    <div class="issue ${i.severity}">
      <div class="badges">
        <span class="badge bd">${i.component}</span>
        <span class="badge b${i.severity[0]}">${i.severity.toUpperCase()}</span>
        <span class="badge bcat">${i.category}</span>
      </div>
      <div class="desc">${i.description}</div>
      <div class="impact"><strong>⚠️ Impact:</strong>${i.impact}</div>
      <div class="rec"><strong>✅ Recommendation:</strong>${i.recommendation}</div>
    </div>`).join('')}
  </div>`:'<div class="section"><p style="color:#10b981;text-align:center;padding:20px">✅ No design issues detected!</p></div>'}

  <div class="section">
    <div class="sec-title">🎨 Design Patterns</div>
    ${analysis.patterns.map(p=>`
    <div class="pattern">
      <span class="pattern-name">${p.name}</span>
      <span class="pattern-status ${p.appropriateness==='appropriate'?'p-app':p.appropriateness==='inappropriate'?'p-inapp':'p-miss'}">
        ${p.appropriateness==='appropriate'?'✅ Used Appropriately':p.appropriateness==='inappropriate'?'❌ Inappropriate':'⚠️ Missing'}
      </span>
    </div>
    ${p.suggestion?`<p style="color:#64748b;font-size:13px;margin:8px 0 16px 0;padding-left:12px;border-left:3px solid #e2e8f0">${p.suggestion}</p>`:''}`).join('')}
  </div>

  <div class="section">
    <div class="sec-title">📐 Design Principles</div>
    <div class="principles">
      <div class="principle">
        <h4>SOLID Principles</h4>
        <div class="val" style="color:${analysis.designPrinciples.solid>=80?'#10b981':analysis.designPrinciples.solid>=60?'#f59e0b':'#ef4444'}">${analysis.designPrinciples.solid}/100</div>
      </div>
      <div class="principle">
        <h4>DRY & Separation</h4>
        <div class="val" style="color:${analysis.designPrinciples.dryConcern>=80?'#10b981':analysis.designPrinciples.dryConcern>=60?'#f59e0b':'#ef4444'}">${analysis.designPrinciples.dryConcern}/100</div>
      </div>
      <div class="principle">
        <h4>Coupling</h4>
        <div class="val" style="color:${analysis.designPrinciples.coupling==='low'?'#10b981':analysis.designPrinciples.coupling==='medium'?'#f59e0b':'#ef4444'}">${analysis.designPrinciples.coupling.toUpperCase()}</div>
      </div>
      <div class="principle">
        <h4>Cohesion</h4>
        <div class="val" style="color:${analysis.designPrinciples.cohesion==='high'?'#10b981':analysis.designPrinciples.cohesion==='medium'?'#f59e0b':'#ef4444'}">${analysis.designPrinciples.cohesion.toUpperCase()}</div>
      </div>
    </div>
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

    triggerDownload(html, `fortifylens-design-report-${new Date().toISOString().split('T')[0]}.html`, 'text/html');
    toast.success('HTML report downloaded');
    setShowDownloadMenu(false);
  };

  const downloadJSON = () => {
    if (!analysis) return;
    const report = {
      meta: { 
        generatedAt: new Date().toISOString(), 
        platform: 'FortifyLens', 
        designType,
        analysisType: 'AI-Powered Design Analysis' 
      },
      overallQuality: analysis.overallQuality,
      summary: analysis.summary,
      scores: {
        security: analysis.securityScore,
        scalability: analysis.scalabilityScore,
        maintainability: analysis.maintainabilityScore,
      },
      stats: {
        total: analysis.issues.length,
        critical: analysis.issues.filter(i=>i.severity==='critical').length,
        high: analysis.issues.filter(i=>i.severity==='high').length,
        medium: analysis.issues.filter(i=>i.severity==='medium').length,
        low: analysis.issues.filter(i=>i.severity==='low').length,
      },
      issues: analysis.issues,
      patterns: analysis.patterns,
      designPrinciples: analysis.designPrinciples,
      recommendations: analysis.recommendations,
    };
    triggerDownload(JSON.stringify(report, null, 2), `fortifylens-design-report-${new Date().toISOString().split('T')[0]}.json`, 'application/json');
    toast.success('JSON report downloaded');
    setShowDownloadMenu(false);
  };

  const downloadMarkdown = () => {
    if (!analysis) return;
    const crit = analysis.issues.filter(i=>i.severity==='critical').length;
    const high = analysis.issues.filter(i=>i.severity==='high').length;
    const med = analysis.issues.filter(i=>i.severity==='medium').length;
    const low = analysis.issues.filter(i=>i.severity==='low').length;

    const md = `# 🏗️ FortifyLens — Design Analysis Report

**Generated:** ${new Date().toLocaleString()}
**Design Type:** ${designType}
**Overall Quality:** \`${(analysis.overallQuality??'good').toUpperCase()}\`

---

## Executive Summary

${analysis.summary}

---

## Quality Scores

| Metric | Score |
|--------|-------|
| 🔒 Security | ${analysis.securityScore}/100 |
| 📈 Scalability | ${analysis.scalabilityScore}/100 |
| 🔧 Maintainability | ${analysis.maintainabilityScore}/100 |

---

## Issue Statistics

| Severity | Count |
|----------|-------|
| 🔴 Critical | ${crit} |
| 🟠 High | ${high} |
| 🟡 Medium | ${med} |
| 🔵 Low | ${low} |
| **Total** | **${analysis.issues.length}** |

---

## Design Issues

${analysis.issues.length===0?'✅ No design issues detected.':analysis.issues.map((i,idx)=>`
### ${idx+1}. ${i.category} — \`${i.severity.toUpperCase()}\`

**Component:** ${i.component}
**Description:** ${i.description}
**Impact:** ${i.impact}
**Recommendation:** ${i.recommendation}
`).join('\n---\n')}

---

## Design Patterns

${analysis.patterns.map(p=>`
- **${p.name}**: ${p.appropriateness==='appropriate'?'✅ Used Appropriately':p.appropriateness==='inappropriate'?'❌ Inappropriate':'⚠️ Missing'}${p.suggestion?`\n  - ${p.suggestion}`:''}`).join('\n')}

---

## Design Principles

| Principle | Score/Level |
|-----------|-------------|
| SOLID Principles | ${analysis.designPrinciples.solid}/100 |
| DRY & Separation of Concerns | ${analysis.designPrinciples.dryConcern}/100 |
| Coupling | ${analysis.designPrinciples.coupling.toUpperCase()} |
| Cohesion | ${analysis.designPrinciples.cohesion.toUpperCase()} |

---

## Recommendations

${(analysis.recommendations??[]).map((r,i)=>`${i+1}. ${r}`).join('\n')}

---

*FortifyLens — Secure SDLC Platform | Powered by Claude AI | © ${new Date().getFullYear()}*
`;
    triggerDownload(md, `fortifylens-design-report-${new Date().toISOString().split('T')[0]}.md`, 'text/markdown');
    toast.success('Markdown report downloaded');
    setShowDownloadMenu(false);
  };

  if (loading) {
    return (
      <motion.div initial={{opacity:0}} animate={{opacity:1}} className="flex flex-col items-center justify-center py-24 space-y-6">
        <div className="relative w-20 h-20">
          <div className="absolute inset-0 rounded-full border-4 border-[#00D4FF]/20 animate-pulse" />
          <div className="absolute inset-0 rounded-full border-4 border-t-[#00D4FF] animate-spin" />
          <Layers className="absolute inset-0 m-auto w-8 h-8 text-[#00D4FF]" />
        </div>
        <div className="text-center">
          <p className="text-white font-semibold text-lg">{loadingMsg}</p>
          <p className="text-gray-400 text-sm mt-1">AI-powered design architecture analysis in progress</p>
        </div>
      </motion.div>
    );
  }

  if (!analysis) return null;

  const criticalCount = analysis.issues.filter(i=>i.severity==='critical').length;
  const highCount = analysis.issues.filter(i=>i.severity==='high').length;
  const mediumCount = analysis.issues.filter(i=>i.severity==='medium').length;
  const lowCount = analysis.issues.filter(i=>i.severity==='low').length;

  return (
    <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} className="space-y-6">

      <Card className="p-6 bg-gradient-to-r from-[#0A0E1A] to-[#0d1829] border-[#00D4FF]/30">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Layers className="w-8 h-8 text-[#00D4FF]" />
              <div>
                <h2 className="text-2xl font-bold text-white">Design Analysis Report</h2>
                <p className="text-gray-400 text-sm">FortifyLens · AI-Powered by Claude</p>
              </div>
            </div>
            <p className="text-gray-300 text-sm mt-2">Generated: {new Date().toLocaleString()} · Type: {designType}</p>
            <div className={`inline-flex items-center gap-2 mt-3 px-4 py-1.5 rounded-full border text-sm font-bold ${getQualityColor(analysis.overallQuality)}`}>
              Overall Quality: {(analysis.overallQuality??'good').toUpperCase()}
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

      <div className="grid grid-cols-3 gap-4">
        {[
          {label:'Security',score:analysis.securityScore,icon:'🔒'},
          {label:'Scalability',score:analysis.scalabilityScore,icon:'📈'},
          {label:'Maintainability',score:analysis.maintainabilityScore,icon:'🔧'},
        ].map(s=>(
          <Card key={s.label} className="p-6 bg-white/5 backdrop-blur-sm border-[#00D4FF]/20">
            <h3 className="text-sm text-gray-400 mb-3">{s.icon} {s.label}</h3>
            <p className={`text-4xl font-bold ${getScoreColor(s.score)}`}>{s.score}</p>
          </Card>
        ))}
      </div>

      {analysis.issues.length > 0 ? (
        <Card className="p-6 bg-white/5 backdrop-blur-sm border-red-500/30">
          <div className="flex items-center gap-2 mb-5">
            <XCircle className="w-5 h-5 text-red-400" />
            <h3 className="text-xl font-semibold text-white">Design Issues ({analysis.issues.length})</h3>
          </div>
          <div className="space-y-4">
            {analysis.issues.map((issue)=>(
              <motion.div key={issue.id} initial={{opacity:0,x:-10}} animate={{opacity:1,x:0}}
                className={`p-4 rounded-lg border-l-4 ${issue.severity==='critical'?'bg-red-600/5 border-red-600':issue.severity==='high'?'bg-orange-500/5 border-orange-500':issue.severity==='medium'?'bg-yellow-500/5 border-yellow-500':'bg-blue-500/5 border-blue-500'}`}
              >
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <Badge variant="outline" className="bg-[#0A0E1A] text-white border-[#00D4FF] text-xs">{issue.component}</Badge>
                  <Badge variant="outline" className={`text-xs border ${getSeverityColor(issue.severity)}`}>{issue.severity.toUpperCase()}</Badge>
                  <Badge variant="outline" className="bg-gray-700/50 text-gray-300 border-gray-600 text-xs">{issue.category}</Badge>
                </div>
                <p className="text-gray-300 text-sm mb-3">{issue.description}</p>
                <div className="bg-red-500/10 border border-red-500/30 p-3 rounded mb-2">
                  <p className="text-red-400 text-xs font-semibold mb-1">⚠️ IMPACT</p>
                  <p className="text-red-300 text-sm">{issue.impact}</p>
                </div>
                <div className="bg-green-500/10 border border-green-500/30 p-3 rounded">
                  <p className="text-green-400 text-xs font-semibold mb-1">✅ RECOMMENDATION</p>
                  <p className="text-green-300 text-sm">{issue.recommendation}</p>
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
              <h3 className="text-xl font-semibold text-white">No Design Issues Detected!</h3>
              <p className="text-gray-400 text-sm mt-1">Design passed AI architecture analysis</p>
            </div>
          </div>
        </Card>
      )}

      <Card className="p-6 bg-white/5 backdrop-blur-sm border-[#00D4FF]/20">
        <div className="flex items-center gap-2 mb-4">
          <Palette className="w-5 h-5 text-[#00D4FF]" />
          <h3 className="text-xl font-semibold text-white">Design Patterns</h3>
        </div>
        <div className="space-y-3">
          {analysis.patterns.map((pattern,i)=>(
            <div key={i} className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/10">
              <span className="text-white font-medium">{pattern.name}</span>
              <Badge className={
                pattern.appropriateness==='appropriate'?'bg-green-500/20 text-green-400':
                pattern.appropriateness==='inappropriate'?'bg-red-500/20 text-red-400':
                'bg-yellow-500/20 text-yellow-400'
              }>
                {pattern.appropriateness==='appropriate'?'✅ Used':pattern.appropriateness==='inappropriate'?'❌ Inappropriate':'⚠️ Missing'}
              </Badge>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-6 bg-white/5 backdrop-blur-sm border-[#00D4FF]/20">
        <div className="flex items-center gap-2 mb-4">
          <Layout className="w-5 h-5 text-[#00D4FF]" />
          <h3 className="text-xl font-semibold text-white">Design Principles</h3>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 bg-white/5 rounded-lg">
            <p className="text-gray-400 text-sm mb-2">SOLID Principles</p>
            <p className={`text-3xl font-bold ${getScoreColor(analysis.designPrinciples.solid)}`}>{analysis.designPrinciples.solid}/100</p>
          </div>
          <div className="p-4 bg-white/5 rounded-lg">
            <p className="text-gray-400 text-sm mb-2">DRY & Separation</p>
            <p className={`text-3xl font-bold ${getScoreColor(analysis.designPrinciples.dryConcern)}`}>{analysis.designPrinciples.dryConcern}/100</p>
          </div>
          <div className="p-4 bg-white/5 rounded-lg">
            <p className="text-gray-400 text-sm mb-2">Coupling</p>
            <p className={`text-2xl font-bold ${analysis.designPrinciples.coupling==='low'?'text-green-400':analysis.designPrinciples.coupling==='medium'?'text-yellow-400':'text-red-400'}`}>
              {analysis.designPrinciples.coupling.toUpperCase()}
            </p>
          </div>
          <div className="p-4 bg-white/5 rounded-lg">
            <p className="text-gray-400 text-sm mb-2">Cohesion</p>
            <p className={`text-2xl font-bold ${analysis.designPrinciples.cohesion==='high'?'text-green-400':analysis.designPrinciples.cohesion==='medium'?'text-yellow-400':'text-red-400'}`}>
              {analysis.designPrinciples.cohesion.toUpperCase()}
            </p>
          </div>
        </div>
      </Card>

      <Card className="p-6 bg-white/5 backdrop-blur-sm border-[#00D4FF]/20">
        <div className="flex items-center gap-2 mb-4">
          <FileText className="w-5 h-5 text-[#00D4FF]" />
          <h3 className="text-xl font-semibold text-white">Analyzed Design Document</h3>
        </div>
        <div className="bg-[#0d1117] p-4 rounded-lg border border-[#00D4FF]/10 overflow-x-auto max-h-64">
          <pre className="text-gray-300 font-mono text-sm leading-relaxed whitespace-pre-wrap">{designDocument}</pre>
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
            <h3 className="text-xl font-semibold text-white">Recommendations</h3>
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
import React, { useEffect, useState } from 'react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { FileText, Download, Calendar, TrendingUp, Shield, Building2, Loader2 } from 'lucide-react';
import { collection, onSnapshot, query, orderBy, addDoc, deleteDoc, doc, Timestamp } from 'firebase/firestore';
import { db, auth } from '../../../lib/firebase';
import { toast } from 'sonner';

const BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
async function saFetch(path: string) {
  const token = await auth.currentUser?.getIdToken() ?? '';
  const r = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

const PLAN_PRICE: Record<string, number> = { Starter: 0, Business: 99, Enterprise: 299 };

const reportTypes = [
  { id: 'executive',     name: 'Executive Summary',    desc: 'Platform KPIs, MRR, plan distribution, top risks', icon: TrendingUp, color: 'from-green-500 to-green-600' },
  { id: 'organizations', name: 'Organization Report',  desc: 'All orgs with employees, projects, scans, revenue', icon: Building2,  color: 'from-blue-500 to-blue-600' },
  { id: 'security',      name: 'Security Overview',    desc: 'Vulnerability breakdown by severity across all orgs', icon: Shield,    color: 'from-red-500 to-red-600' },
  { id: 'compliance',    name: 'Compliance Report',    desc: 'SDLC phase completion and approval rates per org', icon: FileText,   color: 'from-purple-500 to-purple-600' },
];

// ── PDF helpers ────────────────────────────────────────────────
const BG = [10, 14, 26] as const;
const CYAN = [0, 212, 255] as const;
const WHITE = [255, 255, 255] as const;
const GRAY = [130, 145, 170] as const;

async function makePDF(
  title: string,
  subtitle: string,
  data: any,
  type: string
): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210, H = 297;
  let page = 1;

  const newPage = () => {
    doc.addPage();
    doc.setFillColor(...BG); doc.rect(0, 0, W, H, 'F');
    return 20;
  };
  const footer = () => {
    doc.setFillColor(...CYAN); doc.rect(0, H - 1, W, 1, 'F');
    doc.setFontSize(7); doc.setTextColor(...GRAY);
    doc.text('FortifyLens — Confidential SuperAdmin Report', 15, H - 4);
    doc.text(`Page ${page++}`, W - 15, H - 4, { align: 'right' });
  };
  const hdr = (txt: string, y: number) => {
    doc.setTextColor(...CYAN); doc.setFontSize(11); doc.setFont('helvetica', 'bold');
    doc.text(txt, 15, y);
    doc.setFillColor(...CYAN); doc.rect(15, y + 1, W - 30, 0.4, 'F');
    return y + 9;
  };

  // Cover
  doc.setFillColor(...BG); doc.rect(0, 0, W, H, 'F');
  doc.setFillColor(...CYAN); doc.rect(0, 0, W, 2, 'F');
  doc.setTextColor(...CYAN); doc.setFontSize(9); doc.setFont('helvetica', 'bold');
  doc.text('FORTIFYLENS', 15, 22);
  doc.setTextColor(...GRAY); doc.setFontSize(7); doc.setFont('helvetica', 'normal');
  doc.text('PLATFORM SUPERADMIN REPORT', 15, 28);
  doc.setTextColor(...WHITE); doc.setFontSize(22); doc.setFont('helvetica', 'bold');
  doc.text(title, 15, 55);
  doc.setFontSize(10); doc.setFont('helvetica', 'normal');
  doc.setTextColor(...GRAY); doc.text(subtitle, 15, 63);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 15, 70);
  doc.text(`FortifyLens Platform — SuperAdmin`, 15, 76);
  footer();

  const orgs: any[] = data.orgs ?? [];

  // ── EXECUTIVE SUMMARY ─────────────────────────────────────
  if (type === 'executive') {
    let y = newPage();
    y = hdr('Platform KPIs', y);
    const kpis = [
      ['Total Organizations', orgs.length],
      ['Active Orgs', orgs.filter((o:any) => (o.status ?? 'active').toLowerCase() === 'active').length],
      ['Total Employees', orgs.reduce((s:number, o:any) => s + (o.employeeCount ?? 0), 0)],
      ['Total Projects', orgs.reduce((s:number, o:any) => s + (o.projectCount ?? 0), 0)],
      ['Total Scans Run', data.totalScans ?? 0],
      ['Open Vulnerabilities', data.openVulns ?? 0],
    ];
    kpis.forEach(([label, value], i) => {
      if (y > H - 25) { footer(); y = newPage(); }
      const even = i % 2 === 0;
      if (even) { doc.setFillColor(15, 20, 38); doc.rect(15, y - 1, W - 30, 10, 'F'); }
      doc.setTextColor(200, 210, 230); doc.setFontSize(8); doc.setFont('helvetica', 'normal');
      doc.text(String(label), 20, y + 5);
      doc.setTextColor(...WHITE); doc.setFont('helvetica', 'bold');
      doc.text(String(value), W - 25, y + 5, { align: 'right' });
      y += 10;
    });

    y += 6;
    y = hdr('Revenue by Plan', y);
    const mrr = orgs.reduce((s: number, o: any) => {
      if ((o.status ?? 'active').toLowerCase() !== 'active') return s;
      return s + (PLAN_PRICE[o.plan] ?? 0);
    }, 0);
    const planDist: Record<string, { count: number; rev: number }> = { Starter: { count: 0, rev: 0 }, Business: { count: 0, rev: 0 }, Enterprise: { count: 0, rev: 0 } };
    orgs.forEach((o: any) => { planDist[o.plan] = { count: (planDist[o.plan]?.count ?? 0) + 1, rev: (planDist[o.plan]?.rev ?? 0) + (PLAN_PRICE[o.plan] ?? 0) }; });
    ['Starter','Business','Enterprise'].forEach((plan, i) => {
      if (y > H - 20) { footer(); y = newPage(); }
      const pd = planDist[plan];
      if (i % 2 === 0) { doc.setFillColor(15, 20, 38); doc.rect(15, y - 1, W - 30, 10, 'F'); }
      doc.setTextColor(200, 210, 230); doc.setFontSize(8); doc.setFont('helvetica', 'normal');
      doc.text(`${plan} (${pd.count} orgs)`, 20, y + 5);
      doc.setTextColor(...CYAN); doc.setFont('helvetica', 'bold');
      doc.text(`$${pd.rev}/mo`, W - 25, y + 5, { align: 'right' });
      y += 10;
    });
    doc.setTextColor(34, 197, 94); doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    if (y > H - 20) { footer(); y = newPage(); }
    doc.text(`Total MRR: $${mrr}/month  |  ARR: $${mrr * 12}/year`, 15, y + 6);
    y += 14;

    y = hdr('Top Risk Organizations', y);
    orgs.sort((a: any, b: any) => (b.avgRiskScore ?? 0) - (a.avgRiskScore ?? 0)).slice(0, 8).forEach((o: any, i: number) => {
      if (y > H - 18) { footer(); y = newPage(); }
      if (i % 2 === 0) { doc.setFillColor(15, 20, 38); doc.rect(15, y - 1, W - 30, 9, 'F'); }
      doc.setTextColor(200, 210, 230); doc.setFontSize(7.5); doc.setFont('helvetica', 'normal');
      doc.text((o.name ?? '').slice(0, 30), 20, y + 4.5);
      const rs = o.avgRiskScore ?? 0;
      doc.setTextColor(rs >= 70 ? 239 : rs >= 40 ? 251 : 34, rs >= 70 ? 68 : rs >= 40 ? 146 : 197, rs >= 70 ? 68 : rs >= 40 ? 60 : 94);
      doc.text(`Risk: ${rs}/100`, W - 50, y + 4.5);
      doc.setTextColor(200, 210, 230);
      doc.text(`${o.openVulns ?? 0} open vulns`, W - 25, y + 4.5, { align: 'right' });
      y += 9;
    });
    footer();
  }

  // ── ORGANIZATION REPORT ───────────────────────────────────
  else if (type === 'organizations') {
    let y = newPage();
    y = hdr(`All Organizations (${orgs.length})`, y);
    // Table header
    doc.setFillColor(25, 35, 58); doc.rect(15, y, W - 30, 8, 'F');
    doc.setTextColor(...CYAN); doc.setFontSize(6); doc.setFont('helvetica', 'bold');
    ['ORG NAME','PLAN','STATUS','EMPLOYEES','PROJECTS','SCANS','OPEN VULNS','MRR'].forEach((h, i) => {
      doc.text(h, 17 + [0,46,65,84,102,118,138,160][i], y + 5.5);
    });
    y += 10;
    orgs.forEach((o: any, i: number) => {
      if (y > H - 18) { footer(); y = newPage(); y = hdr('Organizations (cont.)', y); }
      if (i % 2 === 0) { doc.setFillColor(15, 20, 38); doc.rect(15, y - 1, W - 30, 9, 'F'); }
      doc.setTextColor(210, 220, 235); doc.setFontSize(6.5); doc.setFont('helvetica', 'normal');
      doc.text((o.name ?? '').slice(0, 18), 17, y + 4.5);
      doc.text(o.plan ?? '—', 49, y + 4.5);
      const isActive = (o.status ?? 'active').toLowerCase() === 'active';
      doc.setTextColor(isActive ? 34 : 239, isActive ? 197 : 68, isActive ? 94 : 68);
      doc.text(isActive ? 'Active' : 'Suspended', 67, y + 4.5);
      doc.setTextColor(210, 220, 235);
      doc.text(String(o.employeeCount ?? 0), 86, y + 4.5);
      doc.text(String(o.projectCount ?? 0), 104, y + 4.5);
      doc.text(String(o.totalScans ?? 0), 120, y + 4.5);
      doc.text(String(o.openVulns ?? 0), 140, y + 4.5);
      doc.setTextColor(34, 197, 94);
      doc.text(`$${o.mrr ?? 0}`, 162, y + 4.5);
      y += 9;
    });
    doc.setTextColor(...CYAN); doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
    if (y > H - 15) { footer(); y = newPage(); }
    const totalMRR = orgs.reduce((s: number, o: any) => s + (o.mrr ?? 0), 0);
    doc.text(`Total MRR: $${totalMRR}/month`, 15, y + 6);
    footer();
  }

  // ── SECURITY OVERVIEW ─────────────────────────────────────
  else if (type === 'security') {
    let y = newPage();
    y = hdr('Vulnerability Summary (Platform-wide)', y);

    const allVulns = orgs.flatMap((o: any) => (o.projects ?? []).flatMap((p: any) => (p.vulns ?? []).map((v: any) => ({ ...v, org: o.name, project: p.name }))));
    const bySev: Record<string, number> = { Critical: 0, High: 0, Medium: 0, Low: 0 };
    allVulns.forEach((v: any) => {
      const s = v.severity?.charAt(0).toUpperCase() + v.severity?.slice(1).toLowerCase();
      if (s in bySev) bySev[s]++;
    });

    const sevColors: Record<string, [number,number,number]> = {
      Critical: [239, 68, 68], High: [249, 115, 22], Medium: [234, 179, 8], Low: [107, 114, 128],
    };
    ['Critical','High','Medium','Low'].forEach((sev, i) => {
      if (y > H - 18) { footer(); y = newPage(); }
      if (i % 2 === 0) { doc.setFillColor(15, 20, 38); doc.rect(15, y - 1, W - 30, 12, 'F'); }
      doc.setFillColor(...sevColors[sev]); doc.roundedRect(17, y + 1, 20, 9, 1.5, 1.5, 'F');
      doc.setTextColor(...WHITE); doc.setFontSize(6); doc.setFont('helvetica', 'bold');
      doc.text(sev.toUpperCase(), 27, y + 7, { align: 'center' });
      doc.setTextColor(200, 210, 230); doc.setFontSize(8); doc.setFont('helvetica', 'normal');
      doc.text(`${bySev[sev]} vulnerabilities`, 42, y + 7);
      const pct = allVulns.length > 0 ? Math.round((bySev[sev] / allVulns.length) * 100) : 0;
      doc.setFillColor(30, 40, 65); doc.rect(100, y + 3, 70, 4, 'F');
      doc.setFillColor(...sevColors[sev]); doc.rect(100, y + 3, 70 * pct / 100, 4, 'F');
      doc.setTextColor(...GRAY); doc.setFontSize(6.5);
      doc.text(`${pct}%`, W - 20, y + 7, { align: 'right' });
      y += 12;
    });

    y += 4;
    y = hdr('Top 20 Open Vulnerabilities', y);
    doc.setFillColor(25, 35, 58); doc.rect(15, y, W - 30, 8, 'F');
    doc.setTextColor(...CYAN); doc.setFontSize(6); doc.setFont('helvetica', 'bold');
    ['SEVERITY','FINDING','ORG','PROJECT','STATUS'].forEach((h, i) => {
      doc.text(h, 17 + [0, 22, 105, 140, 168][i], y + 5.5);
    });
    y += 10;
    allVulns.filter((v: any) => !v.isResolved).slice(0, 20).forEach((v: any, i: number) => {
      if (y > H - 15) { footer(); y = newPage(); }
      if (i % 2 === 0) { doc.setFillColor(15, 20, 38); doc.rect(15, y - 1, W - 30, 9, 'F'); }
      const sev = v.severity?.toLowerCase();
      const sc: [number,number,number] = sev === 'critical' ? [239,68,68] : sev === 'high' ? [249,115,22] : sev === 'medium' ? [234,179,8] : [107,114,128];
      doc.setFillColor(...sc); doc.roundedRect(17, y, 18, 6, 1, 1, 'F');
      doc.setTextColor(...WHITE); doc.setFontSize(5.5); doc.setFont('helvetica', 'bold');
      doc.text((v.severity ?? '').toUpperCase().slice(0, 5), 26, y + 4.5, { align: 'center' });
      doc.setTextColor(200, 220, 235); doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5);
      doc.text((v.title ?? '').slice(0, 40), 38, y + 4.5);
      doc.text((v.org ?? '').slice(0, 18), 107, y + 4.5);
      doc.text((v.project ?? '').slice(0, 15), 142, y + 4.5);
      doc.setTextColor(130, 145, 170);
      doc.text(v.assignedToName ? `→ ${v.assignedToName.slice(0,10)}` : 'Open', 170, y + 4.5);
      y += 9;
    });
    footer();
  }

  // ── COMPLIANCE REPORT ─────────────────────────────────────
  else if (type === 'compliance') {
    let y = newPage();
    y = hdr('SDLC Phase Completion by Organization', y);
    const PHASE_KEYS = ['requirement','design','development','sca','crossphase'];
    const PHASE_SHORT = ['Req','STRIDE','SAST','SCA','Cross'];

    // Header
    doc.setFillColor(25, 35, 58); doc.rect(15, y, W - 30, 8, 'F');
    doc.setTextColor(...CYAN); doc.setFontSize(6); doc.setFont('helvetica', 'bold');
    doc.text('ORGANIZATION', 17, y + 5.5);
    PHASE_SHORT.forEach((s, i) => doc.text(s, 85 + i * 18, y + 5.5));
    doc.text('SCORE', W - 28, y + 5.5);
    y += 10;

    orgs.forEach((o: any, oi: number) => {
      if (y > H - 18) { footer(); y = newPage(); }
      if (oi % 2 === 0) { doc.setFillColor(15, 20, 38); doc.rect(15, y - 1, W - 30, 10, 'F'); }
      doc.setTextColor(200, 210, 230); doc.setFontSize(7); doc.setFont('helvetica', 'normal');
      doc.text((o.name ?? '').slice(0, 22), 17, y + 5);

      let approved = 0;
      (o.projects ?? []).forEach((proj: any) => {
        PHASE_KEYS.forEach((pk, pi) => {
          const ph = (proj.phases ?? {})[pk];
          const st = ph?.status ?? 'not-started';
          const x = 85 + pi * 18;
          if (st === 'completed') { doc.setFillColor(34, 197, 94); approved++; }
          else if (st === 'submitted') doc.setFillColor(234, 179, 8);
          else if (st === 'needs-revision') doc.setFillColor(239, 68, 68);
          else doc.setFillColor(30, 40, 65);
          doc.circle(x + 4, y + 5, 3, 'F');
        });
      });

      const total = (o.projects ?? []).length * PHASE_KEYS.length;
      const pct = total > 0 ? Math.round((approved / total) * 100) : 0;
      const pc: [number,number,number] = pct >= 80 ? [34,197,94] : pct >= 50 ? [234,179,8] : [239,68,68];
      doc.setTextColor(...pc); doc.setFont('helvetica', 'bold');
      doc.text(`${pct}%`, W - 25, y + 5, { align: 'right' });
      y += 10;
    });

    y += 4;
    // Legend
    doc.setFontSize(6.5);
    [['Approved', [34,197,94]], ['Awaiting Review', [234,179,8]], ['Needs Revision', [239,68,68]], ['Not Started', [30,40,65]]].forEach(([label, color], i) => {
      const x = 15 + i * 48;
      doc.setFillColor(...(color as [number,number,number])); doc.circle(x + 3, y + 3, 3, 'F');
      doc.setTextColor(...GRAY); doc.text(label as string, x + 8, y + 5);
    });
    footer();
  }

  doc.save(`FortifyLens_${type}_report_${new Date().toISOString().split('T')[0]}.pdf`);
}

const ReportsSection: React.FC = () => {
  const [selectedType, setSelectedType] = useState('executive');
  const [selectedSchedule, setSelectedSchedule] = useState('none');
  const [generating, setGenerating] = useState(false);
  const [scheduledReports, setScheduledReports] = useState<any[]>([]);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'scheduledReports'), orderBy('createdAt', 'desc')),
      snap => setScheduledReports(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, []);

  const handleGenerateReport = async () => {
    setGenerating(true);
    const rt = reportTypes.find(r => r.id === selectedType)!;
    try {
      toast.info(`Fetching data for ${rt.name}…`);
      const data = await saFetch('/api/superadmin/report-data');
      await makePDF(rt.name, rt.desc, data, selectedType);
      toast.success(`${rt.name} downloaded!`);
      await addDoc(collection(db, 'reports'), {
        name: `${rt.name} — ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`,
        type: rt.name, format: 'PDF', status: 'Ready', generatedAt: Timestamp.now(),
      }).catch(() => {});
    } catch (e: any) {
      console.error(e);
      toast.error('Failed to generate report: ' + (e?.message ?? 'unknown'));
    }
    setGenerating(false);
  };

  const handleSchedule = async () => {
    if (selectedSchedule === 'none') { toast.error('Select a frequency'); return; }
    const rt = reportTypes.find(r => r.id === selectedType)!;
    const next = new Date();
    if (selectedSchedule === 'daily') next.setDate(next.getDate() + 1);
    if (selectedSchedule === 'weekly') next.setDate(next.getDate() + 7);
    if (selectedSchedule === 'monthly') next.setMonth(next.getMonth() + 1);
    try {
      await addDoc(collection(db, 'scheduledReports'), {
        type: rt.name, frequency: selectedSchedule, format: 'PDF',
        nextRun: Timestamp.fromDate(next), createdAt: Timestamp.now(), active: true,
      });
      toast.success(`${rt.name} scheduled ${selectedSchedule}`);
    } catch { toast.error('Failed to schedule'); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Reports</h1>
        <p className="text-gray-400">Generate real-data platform reports in PDF format</p>
      </div>

      <Card className="bg-white/5 backdrop-blur-xl border-[#00D4FF]/20 p-6">
        <h3 className="text-xl font-semibold text-white mb-4">Generate Report</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {reportTypes.map(r => {
            const Icon = r.icon;
            return (
              <button key={r.id} onClick={() => setSelectedType(r.id)}
                className={`p-4 rounded-lg border-2 transition-all text-left ${
                  selectedType === r.id ? 'border-[#00D4FF] bg-[#00D4FF]/10' : 'border-white/10 bg-white/5 hover:border-white/20'
                }`}>
                <div className="flex items-start space-x-3">
                  <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${r.color} flex items-center justify-center flex-shrink-0`}>
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <div><h4 className="font-semibold text-white mb-1">{r.name}</h4><p className="text-sm text-gray-400">{r.desc}</p></div>
                </div>
              </button>
            );
          })}
        </div>
        <div className="flex flex-col md:flex-row gap-4 items-end">
          <div className="flex-1">
            <label className="text-sm text-gray-400 mb-2 block">Schedule</label>
            <Select value={selectedSchedule} onValueChange={setSelectedSchedule}>
              <SelectTrigger className="bg-white/5 border-white/10 text-white"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-[#151D35] border-[#00D4FF]/20">
                <SelectItem value="none" className="text-white">One-time</SelectItem>
                <SelectItem value="daily" className="text-white">Daily</SelectItem>
                <SelectItem value="weekly" className="text-white">Weekly</SelectItem>
                <SelectItem value="monthly" className="text-white">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleGenerateReport} disabled={generating}
              className="bg-[#00D4FF] hover:bg-[#00D4FF]/80 text-white">
              {generating
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generating…</>
                : <><Download className="w-4 h-4 mr-2" />Download PDF</>}
            </Button>
            {selectedSchedule !== 'none' && (
              <Button onClick={handleSchedule} variant="outline"
                className="border-[#00D4FF]/30 text-[#00D4FF] hover:bg-[#00D4FF]/10">
                <Calendar className="w-4 h-4 mr-2" />Schedule
              </Button>
            )}
          </div>
        </div>
      </Card>

      {scheduledReports.length > 0 && (
        <Card className="bg-white/5 backdrop-blur-xl border-[#00D4FF]/20 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold text-white">Scheduled Reports</h3>
            <Badge className="bg-[#00D4FF]/20 text-[#00D4FF] border border-[#00D4FF]/30">{scheduledReports.length} Active</Badge>
          </div>
          <div className="space-y-3">
            {scheduledReports.map(r => (
              <div key={r.id} className="p-4 rounded-lg bg-white/5 border border-white/10 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Calendar className="w-6 h-6 text-[#00D4FF]" />
                  <div>
                    <p className="font-semibold text-white">{r.type}</p>
                    <p className="text-sm text-gray-400">{r.frequency} • PDF</p>
                  </div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => deleteDoc(doc(db, 'scheduledReports', r.id))}
                  className="text-red-400 hover:bg-red-500/10">Cancel</Button>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};

export default ReportsSection;
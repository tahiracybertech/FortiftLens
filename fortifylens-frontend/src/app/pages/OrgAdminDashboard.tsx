import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { api } from '../../lib/apiService';
import { generateOrgExecutiveSummaryPDF, generateFullProjectPDF, generateConsolidatedProjectPDF, type OrgReportData, type ConsolidatedProjectData } from '../../lib/reportPdfGenerator';
import {
  LayoutDashboard, Users, FolderKanban, GitBranch, UsersRound, FileText,
  Settings, LogOut, AlertTriangle, Plus, Download, Edit2, Trash2, Eye,
  Activity, Target, CreditCard, Check, X, Loader2, ChevronRight, Search, Bell
} from 'lucide-react';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '../components/ui/dialog';
import { Progress } from '../components/ui/progress';
import { Switch } from '../components/ui/switch';
import { motion } from 'motion/react';
import { PAGE_FADE } from '../../lib/motionPresets';
import {
  LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { toast } from 'sonner';
import logoImage from '../../assets/logo.png';

// ─── Firebase Service (your existing functions) ───────────────────────────────
import {
  getProjects,
  createProject,
  updateProject,
  getTeams,
  createTeam,
  updateTeam,
  getOrgMembers,
  suspendMember,
  createInvitation, // kept here only if used elsewhere — no longer used for invite creation (see handleInviteEmployee)
  logActivity,
  getOrgActivity,
} from '../../lib/firebaseService';

import type {
  Project,
  Team,
  OrgMember,
  ActivityLog,
  OrgInvitation,
  ProjectPhase,
  ProjectStatus,
} from '../../lib/firebaseService';

// ─── Additional Firestore for real-time listeners ─────────────────────────────
import {
  collection, onSnapshot, query, orderBy, doc, deleteDoc, updateDoc,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';

// ─── Component ────────────────────────────────────────────────────────────────
// ── SDLCTrackingView: per-project real phase data from Firestore ─────────────
function SDLCTrackingView({ projects, orgId, phaseLabel }: { projects: any[]; orgId: string; phaseLabel: Record<string,string> }) {
  const [selectedProjectId, setSelectedProjectId] = useState(projects[0]?.id ?? '');
  const [phases, setPhases] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedProjectId || !orgId) return;
    setLoading(true);
    import('firebase/firestore').then(({ collection, getDocs, getFirestore }) => {
      const firestoreDb = getFirestore();
      getDocs(collection(firestoreDb, 'organizations', orgId, 'projects', selectedProjectId, 'phases'))
        .then(snap => {
          const p: Record<string,any> = {};
          snap.docs.forEach(d => { p[d.id] = sanitizeDoc(d.data()); });
          setPhases(p);
        })
        .catch(() => setPhases({}))
        .finally(() => setLoading(false));
    });
  }, [selectedProjectId, orgId]);

  const PHASE_KEYS = ['requirement','design','development','sca','pipeline','crossphase'] as const;

  return (
    <div className="space-y-4">
      <Card className="p-4 bg-white/5 backdrop-blur-sm border-[#00D4FF]/20">
        <select
          value={selectedProjectId}
          onChange={e => setSelectedProjectId(e.target.value)}
          className="w-full bg-[#0A0E1A] border border-[#00D4FF]/20 text-white rounded-lg px-3 py-2 text-sm"
        >
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </Card>

      {loading ? (
        <div className="text-center py-8 text-gray-400 text-sm">Loading phase data…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {PHASE_KEYS.map(phase => {
            const pd = phases[phase];
            const status = pd?.status ?? 'not-started';
            const completion = pd?.completion ?? 0;
            const submittedBy = pd?.submittedBy ?? '';
            const approvedBy = pd?.approvedBy ?? '';
            const statusLabel = status === 'completed' ? 'Approved' : status === 'submitted' ? 'Awaiting Review' : status === 'needs-revision' ? 'Needs Revision' : 'Pending';
            const statusClass = status === 'completed' ? 'bg-green-500/20 text-green-400'
              : status === 'submitted' ? 'bg-yellow-500/20 text-yellow-400'
              : status === 'needs-revision' ? 'bg-red-500/20 text-red-400'
              : 'bg-gray-500/20 text-gray-400';
            const barColor = status === 'completed' ? 'bg-green-500' : status === 'submitted' ? 'bg-yellow-500' : 'bg-[#00D4FF]';
            return (
              <Card key={phase} className="p-4 bg-white/5 backdrop-blur-sm border-[#00D4FF]/20">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold text-white leading-tight">{phaseLabel[phase] ?? phase}</h3>
                  <Badge className={`text-xs ${statusClass}`}>{statusLabel}</Badge>
                </div>
                <div className="w-full bg-white/5 rounded-full h-2 mb-2">
                  <div className={`h-2 rounded-full ${barColor}`} style={{ width: `${completion}%` }} />
                </div>
                <p className="text-xs text-gray-400">{completion}% complete</p>
                {submittedBy && <p className="text-xs text-gray-500 mt-1 truncate">By: {submittedBy}</p>}
                {approvedBy && <p className="text-xs text-green-500 mt-0.5 truncate">✓ {approvedBy}</p>}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Firestore Timestamp sanitizer ────────────────────────────────────────────
// Prevents "Objects are not valid as React child" crash from Timestamp objects
function sanitizeDoc(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  // Firestore Timestamp → ISO string
  if (typeof obj === 'object' && !Array.isArray(obj) && 'seconds' in obj && 'nanoseconds' in obj) {
    try { return new Date(obj.seconds * 1000).toISOString(); } catch { return null; }
  }
  if (typeof obj?.toDate === 'function') {
    try { return obj.toDate().toISOString(); } catch { return null; }
  }
  // Recursively sanitize arrays
  if (Array.isArray(obj)) return obj.map(sanitizeDoc);
  // Recursively sanitize nested objects
  if (typeof obj === 'object') {
    const result: any = {};
    for (const key of Object.keys(obj)) result[key] = sanitizeDoc(obj[key]);
    return result;
  }
  return obj;
}

export default function OrgAdminDashboard() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  // ─ UI State ─
  const [activePage, setActivePage] = useState('overview');
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [showCreateProjectDialog, setShowCreateProjectDialog] = useState(false);
  const [showCreateTeamDialog, setShowCreateTeamDialog] = useState(false);
  const [showPlanChangeDialog, setShowPlanChangeDialog] = useState(false);
  const [targetPlan, setTargetPlan] = useState<{ name: string; action: string } | null>(null);
  const [currentPlan, setCurrentPlan] = useState('Business');
  const [planToggles, setPlanToggles] = useState({ Starter: true, Business: true });
  const [showTeamManageDialog, setShowTeamManageDialog] = useState(false);
  const [showTeamEditDialog, setShowTeamEditDialog] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [editTeamName, setEditTeamName] = useState('');
  const [editTeamLeadId, setEditTeamLeadId] = useState('');
  const [editTeamProjectId, setEditTeamProjectId] = useState('');
  const [editSelectedMemberIds, setEditSelectedMemberIds] = useState<string[]>([]);
  const [savingTeam, setSavingTeam] = useState(false);
  const [loadingReports, setLoadingReports] = useState(false);
  const [reportsList, setReportsList] = useState<any[]>([]);
  const [showEmployeeViewDialog, setShowEmployeeViewDialog] = useState(false);
  const [showEmployeeEditDialog, setShowEmployeeEditDialog] = useState(false);
  const [showSuspendDialog, setShowSuspendDialog] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<OrgMember | null>(null);

  // FIX 2+3: Vulnerability resolve + assign state
  const [resolvingVulnId, setResolvingVulnId] = useState<string | null>(null);
  const [assigningVulnId, setAssigningVulnId] = useState<string | null>(null);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [vulnToAssign, setVulnToAssign] = useState<any | null>(null);
  const [assignToMemberId, setAssignToMemberId] = useState('');

  // ─ Loading ─
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [creatingProject, setCreatingProject] = useState(false);
  const [creatingTeam, setCreatingTeam] = useState(false);

  // ─ Firebase Data ─
  const [projects, setProjects] = useState<Project[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [invitations, setInvitations] = useState<OrgInvitation[]>([]);

  // ─ Invite Form ─
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('developer');
  const [inviteDepartment, setInviteDepartment] = useState('engineering');

  // ─ Create Project Form ─
  const [projectName, setProjectName] = useState('');
  const [projectDesc, setProjectDesc] = useState('');
  const [projectDomain, setProjectDomain] = useState('web-application');
  const [projectTeamId, setProjectTeamId] = useState('');
  const [projectPhase, setProjectPhase] = useState<ProjectPhase>('requirement');

  // ─ Create Team Form ─
  const [teamName, setTeamName] = useState('');
  const [teamLeadId, setTeamLeadId] = useState('');
  const [teamLeadName, setTeamLeadName] = useState('');
  const [teamProjectId, setTeamProjectId] = useState('');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);

  // ─ Org Name ─
  const [orgName, setOrgName] = useState('');

  // ─ Audit Log page state ─
  const [auditLogs, setAuditLogs] = useState<ActivityLog[]>([]);
  const [loadingAuditLogs, setLoadingAuditLogs] = useState(false);
  const [auditSearch, setAuditSearch] = useState('');
  const [auditTypeFilter, setAuditTypeFilter] = useState('all');

  // ─ Global search + notifications ─
  const [globalSearch, setGlobalSearch] = useState('');
  const [showGlobalSearchResults, setShowGlobalSearchResults] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  // ─ Employees filters ─
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [employeeDeptFilter, setEmployeeDeptFilter] = useState('all');
  const [employeeStatusFilter, setEmployeeStatusFilter] = useState('all');

  // ─ Projects filters ─
  const [projectSearch, setProjectSearch] = useState('');
  const [projectPhaseFilter, setProjectPhaseFilter] = useState('all');
  const [projectSortBy, setProjectSortBy] = useState<'recent' | 'risk-desc' | 'risk-asc' | 'name'>('recent');

  // ── Project Detail Drill-Down ─────────────────────────────────────────────
  const [selectedProjectDetail, setSelectedProjectDetail] = useState<Project | null>(null);
  const [projectDetailPhases, setProjectDetailPhases] = useState<Record<string, any>>({});
  const [projectDetailVulns, setProjectDetailVulns] = useState<any[]>([]);
  const [projectDetailActivity, setProjectDetailActivity] = useState<any[]>([]);
  const [loadingProjectDetail, setLoadingProjectDetail] = useState(false);

  // ── Phase rejection reason state ─────────────────────────────
  const [rejectingPhase, setRejectingPhase] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  // Per-project vuln severity counts for project cards (loaded lazily when projects load)
  const [projectVulnStats, setProjectVulnStats] = useState<Record<string, {critical:number;high:number;medium:number;low:number}>>({});

  // Load vuln severity counts separately when projects list changes
  // Kept outside onSnapshot to avoid Firestore internal assertion errors from async callbacks
  useEffect(() => {
    if (!projects.length || !user?.orgId) return;
    const orgId = user.orgId;
    import('firebase/firestore').then(({ getDocs, collection: col }) => {
      Promise.all(projects.map(async p => {
        try {
          const vs = await getDocs(col(db, 'organizations', orgId, 'projects', p.id, 'vulnerabilities'));
          const vulns = vs.docs.map(d => sanitizeDoc(d.data()));
          return [p.id, {
            critical: vulns.filter(v => (v.severity as string)?.toLowerCase() === 'critical').length,
            high:     vulns.filter(v => (v.severity as string)?.toLowerCase() === 'high').length,
            medium:   vulns.filter(v => (v.severity as string)?.toLowerCase() === 'medium').length,
            low:      vulns.filter(v => (v.severity as string)?.toLowerCase() === 'low').length,
          }];
        } catch { return [p.id, { critical: 0, high: 0, medium: 0, low: 0 }]; }
      })).then(entries => {
        setProjectVulnStats(Object.fromEntries(entries as any[]));
      });
    });
  }, [projects, user?.orgId]);

  // ─ Chart Data — derived from real projects ─
  // SDLC Progress: group projects by createdAt month, average their progress
  const progressData = (() => {
    if (projects.length === 0) return [];
    const byMonth: Record<string, number[]> = {};
    projects.forEach(p => {
      const d = (p as any).createdAt;
      const date = d?.toDate ? d.toDate() : d ? new Date(d) : null;
      if (!date) return;
      const key = date.toLocaleString('default', { month: 'short' });
      if (!byMonth[key]) byMonth[key] = [];
      byMonth[key].push(p.progress ?? 0);
    });
    return Object.entries(byMonth).map(([month, vals]) => ({
      month,
      completion: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length),
    }));
  })();

  // Vulnerability Breakdown: sum riskScore buckets across projects
  const vulnerabilityData = (() => {
    const critical = projects.filter(p => (p.riskScore ?? 0) >= 80).length;
    const high     = projects.filter(p => (p.riskScore ?? 0) >= 60 && (p.riskScore ?? 0) < 80).length;
    const medium   = projects.filter(p => (p.riskScore ?? 0) >= 40 && (p.riskScore ?? 0) < 60).length;
    const low      = projects.filter(p => (p.riskScore ?? 0) < 40).length;
    return [
      { name: 'Critical', value: critical, color: '#EF4444' },
      { name: 'High',     value: high,     color: '#F59E0B' },
      { name: 'Medium',   value: medium,   color: '#FBBF24' },
      { name: 'Low',      value: low,      color: '#10B981' },
    ].filter(d => d.value > 0);
  })();

  // Top 5 riskiest projects — ranked by riskScore descending, for the at-a-glance Overview widget
  const topRiskyProjects = [...projects]
    .sort((a, b) => (b.riskScore ?? 0) - (a.riskScore ?? 0))
    .slice(0, 5);

  // Org-wide average risk trend by month (mirrors progressData's grouping but tracks risk, not completion)
  const riskTrendData = (() => {
    if (projects.length === 0) return [];
    const byMonth: Record<string, number[]> = {};
    projects.forEach(p => {
      const d = (p as any).createdAt;
      const date = d?.toDate ? d.toDate() : d ? new Date(d) : null;
      if (!date) return;
      const key = date.toLocaleString('default', { month: 'short' });
      if (!byMonth[key]) byMonth[key] = [];
      byMonth[key].push(p.riskScore ?? 0);
    });
    return Object.entries(byMonth).map(([month, vals]) => ({
      month,
      avgRisk: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length),
    }));
  })();

  const orgAvgRisk = projects.length > 0
    ? Math.round(projects.reduce((sum, p) => sum + (p.riskScore ?? 0), 0) / projects.length)
    : 0;
  const criticalFindingsCount = projects.filter(p => (p.riskScore ?? 0) >= 80).length;

  // ─────────────────────────────────────────────────────────────────────────────
  // Load data on mount — using your exact Firestore subcollection paths:
  // organizations/{orgId}/projects
  // organizations/{orgId}/teams
  // organizations/{orgId}/members
  // ─────────────────────────────────────────────────────────────────────────────
  // Load current plan from Firestore on mount
  useEffect(() => {
    if (!user?.orgId) return;
    const loadPlan = async () => {
      try {
        const { getDoc, doc: fbDoc } = await import('firebase/firestore');
        const orgSnap = await getDoc(fbDoc(db, 'organizations', user.orgId!));
        if (orgSnap.exists()) {
          const data = sanitizeDoc(orgSnap.data());
          if (data.currentPlan) setCurrentPlan(data.currentPlan);
          if (data.name) setOrgName(data.name);
        }
      } catch (e) {
        console.warn('Could not load org data:', e);
      }
    };
    loadPlan();
  }, [user?.orgId]);

  useEffect(() => {
    // Wait until both user and orgId are available AND user is org_admin
    // Firing before auth is complete causes Firestore permission errors
    if (!user?.orgId || !user?.uid) return;
    if (user?.role && user.role !== 'org_admin' && user.role !== 'admin') {
      console.warn('[OrgAdminDashboard] User role is not org_admin — skipping listeners');
      setLoadingProjects(false);
      setLoadingTeams(false);
      setLoadingMembers(false);
      return;
    }

    const orgId = user.orgId;

    // Real-time listener for projects: organizations/{orgId}/projects
    const projectsRef = collection(db, 'organizations', orgId, 'projects');
    const projectsQ = query(projectsRef, orderBy('createdAt', 'desc'));
    const unsubProjects = onSnapshot(projectsQ, (snap) => {
      const loadedProjects = snap.docs.map(d => ({ ...sanitizeDoc(d.data()), id: d.id } as Project));
      setProjects(loadedProjects);
      setLoadingProjects(false);
    }, (err) => {
      console.error('Projects listener error:', err);
      setLoadingProjects(false);
      setProjects([]);
    });

    // Fetch teams via backend API (Admin SDK — bypasses Firestore client rules)
    const loadTeams = () => {
      api.teams.getAll()
        .then((r: any) => { setTeams(r.teams ?? []); setLoadingTeams(false); })
        .catch(err => { console.error('Teams fetch error:', err); setLoadingTeams(false); setTeams([]); });
    };
    loadTeams();

    // Fetch members once: organizations/{orgId}/members
    getOrgMembers(orgId)
      .then(setMembers)
      .catch(err => {
        console.error('Members fetch error:', err);
        setMembers([]);
      })
      .finally(() => setLoadingMembers(false));

    // Fetch pending/expired invitations for the Employees page (backend route —
    // Firestore rules now deny direct client reads on this subcollection)
    api.invitations.getAll()
      .then((r: any) => setInvitations(r.invitations ?? []))
      .catch(err => { console.error('Invitations fetch error:', err); setInvitations([]); });

    // FIX 1: Real-time activity logs via onSnapshot — was one-time fetch before.
    // Now bell icon updates automatically whenever new activity is logged.
    const activityQ = query(
      collection(db, 'activityLogs'),
      orderBy('createdAt', 'desc'),
    );
    const unsubActivity = onSnapshot(activityQ, (snap) => {
      // Filter to this org only — activityLogs collection is platform-wide
      const logs = snap.docs
        .map(d => ({ id: d.id, ...sanitizeDoc(d.data()) } as any))
        .filter((l: any) => !l.orgId || l.orgId === orgId)
        .slice(0, 20);
      setActivityLogs(logs);
    }, (err) => {
      console.error('Activity listener error:', err);
    });

    return () => {
      unsubProjects();
      unsubActivity();
    };
  }, [user?.orgId, user?.uid, user?.role]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Handlers
  // ─────────────────────────────────────────────────────────────────────────────

  // ── FIX 2: Resolve vulnerability ──────────────────────────────────────────
  const handleResolveVuln = async (vuln: any) => {
    if (!user?.orgId || !selectedProjectDetail?.id) return;
    setResolvingVulnId(vuln.id);
    try {
      await updateDoc(
        doc(db, 'organizations', user.orgId, 'projects', selectedProjectDetail.id, 'vulnerabilities', vuln.id),
        { isResolved: true, resolvedAt: new Date().toISOString(), resolvedBy: user.email }
      );
      // Update local state immediately — onSnapshot will also update
      setProjectDetailVulns(prev => prev.map(v => v.id === vuln.id ? { ...v, isResolved: true } : v));
      await logActivity({
        orgId:    user.orgId,
        userId:   user.uid,
        userName: user.email,
        action:   `Resolved vulnerability: ${vuln.title || vuln.description?.slice(0, 50)}`,
        type:     'success',
      });
      toast.success('Vulnerability marked as resolved');
    } catch (err) {
      console.error('Resolve vuln error:', err);
      toast.error('Failed to resolve vulnerability');
    }
    setResolvingVulnId(null);
  };

  // ── FIX 3: Assign vulnerability to employee ────────────────────────────────
  const handleOpenAssignDialog = (vuln: any) => {
    setVulnToAssign(vuln);
    setAssignToMemberId('');
    setShowAssignDialog(true);
  };

  const handleAssignVuln = async () => {
    if (!user?.orgId || !selectedProjectDetail?.id || !vulnToAssign || !assignToMemberId) return;
    setAssigningVulnId(vulnToAssign.id);
    try {
      // assignToMemberId is now the userId (fixed in select below)
      const assignedMember = members.find(m => m.userId === assignToMemberId);
      const assignedName = assignedMember?.fullName || assignedMember?.email || assignToMemberId;

      // Use backend endpoint so notification is sent to employee
      const { auth: fa } = await import('../../lib/firebase');
      const token = await fa.currentUser?.getIdToken() ?? '';
      const BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
      const r = await fetch(`${BASE}/api/analysis/assign-vulnerability`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          projectId: selectedProjectDetail.id,
          vulnId:    vulnToAssign.id,
          assignToUid: assignToMemberId,
          note: `Assigned by ${user.email}`,
        }),
      });
      if (!r.ok) throw new Error((await r.json()).error || 'Failed');

      setProjectDetailVulns(prev => prev.map(v =>
        v.id === vulnToAssign.id
          ? { ...v, assignedTo: assignToMemberId, assignedToName: assignedName }
          : v
      ));
      toast.success(`Assigned to ${assignedName}`);
      setShowAssignDialog(false);
      setVulnToAssign(null);
    } catch (err) {
      console.error('Assign vuln error:', err);
      toast.error('Failed to assign vulnerability');
    }
    setAssigningVulnId(null);
  };

  const handleLogout = async () => {
    await logout();
    toast.success('Logged out successfully');
    navigate('/');
  };

  const handleInviteEmployee = async () => {
    if (!inviteEmail || !user?.orgId) return;
    try {
      // Secure path: backend generates the crypto-random code, persists it,
      // and writes the activity log entry — none of that happens client-side
      // anymore. See routes/invitations.js. Firestore rules now deny direct
      // client read/write on organizations/{orgId}/invitations entirely.
      const result = await api.invitations.create({
        email: inviteEmail,
        role: inviteRole,
        department: inviteDepartment,
      });
      const inviteCode = result.inviteCode;

      // Send email via EmailJS (still client-side — only the code generation
      // and storage moved server-side, not the email delivery itself)
      const emailjs = await import('@emailjs/browser');
      await emailjs.send(
        'service_aa48gxj',
        'template_8p7vbfg',
        {
          to_email: inviteEmail,
          org_name: user?.fullName || 'Your Organization',
          invite_code: inviteCode,
          role: inviteRole,
        },
        { publicKey: 'Wt6O-c6C9m5nvDuwT' }
      );

      toast.success(`Invitation sent to ${inviteEmail}`);
      setInviteEmail('');
      setShowInviteDialog(false);
      api.invitations.getAll().then((r: any) => setInvitations(r.invitations ?? [])).catch(() => {});
    } catch (err) {
      console.error('Invite error:', err);
      toast.error('Failed to send invitation.');
    }
  };

  // Saves to: organizations/{orgId}/projects  (your existing createProject function)
  const handleCreateProject = async () => {
    if (!projectName.trim() || !user?.orgId) {
      toast.error('Please enter a project name');
      return;
    }
    setCreatingProject(true);
    try {
      const selectedTeam = teams.find(t => t.id === projectTeamId);

      // Normalize "none" sentinel value — Firestore rejects undefined fields
      const resolvedTeamId = (projectTeamId && projectTeamId !== 'none') ? projectTeamId : null;

      await createProject(user.orgId, {
        orgId: user.orgId,
        createdBy: user.uid,
        name: projectName.trim(),
        description: projectDesc.trim() || 'Security assessment project',
        domain: projectDomain,
        currentPhase: projectPhase,
        status: 'in-progress',
        progress: 0,
        riskScore: 0,
        ...(resolvedTeamId ? { teamId: resolvedTeamId } : {}),
      });

      // If team was selected, link the project back to the team
      if (resolvedTeamId && selectedTeam) {
        await updateTeam(user.orgId, resolvedTeamId, {
          projectId: resolvedTeamId,
          projectName: projectName.trim(),
        });
      }

      await logActivity({
        orgId: user.orgId,
        userId: user.uid,
        userName: user.fullName || user.email,
        action: `Created project "${projectName.trim()}"`,
        type: 'success',
      });

      toast.success(`Project "${projectName}" created and saved!`);
      setProjectName('');
      setProjectDesc('');
      setProjectDomain('web-application');
      setProjectTeamId('');
      setProjectPhase('requirement');
      setShowCreateProjectDialog(false);
    } catch (err) {
      console.error('Create project error:', err);
      toast.error('Failed to create project. Check console for details.');
    } finally {
      setCreatingProject(false);
    }
  };

  // Saves to: organizations/{orgId}/teams  (your existing createTeam function)
  const handleCreateTeam = async () => {
    console.log('[CreateTeam] Starting — orgId:', user?.orgId, 'teamName:', teamName.trim());
    if (!teamName.trim() || !user?.orgId) {
      toast.error('Please enter a team name');
      console.log('[CreateTeam] Blocked — missing teamName or orgId');
      return;
    }
    setCreatingTeam(true);
    try {
      const leadMember = members.find(m => m.userId === teamLeadId);
      const linkedProject = projects.find(p => p.id === teamProjectId);
      const totalMembers = selectedMemberIds.length + (teamLeadId ? 1 : 0);
      const resolvedProjectId = (teamProjectId && teamProjectId !== 'none') ? teamProjectId : null;
      const resolvedLeadId = (teamLeadId && teamLeadId !== 'none') ? teamLeadId : null;
      const finalMemberIds = [resolvedLeadId, ...selectedMemberIds]
        .filter((id): id is string => !!id && id !== 'none');

      console.log('[CreateTeam] Calling createTeam via backend API with orgId:', user.orgId);
      const response = await api.teams.create({
        name: teamName.trim(),
        leadUserId: resolvedLeadId || '',
        leadName: leadMember?.fullName || 'Unassigned',
        projectId: resolvedProjectId || undefined,
        projectName: linkedProject?.name || undefined,
      });
      const teamId = response.teamId;
      console.log('[CreateTeam] Team created with ID:', teamId);

      // Link team back to the project
      if (resolvedProjectId && linkedProject) {
        await updateProject(user.orgId, resolvedProjectId, { teamId });
      }

      // Update memberIds via backend API (Admin SDK bypasses Firestore rules)
      await api.teams.update(teamId, { memberIds: finalMemberIds, memberCount: finalMemberIds.length });

      await logActivity({
        orgId: user.orgId,
        userId: user.uid,
        userName: user.fullName || user.email,
        action: `Created team "${teamName.trim()}"`,
        type: 'success',
      });

      toast.success(`Team "${teamName}" created and saved!`);
      setTeamName('');
      setTeamLeadId('');
      setTeamLeadName('');
      setTeamProjectId('');
      setSelectedMemberIds([]);
      setShowCreateTeamDialog(false);
      // Reload teams via backend API
      api.teams.getAll().then((r: any) => setTeams(r.teams ?? [])).catch(console.error);
    } catch (err: any) {
      console.error('[CreateTeam] FULL ERROR:', err);
      console.error('[CreateTeam] Error code:', err?.code);
      console.error('[CreateTeam] Error message:', err?.message);
      toast.error(`Failed to create team: ${err?.message || err?.code || 'unknown error'}`);
    } finally {
      setCreatingTeam(false);
    }
  };

  // ─ Team Manage/Edit Handlers ────────────────────────────────────────────────

  const handleManageTeam = (team: Team) => {
    setSelectedTeam(team);
    setShowTeamManageDialog(true);
  };

  const handleEditTeam = (team: Team) => {
    setSelectedTeam(team);
    setEditTeamName(team.name);
    setEditTeamLeadId(team.leadUserId || '');
    setEditTeamProjectId(team.projectId || 'none');
    // memberIds may be corrupted (stored as object not array) — always ensure array of strings
    const rawIds = (team as any).memberIds;
    const existingIds: string[] = Array.isArray(rawIds)
      ? rawIds.filter((id: any) => typeof id === 'string' && id && id !== 'none')
      : [];
    setEditSelectedMemberIds(existingIds.filter(id => id !== team.leadUserId));
    setShowTeamEditDialog(true);
  };

  const handleSaveTeamEdit = async () => {
    if (!selectedTeam || !user?.orgId || !editTeamName.trim()) {
      toast.error('Team name is required');
      return;
    }
    setSavingTeam(true);
    try {
      const leadMember = members.find(m => m.userId === editTeamLeadId);
      const resolvedProjectId = (editTeamProjectId && editTeamProjectId !== 'none') ? editTeamProjectId : null;
      const linkedProject = projects.find(p => p.id === resolvedProjectId);

      // Build final memberIds: lead + all selected non-lead members
      // Filter out 'none' sentinel (truthy string but not a real uid) and empty strings
      const resolvedLeadId = (editTeamLeadId && editTeamLeadId !== 'none') ? editTeamLeadId : null;
      const newMemberIds = [resolvedLeadId, ...editSelectedMemberIds]
        .filter((id): id is string => !!id && id !== 'none');

      // All updates via backend API (Admin SDK — bypasses Firestore rules)
      await api.teams.update(selectedTeam.id, {
        name: editTeamName.trim(),
        leadUserId: resolvedLeadId || '',
        leadName: leadMember?.fullName || (resolvedLeadId ? selectedTeam.leadName : 'Unassigned'),
        memberCount: newMemberIds.length,
        memberIds: newMemberIds,
        ...(resolvedProjectId ? { projectId: resolvedProjectId, projectName: linkedProject?.name || '' } : {}),
      });

      // If project changed, update the project doc too
      if (resolvedProjectId && resolvedProjectId !== selectedTeam.projectId) {
        await updateProject(user.orgId, resolvedProjectId, { teamId: selectedTeam.id });
      }

      await logActivity({
        orgId: user.orgId,
        userId: user.uid,
        userName: user.fullName || user.email,
        action: `Updated team "${editTeamName.trim()}"`,
        type: 'success',
      });

      toast.success(`Team "${editTeamName}" updated`);
      setShowTeamEditDialog(false);
      setSelectedTeam(null);
      // Reload teams via backend API
      api.teams.getAll().then((r: any) => setTeams(r.teams ?? [])).catch(console.error);
    } catch (err) {
      console.error('Edit team error:', err);
      toast.error('Failed to update team');
    } finally {
      setSavingTeam(false);
    }
  };

  // ─ Reports Loader — loads real analysis data from Firestore ──────────────────

  const loadReports = async () => {
    if (!user?.orgId) return;
    setLoadingReports(true);
    try {
      const { getDocs, collection, query, orderBy: fbOrderBy, where } = await import('firebase/firestore');
      const reports: any[] = [];

      // Load vulnerabilities from all projects
      for (const project of projects) {
        try {
          const vulnsSnap = await getDocs(
            query(
              collection(db, 'organizations', user.orgId, 'projects', project.id, 'vulnerabilities'),
              fbOrderBy('createdAt', 'desc')
            )
          );
          const vulns = vulnsSnap.docs.map(d => sanitizeDoc({ id: d.id, ...sanitizeDoc(d.data()) }));

          // Load phases
          const phasesSnap = await getDocs(
            collection(db, 'organizations', user.orgId, 'projects', project.id, 'phases')
          );
          // FIX: previously stored as a plain array (`phasesSnap.docs.map(...)`), which is
          // where the "SDLC Phase Status" section in the downloaded report showed duplicate/
          // mismatched rows (e.g. two "Design" rows, a "Development" row that isn't a real
          // phase name in this UI). Keying by doc id both de-dupes and guarantees each phase
          // shows its own real data instead of whatever order Firestore happened to return.
          const phasesMap: Record<string, any> = {};
          phasesSnap.docs.forEach(d => {
            const s = sanitizeDoc(d.data());
            try { phasesMap[d.id] = JSON.parse(JSON.stringify(s)); } catch { phasesMap[d.id] = s; }
          });

          if (vulns.length > 0 || Object.keys(phasesMap).length > 0) {
            reports.push({
              projectId: project.id,
              projectName: project.name,
              domain: project.domain,
              riskScore: project.riskScore,
              status: project.status,
              currentPhase: project.currentPhase,
              vulnerabilities: vulns,
              phases: phasesMap,
              generatedAt: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
            });
          }
        } catch (e) {
          console.warn('Could not load vulns for project', project.id, e);
        }
      }

      setReportsList(reports);
    } catch (err) {
      console.error('Load reports error:', err);
      toast.error('Failed to load reports');
    } finally {
      setLoadingReports(false);
    }
  };

  const [generatingOrgReport, setGeneratingOrgReport] = useState(false);

  const handleDownloadOrgReport = async () => {
    if (!user?.orgId || projects.length === 0) {
      toast.error('No project data available to generate report');
      return;
    }
    setGeneratingOrgReport(true);
    try {
      const reportData: OrgReportData = {
        orgName:          orgName || 'Organization',
        reportDate:       new Date().toLocaleDateString('en-US', { day: '2-digit', month: 'long', year: 'numeric' }),
        totalProjects:    projects.length,
        avgRisk:          projects.length > 0
                            ? Math.round(projects.reduce((s, p) => s + (p.riskScore ?? 0), 0) / projects.length)
                            : 0,
        criticalProjects: projects.filter(p => (p.riskScore ?? 0) >= 70).length,
        totalEmployees:   members.length,
        projects:         projects.map(p => ({
          name:             p.name,
          domain:           p.domain || 'web-application',
          status:           p.status || 'in-progress',
          progress:         p.progress ?? 0,
          riskScore:        p.riskScore ?? 0,
          currentPhase:     p.currentPhase || 'requirement',
          teamName:         teams.find(t => t.projectId === p.id)?.name,
        })),
        topRiskyProjects: [...projects]
          .sort((a, b) => (b.riskScore ?? 0) - (a.riskScore ?? 0))
          .slice(0, 5)
          .map(p => ({
            name:         p.name,
            domain:       p.domain || 'web-application',
            status:       p.status || 'in-progress',
            progress:     p.progress ?? 0,
            riskScore:    p.riskScore ?? 0,
            currentPhase: p.currentPhase || 'requirement',
            teamName:     teams.find(t => t.projectId === p.id)?.name,
          })),
      };
      await generateOrgExecutiveSummaryPDF(reportData);
      toast.success('Executive Summary downloaded!');
    } catch (err) {
      console.error('Org report error:', err);
      toast.error('Failed to generate report');
    } finally {
      setGeneratingOrgReport(false);
    }
  };

  // FIX: this used to build a bare-bones HTML file with just the vulnerabilities list and a
  // "SDLC Phase Status" table (source of the wrong/duplicate phase names you saw). The system
  // already has a proper multi-phase PDF generator (generateFullProjectPDF, the same one
  // used for the "Full Report" button elsewhere) — this now feeds it the org's real per-phase
  // analysis data pulled from Firestore, so org admins get the *complete* project report
  // (Requirements + Threat Model + Code Review + Dependency Scan + Cross-Phase), not a
  // single-phase snapshot.
  const [generatingConsolidatedReport, setGeneratingConsolidatedReport] = useState<string | null>(null);

  const handleDownloadConsolidatedReport = async (project: Project) => {
    if (!user?.orgId) return;
    setGeneratingConsolidatedReport(project.id);
    try {
      const orgId = user.orgId;
      const { getDocs, collection: col, query: q, orderBy: ob, limit: lim } = await import('firebase/firestore');

      // Fetch phases with full analysisData
      const phasesSnap = await getDocs(col(db, 'organizations', orgId, 'projects', project.id, 'phases'));
      const phases: ConsolidatedProjectData['phases'] = {};
      phasesSnap.docs.forEach(d => {
        const pd = sanitizeDoc(d.data());
        phases[d.id] = {
          status:          pd.status,
          completion:      pd.completion ?? 0,
          submittedBy:     pd.submittedBy ?? undefined,
          approvedBy:      pd.approvedBy ?? undefined,
          rejectionReason: pd.rejectionReason ?? undefined,
          result:          pd.analysisData?.result ?? undefined,
        };
      });

      // Fetch vulnerabilities
      const vulnsSnap = await getDocs(q(
        col(db, 'organizations', orgId, 'projects', project.id, 'vulnerabilities'),
        ob('createdAt', 'desc'), lim(50)
      ));
      const vulns = vulnsSnap.docs.map(d => sanitizeDoc({ id: d.id, ...sanitizeDoc(d.data()) }));

      // Get team + members
      const linkedTeam = teams.find(t => t.projectId === project.id);
      const teamMembers = linkedTeam
        ? members.filter(m => ((linkedTeam as any).memberIds ?? []).includes(m.userId) || m.userId === linkedTeam.leadUserId)
            .map(m => ({ name: m.fullName || m.email, email: m.email, role: m.userId === linkedTeam.leadUserId ? 'Team Lead' : 'Member' }))
        : [];

      const reportData: ConsolidatedProjectData = {
        projectName:  project.name,
        domain:       project.domain || 'web-application',
        status:       project.status || 'in-progress',
        progress:     project.progress ?? 0,
        riskScore:    project.riskScore ?? 0,
        teamName:     linkedTeam?.name,
        teamMembers,
        phases,
        vulnerabilities: vulns as any,
        generatedAt:  new Date().toLocaleDateString('en-US', { day: '2-digit', month: 'long', year: 'numeric' }),
      };

      await generateConsolidatedProjectPDF(reportData);
      toast.success(`Consolidated report for "${project.name}" downloaded!`);
    } catch (err) {
      console.error('Consolidated report error:', err);
      toast.error('Failed to generate consolidated report');
    } finally {
      setGeneratingConsolidatedReport(null);
    }
  };

  const downloadReport = async (report: any) => {
    const phases = report.phases || {};
    const allVulns = report.vulnerabilities || [];

    // Build vulns per phase from the vulnerabilities subcollection (same source as the card)
    const vulnsByPhase: Record<string, any[]> = {};
    allVulns.forEach((v: any) => {
      const phase = v.phase ?? 'unknown';
      if (!vulnsByPhase[phase]) vulnsByPhase[phase] = [];
      vulnsByPhase[phase].push(v);
    });

    // Merge phase analysisData with real vuln counts
    const reqResult = phases.requirement?.analysisData?.result ?? null;
    if (reqResult && vulnsByPhase.requirement) {
      reqResult.findings = vulnsByPhase.requirement.map((v: any) => ({
        severity: v.severity, issue: v.title ?? v.description, recommendation: v.recommendation ?? '',
      }));
    }
    const threatResult = phases.design?.analysisData?.result ?? null;
    if (threatResult && vulnsByPhase.design) {
      threatResult.threats = vulnsByPhase.design.map((v: any) => ({
        severity: v.severity, description: v.title ?? v.description,
        category: 'STRIDE', component: '', mitigation: v.recommendation ?? '',
      }));
    }
    const codeResult = phases.development?.analysisData?.result
      ?? phases.development?.analysisData ?? null;
    if (codeResult && vulnsByPhase.development) {
      codeResult.vulnerabilities = vulnsByPhase.development.map((v: any) => ({
        severity: v.severity, type: v.title ?? v.description,
        description: v.description ?? '', fix: v.recommendation ?? '',
      }));
    }

    try {
      await generateFullProjectPDF(report.projectName, {
        requirementResult: reqResult,
        threatResult,
        codeResult,
        depScanResult: phases.sca?.analysisData ?? null,
        pipelineResult: phases.pipeline?.analysisData ?? null,
        crossPhaseResult: phases.crossphase?.analysisData?.result ?? null,
        codeLanguage: phases.development?.analysisData?.language,
        depFileName: phases.sca?.analysisData?.filename ?? 'dependencies',
        pipelineFilename: phases.pipeline?.analysisData?.filename ?? 'pipeline config',
      });
      toast.success(`Full report downloaded for "${report.projectName}"`);
    } catch (err) {
      console.error('Report generation error:', err);
      toast.error('Failed to generate report');
    }
  };

  const downloadAllReports = async () => {
    if (reportsList.length === 0) {
      toast.error('No reports available. Run analysis on your projects first.');
      return;
    }
    for (const r of reportsList) {
      await downloadReport(r);
    }
  };

  const handleDeleteProject = async (projectId: string, name: string) => {
    if (!user?.orgId) return;
    try {
      await deleteDoc(doc(db, 'organizations', user.orgId, 'projects', projectId));
      toast.success(`Project "${name}" deleted`);
    } catch {
      toast.error('Failed to delete project');
    }
  };

  const handleViewProjectDetails = async (project: Project) => {
    if (!user?.orgId) return;
    setSelectedProjectDetail(project);
    setLoadingProjectDetail(true);
    setProjectDetailPhases({});
    setProjectDetailVulns([]);
    setProjectDetailActivity([]);
    try {
      const orgId = user.orgId;
      const { getDocs, collection: col, query: q, orderBy: ob, limit: lim } = await import('firebase/firestore');

      // Fetch phases
      const phasesSnap = await getDocs(col(db, 'organizations', orgId, 'projects', project.id, 'phases'));
      const phases: Record<string, any> = {};
      phasesSnap.docs.forEach(d => {
        const raw = d.data();
        // Deep sanitize: first convert Timestamps via sanitizeDoc, then
        // JSON round-trip to catch any remaining non-serializable objects
        const sanitized = sanitizeDoc(raw);
        try {
          phases[d.id] = JSON.parse(JSON.stringify(sanitized));
        } catch {
          phases[d.id] = sanitized;
        }
      });
      console.log('[ViewDetails] phases fetched:', JSON.stringify(Object.keys(phases)), 'requirement analysisData:', !!phases['requirement']?.analysisData);
      setProjectDetailPhases(phases);

      // Fetch vulnerabilities
      const vulnsSnap = await getDocs(q(
        col(db, 'organizations', orgId, 'projects', project.id, 'vulnerabilities'),
        ob('createdAt', 'desc'),
        lim(50)
      ));
      setProjectDetailVulns(vulnsSnap.docs.map(d => sanitizeDoc({ id: d.id, ...sanitizeDoc(d.data()) })));

      // Fetch project-specific activity via backend (uses Admin SDK, ordered query)
      try {
        const { auth: fbAuth } = await import('../../lib/firebase');
        const token = await fbAuth.currentUser?.getIdToken() ?? '';
        const BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
        const activityRes = await fetch(`${BASE}/api/teams/project-activity/${project.id}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        const activityResult = await activityRes.json();
        setProjectDetailActivity(activityResult.activity ?? []);
      } catch {
        // Fallback: use pre-loaded auditLogs filtered by project name
        const allLogs: any[] = auditLogs.length > 0 ? auditLogs : activityLogs;
        const projectLogs = allLogs
          .filter((log: any) => log.orgId === user.orgId && log.action?.toLowerCase().includes(project.name.toLowerCase()));
        setProjectDetailActivity(projectLogs.slice(0, 20));
      }
    } catch (err) {
      console.error('Project detail fetch error:', err);
    } finally {
      setLoadingProjectDetail(false);
    }
  };

  const handleDeleteTeam = async (teamId: string, name: string) => {
    if (!user?.orgId) return;
    try {
      await deleteDoc(doc(db, 'organizations', user.orgId, 'teams', teamId));
      toast.success(`Team "${name}" deleted`);
    } catch {
      toast.error('Failed to delete team');
    }
  };

  const handleSuspendEmployee = (member: OrgMember) => {
    setSelectedEmployee(member);
    setShowSuspendDialog(true);
  };

  const confirmSuspend = async () => {
    if (!selectedEmployee || !user?.orgId) return;
    try {
      const memberId = selectedEmployee.userId ?? selectedEmployee.id;
      // 1. Update member status to suspended
      await updateDoc(
        doc(db, 'organizations', user.orgId, 'members', memberId),
        { status: 'suspended' }
      );
      // 2. Remove from all teams so projects no longer show for this employee
      const teamsSnap = await import('firebase/firestore').then(({ getDocs, collection: col }) =>
        getDocs(col(db, 'organizations', user.orgId!, 'teams'))
      );
      const { getDocs: _g, collection: _c, ...firestoreRest } = await import('firebase/firestore');
      for (const teamDoc of teamsSnap.docs) {
        const memberIds: string[] = teamDoc.data().memberIds ?? [];
        if (memberIds.includes(memberId)) {
          await updateDoc(
            doc(db, 'organizations', user.orgId, 'teams', teamDoc.id),
            { memberIds: memberIds.filter(id => id !== memberId) }
          );
        }
      }
      setMembers(prev => prev.map(m =>
        (m.userId ?? m.id) === memberId ? { ...m, status: 'suspended' } : m
      ));
      toast.success(`${selectedEmployee.fullName} has been suspended and removed from teams`);
    } catch (err) {
      console.error(err);
      toast.error('Failed to suspend member');
    }
    setShowSuspendDialog(false);
    setSelectedEmployee(null);
  };

  const handlePlanChange = (planName: string, action: string) => {
    setTargetPlan({ name: planName, action });
    setShowPlanChangeDialog(true);
  };

  const confirmPlanChange = async () => {
    if (!targetPlan || !user?.orgId) return;
    try {
      const { updateDoc, doc: fbDoc } = await import('firebase/firestore');
      await updateDoc(fbDoc(db, 'organizations', user.orgId), {
        currentPlan: targetPlan.name,
      });
      setCurrentPlan(targetPlan.name);
      await logActivity({
        orgId: user.orgId,
        userId: user.uid,
        userName: user.fullName || user.email,
        action: `${targetPlan.action === 'upgrade' ? 'Upgraded' : 'Downgraded'} subscription to ${targetPlan.name} plan`,
        type: 'success',
      });
      toast.success(`Successfully ${targetPlan.action === 'upgrade' ? 'upgraded' : 'downgraded'} to ${targetPlan.name} plan`);
    } catch (err) {
      console.error('Plan change error:', err);
      toast.error('Failed to update plan. Please try again.');
    }
    setShowPlanChangeDialog(false);
    setTargetPlan(null);
  };

  // ─ Helpers ──────────────────────────────────────────────────────────────────
  const getRiskColor = (score: number) => {
    if (score >= 80) return 'bg-red-500/20 text-red-400 border-red-500/30';
    if (score >= 60) return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
    if (score >= 40) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    return 'bg-green-500/20 text-green-400 border-green-500/30';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': case 'completed': return 'bg-green-500/20 text-green-400';
      case 'in-progress': return 'bg-blue-500/20 text-blue-400';
      case 'critical': return 'bg-red-500/20 text-red-400';
      case 'on-hold': case 'offline': case 'pending': return 'bg-gray-500/20 text-gray-400';
      case 'suspended': return 'bg-red-500/20 text-red-400';
      default: return 'bg-gray-500/20 text-gray-400';
    }
  };

  // FIX: labels were raw/generic ('Development') and only covered 3 of the 5 real
  // phases, so cards fell back to showing the raw internal key ("development",
  // "sca", "crossphase") capitalized — hence cards reading "Development Phase"
  // even after the SCA/dependency-scan phase had actually run. Now matches the
  // descriptive names used in ProjectVersionHistory.tsx's PHASE_CONFIG.
  const phaseLabel: Record<string, string> = {
    requirement: 'Requirements Analysis',
    design: 'Threat Modeling (STRIDE)',
    development: 'Code Review (SAST)',
    sca: 'Dependency Scanning (SCA)',
    pipeline: 'Pipeline Security',
    crossphase: 'Cross-Phase Consistency',
  };

  const handleSetActivePage = (page: string) => {
    setActivePage(page);
    // FIX: this only ever loaded reports the *first* time (reportsList.length === 0), so once
    // populated it went stale forever — running a new analysis (e.g. Code Review) in the
    // Workspace and coming back to Reports kept showing the old snapshot from before that scan,
    // which is exactly why it looked like "no code review is done" here even after it was done.
    // Now it reloads every time the Reports page is opened.
    if (page === 'reports' && projects.length > 0) {
      loadReports();
    }
    if (page === 'audit-log' && auditLogs.length === 0 && user?.orgId) {
      setLoadingAuditLogs(true);
      getOrgActivity(user.orgId, 200)
        .then(setAuditLogs)
        .catch(err => { console.error('Audit log fetch error:', err); setAuditLogs([]); })
        .finally(() => setLoadingAuditLogs(false));
    }
  };

  const toggleMember = (userId: string) => {
    setSelectedMemberIds(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <motion.div {...PAGE_FADE} className="min-h-screen bg-gradient-to-b from-[#0A0E1A] to-[#0F1629] flex">

      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <div className="w-64 bg-[#0A0E1A]/95 border-r border-[#00D4FF]/20 flex flex-col flex-shrink-0">
        <div className="p-6 border-b border-[#00D4FF]/20">
          <Link
            to="/"
            className="flex items-center gap-3 cursor-pointer text-left"
            aria-label="Go to home"
          >
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#00D4FF] to-[#0A0E1A] flex items-center justify-center">
              <img src={logoImage} alt="Logo" className="w-10 h-10 rounded-xl object-contain drop-shadow-[0_0_10px_rgba(0,212,255,0.5)]" />
            </div>
            <div>
              <div className="font-bold text-white">FortifyLens</div>
              <div className="text-xs text-[#00D4FF]">Org Admin</div>
            </div>
          </Link>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {[
            { id: 'overview', icon: LayoutDashboard, label: 'Overview' },
            { id: 'employees', icon: Users, label: 'Employees', badge: members.length },
            { id: 'projects', icon: FolderKanban, label: 'Projects', badge: projects.length },
            { id: 'sdlc-tracking', icon: GitBranch, label: 'SDLC Tracking' },
            { id: 'teams', icon: UsersRound, label: 'Teams' },
            { id: 'audit-log', icon: Activity, label: 'Audit Log' },
            { id: 'subscription', icon: CreditCard, label: 'Subscription' },
            { id: 'reports', icon: FileText, label: 'Reports' },
            { id: 'settings', icon: Settings, label: 'Settings' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => handleSetActivePage(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all text-left ${
                activePage === item.id
                  ? 'bg-[#00D4FF] text-white'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              <span className="flex-1">{item.label}</span>
              {!!item.badge && (
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                  activePage === item.id ? 'bg-white/30 text-white' : 'bg-[#00D4FF]/20 text-[#00D4FF]'
                }`}>{item.badge}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-[#00D4FF]/20">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#00D4FF] to-[#0A0E1A] flex items-center justify-center text-white font-semibold text-sm">
              {user?.email?.charAt(0).toUpperCase() || 'A'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-white font-medium truncate">{user?.fullName || user?.email}</div>
              <div className="text-xs text-[#00D4FF]">Organization Admin</div>
            </div>
          </div>
          <Button
            onClick={handleLogout}
            variant="outline"
            size="sm"
            className="w-full border-[#00D4FF]/50 text-[#00D4FF] hover:bg-[#00D4FF]/10"
          >
            <LogOut className="w-4 h-4 mr-2" />Logout
          </Button>
        </div>
      </div>

      {/* ── Main Content ─────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        {/* ── Top Header: global search + notifications ──────────────────────── */}
        <div className="sticky top-0 z-20 bg-[#0A0E1A]/90 backdrop-blur-xl border-b border-[#00D4FF]/20 px-8 py-3 flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              placeholder="Search projects, employees, teams…"
              value={globalSearch}
              onChange={e => setGlobalSearch(e.target.value)}
              onFocus={() => setShowGlobalSearchResults(true)}
              onBlur={() => setTimeout(() => setShowGlobalSearchResults(false), 150)}
              className="bg-white/5 border-[#00D4FF]/20 text-white pl-9 h-9"
            />
            {showGlobalSearchResults && globalSearch.trim() && (() => {
              const q = globalSearch.trim().toLowerCase();
              const projHits = projects.filter(p => p.name?.toLowerCase().includes(q)).slice(0, 4);
              const empHits = members.filter(m => m.fullName?.toLowerCase().includes(q) || m.email?.toLowerCase().includes(q)).slice(0, 4);
              const teamHits = teams.filter(t => t.name?.toLowerCase().includes(q)).slice(0, 4);
              const noHits = projHits.length === 0 && empHits.length === 0 && teamHits.length === 0;
              return (
                <div className="absolute top-full mt-2 w-full bg-[#0F1629] border border-[#00D4FF]/20 rounded-lg shadow-xl overflow-hidden">
                  {noHits ? (
                    <p className="text-gray-500 text-sm p-4">No matches found.</p>
                  ) : (
                    <>
                      {projHits.length > 0 && (
                        <div className="p-2">
                          <p className="text-xs text-gray-500 px-2 pb-1">Projects</p>
                          {projHits.map(p => (
                            <button key={p.id} onClick={() => { handleSetActivePage('projects'); setGlobalSearch(''); }}
                              className="w-full text-left px-2 py-1.5 text-sm text-gray-300 hover:bg-white/5 rounded">{p.name}</button>
                          ))}
                        </div>
                      )}
                      {empHits.length > 0 && (
                        <div className="p-2 border-t border-[#00D4FF]/10">
                          <p className="text-xs text-gray-500 px-2 pb-1">Employees</p>
                          {empHits.map(m => (
                            <button key={m.userId} onClick={() => { handleSetActivePage('employees'); setGlobalSearch(''); }}
                              className="w-full text-left px-2 py-1.5 text-sm text-gray-300 hover:bg-white/5 rounded">{m.fullName}</button>
                          ))}
                        </div>
                      )}
                      {teamHits.length > 0 && (
                        <div className="p-2 border-t border-[#00D4FF]/10">
                          <p className="text-xs text-gray-500 px-2 pb-1">Teams</p>
                          {teamHits.map(t => (
                            <button key={t.id} onClick={() => { handleSetActivePage('teams'); setGlobalSearch(''); }}
                              className="w-full text-left px-2 py-1.5 text-sm text-gray-300 hover:bg-white/5 rounded">{t.name}</button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })()}
          </div>

          <div className="relative ml-auto">
            <button onClick={() => setShowNotifications(v => !v)} className="relative p-2 rounded-lg hover:bg-white/5 transition-colors">
              <Bell className="w-5 h-5 text-gray-400" />
              {criticalFindingsCount > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
              )}
            </button>
            {showNotifications && (
              <div className="absolute right-0 top-full mt-2 w-80 bg-[#0F1629] border border-[#00D4FF]/20 rounded-lg shadow-xl overflow-hidden">
                <div className="p-3 border-b border-[#00D4FF]/10">
                  <p className="text-white text-sm font-semibold">Notifications</p>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {criticalFindingsCount > 0 && (
                    <div className="p-3 border-b border-[#00D4FF]/10 hover:bg-white/5 cursor-pointer"
                      onClick={() => { handleSetActivePage('projects'); setShowNotifications(false); }}>
                      <p className="text-sm text-red-400 font-medium">⚠ {criticalFindingsCount} project(s) at critical risk</p>
                      <p className="text-xs text-gray-500 mt-1">Score ≥ 80 — review needed</p>
                    </div>
                  )}
                  {invitations.filter(i => i.status === 'pending').length > 0 && (
                    <div className="p-3 border-b border-[#00D4FF]/10 hover:bg-white/5 cursor-pointer"
                      onClick={() => { handleSetActivePage('employees'); setShowNotifications(false); }}>
                      <p className="text-sm text-yellow-400 font-medium">{invitations.filter(i => i.status === 'pending').length} pending invitation(s)</p>
                      <p className="text-xs text-gray-500 mt-1">Awaiting employee response</p>
                    </div>
                  )}
                  {activityLogs.slice(0, 5).map((log: any) => (
                    <div key={log.id} className="p-3 border-b border-[#00D4FF]/10 last:border-0">
                      <p className="text-sm text-gray-300">{log.action}</p>
                      <p className="text-xs text-gray-500 mt-1">{log.userName}</p>
                    </div>
                  ))}
                  {criticalFindingsCount === 0 && invitations.filter(i => i.status === 'pending').length === 0 && activityLogs.length === 0 && (
                    <p className="text-gray-500 text-sm p-4">Nothing new.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="container mx-auto p-8">

          {/* ════════════════ OVERVIEW ════════════════ */}
          {activePage === 'overview' && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
              <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold text-white">Organization Overview</h1>
                <Button onClick={handleDownloadOrgReport} disabled={generatingOrgReport || projects.length === 0}
                  className="bg-gradient-to-r from-purple-600 to-purple-500 text-white text-sm">
                  {generatingOrgReport
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generating…</>
                    : <><Download className="w-4 h-4 mr-2" />Download Executive Summary</>}
                </Button>
              </div>

              {/* Headline risk + critical alert row */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="p-6 bg-white/5 backdrop-blur-sm border-[#00D4FF]/20">
                  <div className="text-sm text-gray-400 mb-2">Org-Wide Average Risk</div>
                  <div className={`text-4xl font-bold ${orgAvgRisk >= 70 ? 'text-red-400' : orgAvgRisk >= 40 ? 'text-yellow-400' : 'text-green-400'}`}>
                    {loadingProjects ? '…' : orgAvgRisk}<span className="text-lg text-gray-500">/100</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">Averaged across {projects.length} project(s)</p>
                </Card>
                <Card className="p-6 bg-white/5 backdrop-blur-sm border-red-500/30 col-span-1 md:col-span-2">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-5 h-5 text-red-400" />
                    <div className="text-sm text-gray-400">Critical Findings Requiring Attention</div>
                  </div>
                  {criticalFindingsCount === 0 ? (
                    <p className="text-green-400 text-sm">No projects currently at critical risk. ✅</p>
                  ) : (
                    <p className="text-white text-sm">
                      <span className="text-red-400 font-bold text-2xl mr-2">{criticalFindingsCount}</span>
                      project{criticalFindingsCount !== 1 ? 's' : ''} at critical risk (score ≥ 80) — review under "Top Risky Projects" below.
                    </p>
                  )}
                </Card>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                  { label: 'Total Employees', value: loadingMembers ? '…' : members.length, icon: Users, color: 'from-blue-500 to-blue-600' },
                  { label: 'Active Projects', value: loadingProjects ? '…' : projects.length, icon: FolderKanban, color: 'from-purple-500 to-purple-600' },
                  { label: 'Total Teams', value: loadingTeams ? '…' : teams.length, icon: UsersRound, color: 'from-[#00D4FF] to-[#00D4D4]' },
                  { label: 'Vulnerabilities', value: loadingProjects ? '…' : projects.filter(p => (p.riskScore ?? 0) >= 60).length, icon: AlertTriangle, color: 'from-red-500 to-red-600' },
                ].map((stat, i) => (
                  <Card key={i} className="p-6 bg-white/5 backdrop-blur-sm border-[#00D4FF]/20 relative overflow-hidden">
                    <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${stat.color} opacity-10 blur-2xl`} />
                    <div className="relative z-10">
                      <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${stat.color} flex items-center justify-center mb-4`}>
                        <stat.icon className="w-6 h-6 text-white" />
                      </div>
                      <div className="text-3xl font-bold text-white mb-1">{stat.value}</div>
                      <div className="text-sm text-gray-400">{stat.label}</div>
                    </div>
                  </Card>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <Card className="p-6 bg-white/5 backdrop-blur-sm border-[#00D4FF]/20">
                  <h2 className="text-xl font-semibold text-white mb-6">SDLC Progress Over Time</h2>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={progressData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#00D4FF" opacity={0.1} />
                        <XAxis dataKey="month" stroke="#888" />
                        <YAxis stroke="#888" />
                        <Tooltip contentStyle={{ backgroundColor: '#0A0E1A', border: '1px solid #00D4FF' }} labelStyle={{ color: '#fff' }} />
                        <Line type="monotone" dataKey="completion" stroke="#00D4FF" strokeWidth={2} dot={{ fill: '#00D4FF' }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </Card>

                <Card className="p-6 bg-white/5 backdrop-blur-sm border-[#00D4FF]/20">
                  <h2 className="text-xl font-semibold text-white mb-6">Vulnerability Breakdown</h2>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={vulnerabilityData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={5} dataKey="value">
                          {vulnerabilityData.map((entry, i) => (
                            <Cell key={i} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ backgroundColor: '#0A0E1A', border: '1px solid #00D4FF' }} labelStyle={{ color: '#fff' }} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <Card className="p-6 bg-white/5 backdrop-blur-sm border-[#00D4FF]/20">
                  <h2 className="text-xl font-semibold text-white mb-6">Org Risk Trend</h2>
                  <div className="h-64">
                    {riskTrendData.length === 0 ? (
                      <div className="flex items-center justify-center h-full text-gray-500 text-sm">Not enough data yet.</div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={riskTrendData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#00D4FF" opacity={0.1} />
                          <XAxis dataKey="month" stroke="#888" />
                          <YAxis stroke="#888" domain={[0, 100]} />
                          <Tooltip contentStyle={{ backgroundColor: '#0A0E1A', border: '1px solid #00D4FF' }} labelStyle={{ color: '#fff' }} />
                          <Line type="monotone" dataKey="avgRisk" stroke="#EF4444" strokeWidth={2} dot={{ fill: '#EF4444' }} name="Avg Risk Score" />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </Card>

                <Card className="p-6 bg-white/5 backdrop-blur-sm border-[#00D4FF]/20">
                  <h2 className="text-xl font-semibold text-white mb-6">Top Risky Projects</h2>
                  {topRiskyProjects.length === 0 ? (
                    <p className="text-gray-500 text-sm">No projects yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {topRiskyProjects.map((p, i) => (
                        <div
                          key={p.id}
                          onClick={() => handleSetActivePage('projects')}
                          className="flex items-center gap-4 p-3 bg-white/5 rounded-lg cursor-pointer hover:bg-white/10 transition-colors"
                        >
                          <span className="text-gray-500 font-bold w-5 text-center">{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm font-medium truncate">{p.name}</p>
                            <p className="text-xs text-gray-400">{p.domain || 'web-application'}</p>
                          </div>
                          <span className={`text-sm font-bold ${
                            (p.riskScore ?? 0) >= 80 ? 'text-red-400' : (p.riskScore ?? 0) >= 60 ? 'text-orange-400' : (p.riskScore ?? 0) >= 40 ? 'text-yellow-400' : 'text-green-400'
                          }`}>{p.riskScore ?? 0}/100</span>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>


              <Card className="p-6 bg-white/5 backdrop-blur-sm border-[#00D4FF]/20">
                <h2 className="text-xl font-semibold text-white mb-6">Recent Activity</h2>
                <div className="space-y-3">
                  {activityLogs.length === 0 ? (
                    <p className="text-gray-400 text-sm">No activity yet. Create a project or team to get started.</p>
                  ) : activityLogs.map((log) => (
                    <div key={log.id} className="flex items-start gap-4 p-4 bg-white/5 rounded-lg">
                      <Activity className="w-5 h-5 text-[#00D4FF] mt-1 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-white text-sm">
                          <span className="font-medium">{log.userName}</span> {log.action}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          {log.createdAt?.toDate?.().toLocaleString() || 'Just now'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </motion.div>
          )}

          {/* ════════════════ EMPLOYEES ════════════════ */}
          {activePage === 'employees' && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold text-white">Employees</h1>
                <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
                  <DialogTrigger asChild>
                    <Button className="bg-gradient-to-r from-[#00D4FF] to-[#00D4FF]/80 text-white">
                      <Plus className="w-4 h-4 mr-2" />Invite Employee
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="bg-[#0A0E1A] border-[#00D4FF]/20">
                    <DialogHeader>
                      <DialogTitle className="text-white text-2xl">Invite Employee</DialogTitle>
                      <DialogDescription className="text-gray-400">
                        Send an invitation email with a 6-digit code. Stored in Firebase under organizations/{'{orgId}'}/invitations.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 pt-4">
                      <div>
                        <Label className="text-white mb-2">Email Address</Label>
                        <Input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="employee@company.com" className="bg-white/5 border-[#00D4FF]/20 text-white mt-2" />
                      </div>
                      <div>
                        <Label className="text-white mb-2">Role</Label>
                        <Select value={inviteRole} onValueChange={setInviteRole}>
                          <SelectTrigger className="bg-white/5 border-[#00D4FF]/20 text-white mt-2"><SelectValue /></SelectTrigger>
                          <SelectContent className="bg-[#0A0E1A] border-[#00D4FF]/20">
                            <SelectItem value="developer" className="text-white">Developer</SelectItem>
                            <SelectItem value="analyst" className="text-white">Security Analyst</SelectItem>
                            <SelectItem value="qa" className="text-white">QA Engineer</SelectItem>
                            <SelectItem value="manager" className="text-white">Manager</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-white mb-2">Department</Label>
                        <Select value={inviteDepartment} onValueChange={setInviteDepartment}>
                          <SelectTrigger className="bg-white/5 border-[#00D4FF]/20 text-white mt-2"><SelectValue /></SelectTrigger>
                          <SelectContent className="bg-[#0A0E1A] border-[#00D4FF]/20">
                            <SelectItem value="engineering" className="text-white">Engineering</SelectItem>
                            <SelectItem value="security" className="text-white">Security</SelectItem>
                            <SelectItem value="qa" className="text-white">Quality Assurance</SelectItem>
                            <SelectItem value="operations" className="text-white">Operations</SelectItem>
                            <SelectItem value="product" className="text-white">Product</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex gap-3 pt-4">
                        <Button onClick={handleInviteEmployee} className="flex-1 bg-[#00D4FF] text-white">Send Invitation</Button>
                        <Button onClick={() => setShowInviteDialog(false)} variant="outline" className="flex-1 border-[#00D4FF]/50 text-[#00D4FF]">Cancel</Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <Input
                  placeholder="Search by name or email…"
                  value={employeeSearch}
                  onChange={e => setEmployeeSearch(e.target.value)}
                  className="bg-white/5 border-[#00D4FF]/20 text-white flex-1"
                />
                <Select value={employeeDeptFilter} onValueChange={setEmployeeDeptFilter}>
                  <SelectTrigger className="bg-white/5 border-[#00D4FF]/20 text-white sm:w-48"><SelectValue placeholder="All departments" /></SelectTrigger>
                  <SelectContent className="bg-[#0A0E1A] border-[#00D4FF]/20">
                    <SelectItem value="all" className="text-white">All departments</SelectItem>
                    <SelectItem value="engineering" className="text-white">Engineering</SelectItem>
                    <SelectItem value="security" className="text-white">Security</SelectItem>
                    <SelectItem value="qa" className="text-white">Quality Assurance</SelectItem>
                    <SelectItem value="operations" className="text-white">Operations</SelectItem>
                    <SelectItem value="product" className="text-white">Product</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={employeeStatusFilter} onValueChange={setEmployeeStatusFilter}>
                  <SelectTrigger className="bg-white/5 border-[#00D4FF]/20 text-white sm:w-40"><SelectValue placeholder="All statuses" /></SelectTrigger>
                  <SelectContent className="bg-[#0A0E1A] border-[#00D4FF]/20">
                    <SelectItem value="all" className="text-white">All statuses</SelectItem>
                    <SelectItem value="active" className="text-white">Active</SelectItem>
                    <SelectItem value="pending" className="text-white">Pending</SelectItem>
                    <SelectItem value="suspended" className="text-white">Suspended</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Card className="bg-white/5 backdrop-blur-sm border-[#00D4FF]/20 overflow-hidden">
                {loadingMembers ? (
                  <div className="flex items-center justify-center p-12 text-gray-400">
                    <Loader2 className="w-6 h-6 animate-spin mr-2" />Loading employees…
                  </div>
                ) : members.length === 0 ? (
                  <div className="text-center p-12 text-gray-400">
                    <Users className="w-12 h-12 mx-auto mb-3 text-gray-600" />
                    <p>No employees yet. Invite someone to get started.</p>
                  </div>
                ) : (() => {
                  const q = employeeSearch.trim().toLowerCase();
                  const filteredMembers = members.filter(m =>
                    (!q || m.fullName?.toLowerCase().includes(q) || m.email?.toLowerCase().includes(q)) &&
                    (employeeDeptFilter === 'all' || m.department === employeeDeptFilter) &&
                    (employeeStatusFilter === 'all' || m.status === employeeStatusFilter)
                  );
                  if (filteredMembers.length === 0) {
                    return (
                      <div className="text-center p-12 text-gray-400">
                        <Users className="w-12 h-12 mx-auto mb-3 text-gray-600" />
                        <p>No employees match your filters.</p>
                      </div>
                    );
                  }
                  return (
                  <Table>
                    <TableHeader>
                      <TableRow className="border-[#00D4FF]/20 hover:bg-transparent">
                        <TableHead className="text-gray-400">Name</TableHead>
                        <TableHead className="text-gray-400">Job Title</TableHead>
                        <TableHead className="text-gray-400">Department</TableHead>
                        <TableHead className="text-gray-400">Email</TableHead>
                        <TableHead className="text-gray-400">Status</TableHead>
                        <TableHead className="text-gray-400">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredMembers.map((member) => (
                        <TableRow key={member.id} className="border-[#00D4FF]/20 hover:bg-white/5">
                          <TableCell className="text-white font-medium">{member.fullName}</TableCell>
                          <TableCell className="text-gray-400">{member.jobTitle}</TableCell>
                          <TableCell className="text-gray-400">{member.department}</TableCell>
                          <TableCell className="text-gray-400">{member.email}</TableCell>
                          <TableCell>
                            <Badge className={getStatusColor(member.status)}>{member.status}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button size="sm" variant="ghost" className="text-[#00D4FF] hover:bg-[#00D4FF]/10"
                                onClick={() => {
                                  setSelectedEmployee(member);
                                  setShowEmployeeViewDialog(true);
                                  if (auditLogs.length === 0 && user?.orgId) {
                                    setLoadingAuditLogs(true);
                                    getOrgActivity(user.orgId, 200)
                                      .then(setAuditLogs)
                                      .catch(() => setAuditLogs([]))
                                      .finally(() => setLoadingAuditLogs(false));
                                  }
                                }}>
                                <Eye className="w-4 h-4" />
                              </Button>
                              <Button size="sm" variant="ghost" className="text-gray-400 hover:bg-white/5"
                                onClick={() => { setSelectedEmployee(member); setShowEmployeeEditDialog(true); }}>
                                <Edit2 className="w-4 h-4" />
                              </Button>
                              {member.status === 'active' ? (
                                <Button size="sm" variant="ghost" className="text-red-400 hover:bg-red-500/10"
                                  onClick={() => handleSuspendEmployee(member)}>
                                  Suspend
                                </Button>
                              ) : (
                                <Button size="sm" variant="ghost" className="text-green-400 hover:bg-green-500/10"
                                  onClick={async () => {
                                    if (!user?.orgId) return;
                                    try {
                                      const memberId = member.userId ?? member.id;
                                      await updateDoc(
                                        doc(db, 'organizations', user.orgId, 'members', memberId),
                                        { status: 'active' }
                                      );
                                      setMembers(prev => prev.map(m =>
                                        (m.userId ?? m.id) === memberId ? { ...m, status: 'active' } : m
                                      ));
                                      toast.success(`${member.fullName} reactivated`);
                                    } catch {
                                      toast.error('Failed to reactivate member');
                                    }
                                  }}>
                                  Reactivate
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  );
                })()}
              </Card>
            </motion.div>
          )}

          {/* ════════════════ PROJECTS ════════════════ */}
          {activePage === 'projects' && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold text-white">Projects</h1>
                <Dialog open={showCreateProjectDialog} onOpenChange={setShowCreateProjectDialog}>
                  <DialogTrigger asChild>
                    <Button className="bg-gradient-to-r from-[#00D4FF] to-[#00D4FF]/80 text-white">
                      <Plus className="w-4 h-4 mr-2" />Create Project
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="bg-[#0A0E1A] border-[#00D4FF]/20">
                    <DialogHeader>
                      <DialogTitle className="text-white text-2xl">Create New Project</DialogTitle>
                      <DialogDescription className="text-gray-400">
                        Saved to Firebase under organizations/{'{orgId}'}/projects. Persists across login sessions.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 pt-4">
                      <div>
                        <Label className="text-white mb-2">Project Name *</Label>
                        <Input value={projectName} onChange={e => setProjectName(e.target.value)} placeholder="E-Commerce Platform" className="bg-white/5 border-[#00D4FF]/20 text-white mt-2" />
                      </div>
                      <div>
                        <Label className="text-white mb-2">Description</Label>
                        <Textarea value={projectDesc} onChange={e => setProjectDesc(e.target.value)} placeholder="Project description..." className="bg-white/5 border-[#00D4FF]/20 text-white mt-2" rows={2} />
                      </div>
                      <div>
                        <Label className="text-white mb-2">Domain</Label>
                        <Select value={projectDomain} onValueChange={setProjectDomain}>
                          <SelectTrigger className="bg-white/5 border-[#00D4FF]/20 text-white mt-2"><SelectValue /></SelectTrigger>
                          <SelectContent className="bg-[#0A0E1A] border-[#00D4FF]/20">
                            <SelectItem value="web-application" className="text-white">Web Application</SelectItem>
                            <SelectItem value="mobile-app" className="text-white">Mobile App</SelectItem>
                            <SelectItem value="api" className="text-white">API / Backend</SelectItem>
                            <SelectItem value="cloud" className="text-white">Cloud Infrastructure</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-white mb-2">Assign Team</Label>
                        <Select value={projectTeamId} onValueChange={setProjectTeamId}>
                          <SelectTrigger className="bg-white/5 border-[#00D4FF]/20 text-white mt-2">
                            <SelectValue placeholder="Select a team (optional)" />
                          </SelectTrigger>
                          <SelectContent className="bg-[#0A0E1A] border-[#00D4FF]/20">
                            <SelectItem value="none" className="text-gray-400">No team</SelectItem>
                            {teams.map(t => (
                              <SelectItem key={t.id} value={t.id} className="text-white">{t.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {projectTeamId && (
                          <p className="text-xs text-[#00D4FF] mt-1">✓ Team members will be linked to this project</p>
                        )}
                      </div>
                      <div>
                        <Label className="text-white mb-2">Starting SDLC Phase</Label>
                        <Select value={projectPhase} onValueChange={v => setProjectPhase(v as ProjectPhase)}>
                          <SelectTrigger className="bg-white/5 border-[#00D4FF]/20 text-white mt-2"><SelectValue /></SelectTrigger>
                          <SelectContent className="bg-[#0A0E1A] border-[#00D4FF]/20">
                            <SelectItem value="requirement" className="text-white">Requirement Analysis</SelectItem>
                            <SelectItem value="design" className="text-white">Design</SelectItem>
                            <SelectItem value="development" className="text-white">Development</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex gap-3 pt-4">
                        <Button onClick={handleCreateProject} disabled={creatingProject} className="flex-1 bg-[#00D4FF] text-white">
                          {creatingProject ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating…</> : 'Create Project'}
                        </Button>
                        <Button onClick={() => setShowCreateProjectDialog(false)} variant="outline" className="flex-1 border-[#00D4FF]/50 text-[#00D4FF]">Cancel</Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <Input
                  placeholder="Search projects…"
                  value={projectSearch}
                  onChange={e => setProjectSearch(e.target.value)}
                  className="bg-white/5 border-[#00D4FF]/20 text-white flex-1"
                />
                <Select value={projectPhaseFilter} onValueChange={setProjectPhaseFilter}>
                  <SelectTrigger className="bg-white/5 border-[#00D4FF]/20 text-white sm:w-48"><SelectValue placeholder="All phases" /></SelectTrigger>
                  <SelectContent className="bg-[#0A0E1A] border-[#00D4FF]/20">
                    <SelectItem value="all" className="text-white">All phases</SelectItem>
                    <SelectItem value="requirement" className="text-white">Requirement Analysis</SelectItem>
                    <SelectItem value="design" className="text-white">Design</SelectItem>
                    <SelectItem value="development" className="text-white">Development</SelectItem>
                    <SelectItem value="completed" className="text-white">Completed</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={projectSortBy} onValueChange={v => setProjectSortBy(v as any)}>
                  <SelectTrigger className="bg-white/5 border-[#00D4FF]/20 text-white sm:w-48"><SelectValue placeholder="Sort by" /></SelectTrigger>
                  <SelectContent className="bg-[#0A0E1A] border-[#00D4FF]/20">
                    <SelectItem value="recent" className="text-white">Most recent</SelectItem>
                    <SelectItem value="risk-desc" className="text-white">Highest risk first</SelectItem>
                    <SelectItem value="risk-asc" className="text-white">Lowest risk first</SelectItem>
                    <SelectItem value="name" className="text-white">Name (A-Z)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {loadingProjects ? (
                <div className="flex items-center justify-center p-12 text-gray-400">
                  <Loader2 className="w-6 h-6 animate-spin mr-2" />Loading projects from Firebase…
                </div>
              ) : projects.length === 0 ? (
                <Card className="p-12 bg-white/5 backdrop-blur-sm border-[#00D4FF]/20 text-center">
                  <FolderKanban className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400 text-lg">No projects yet</p>
                  <p className="text-gray-500 text-sm mt-1">Click "Create Project" to get started — it will persist in Firebase.</p>
                </Card>
              ) : (() => {
                const q = projectSearch.trim().toLowerCase();
                let filteredProjects = projects.filter(p =>
                  (!q || p.name?.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q)) &&
                  (projectPhaseFilter === 'all' || p.currentPhase === projectPhaseFilter)
                );
                filteredProjects = [...filteredProjects].sort((a, b) => {
                  if (projectSortBy === 'risk-desc') return (b.riskScore ?? 0) - (a.riskScore ?? 0);
                  if (projectSortBy === 'risk-asc') return (a.riskScore ?? 0) - (b.riskScore ?? 0);
                  if (projectSortBy === 'name') return (a.name || '').localeCompare(b.name || '');
                  return 0; // 'recent' — keep Firestore's default order
                });
                if (filteredProjects.length === 0) {
                  return (
                    <Card className="p-12 bg-white/5 backdrop-blur-sm border-[#00D4FF]/20 text-center">
                      <FolderKanban className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                      <p className="text-gray-400 text-lg">No projects match your filters.</p>
                    </Card>
                  );
                }
                return (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {filteredProjects.map((project) => {
                    const updatedAt = (project as any).updatedAt;
                    const updatedDate = updatedAt?.toDate ? updatedAt.toDate() : updatedAt ? new Date(updatedAt) : null;
                    const isStale = updatedDate ? (Date.now() - updatedDate.getTime()) > 30 * 24 * 60 * 60 * 1000 : false;
                    const isCritical = (project.riskScore ?? 0) >= 80;
                    return (
                    <Card key={project.id} className="p-6 bg-white/5 backdrop-blur-sm border-[#00D4FF]/20">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1 min-w-0 pr-3">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <h3 className="text-xl font-semibold text-white truncate">{project.name}</h3>
                            {isCritical && <Badge className="bg-red-500/20 text-red-400 text-xs">Critical</Badge>}
                            {isStale && <Badge className="bg-gray-500/20 text-gray-400 text-xs">Stale</Badge>}
                          </div>
                          <p className="text-gray-400 text-sm truncate">{project.description}</p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Badge className={getStatusColor(project.status)}>{project.status}</Badge>
                          <Button size="sm" variant="ghost" className="text-red-400 hover:bg-red-500/10 p-1"
                            onClick={() => handleDeleteProject(project.id, project.name)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-400">SDLC Phase:</span>
                          <Badge className="bg-blue-500/20 text-blue-400">{phaseLabel[project.currentPhase] || project.currentPhase}</Badge>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-400">Domain:</span>
                          <span className="text-white">{project.domain}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-400">Risk Score:</span>
                          <Badge className={getRiskColor(project.riskScore)}>{project.riskScore}</Badge>
                        </div>
                        <div>
                          <div className="flex items-center justify-between text-sm mb-2">
                            <span className="text-gray-400">Progress:</span>
                            <span className="text-white">{project.progress}%</span>
                          </div>
                          <Progress value={project.progress} className="h-2" />
                        </div>
                        {/* Vuln severity counts — real data from vulnerabilities subcollection */}
                        {projectVulnStats[project.id] && (
                          <div className="flex gap-2 pt-1">
                            {[
                              { label: 'C', count: projectVulnStats[project.id].critical, color: 'bg-red-500/20 text-red-400' },
                              { label: 'H', count: projectVulnStats[project.id].high, color: 'bg-orange-500/20 text-orange-400' },
                              { label: 'M', count: projectVulnStats[project.id].medium, color: 'bg-yellow-500/20 text-yellow-400' },
                              { label: 'L', count: projectVulnStats[project.id].low, color: 'bg-gray-500/20 text-gray-400' },
                            ].map(s => s.count > 0 ? (
                              <span key={s.label} title={s.label === 'C' ? 'Critical' : s.label === 'H' ? 'High' : s.label === 'M' ? 'Medium' : 'Low'}
                                className={`text-xs px-2 py-0.5 rounded-full font-semibold ${s.color}`}>
                                {s.label} {s.count}
                              </span>
                            ) : null)}
                            {projectVulnStats[project.id].critical === 0 && projectVulnStats[project.id].high === 0 &&
                             projectVulnStats[project.id].medium === 0 && projectVulnStats[project.id].low === 0 && (
                              <span className="text-xs text-green-400">No vulnerabilities found</span>
                            )}
                          </div>
                        )}
                        <div className="flex items-center justify-between pt-2 border-t border-[#00D4FF]/20">
                          <span className="text-xs text-gray-500">
                            Created by: {project.createdBy === user?.uid ? 'You' : project.createdBy}
                          </span>
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost"
                              className="text-purple-400 hover:bg-purple-500/10 text-xs"
                              disabled={generatingConsolidatedReport === project.id}
                              onClick={() => handleDownloadConsolidatedReport(project)}>
                              {generatingConsolidatedReport === project.id
                                ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Generating…</>
                                : <><Download className="w-3 h-3 mr-1" />Full Report</>}
                            </Button>
                            <Button size="sm" variant="ghost" className="text-[#00D4FF] hover:bg-[#00D4FF]/10"
                              onClick={() => handleViewProjectDetails(project)}>
                              View Details <ChevronRight className="w-4 h-4 ml-1" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </Card>
                    );
                  })}
                </div>
                );
              })()}
            </motion.div>
          )}

          {/* ════════════════ SDLC TRACKING ════════════════ */}
          {activePage === 'sdlc-tracking' && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              <h1 className="text-3xl font-bold text-white">SDLC Pipeline Tracking</h1>
              {projects.length === 0 ? (
                <Card className="p-12 bg-white/5 backdrop-blur-sm border-[#00D4FF]/20 text-center">
                  <GitBranch className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400 text-lg">No projects yet</p>
                </Card>
              ) : (
                <SDLCTrackingView projects={projects} orgId={user?.orgId ?? ''} phaseLabel={phaseLabel} />
              )}
            </motion.div>
          )}

          {/* ════════════════ TEAMS ════════════════ */}
          {activePage === 'teams' && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold text-white">Teams</h1>
                <Dialog open={showCreateTeamDialog} onOpenChange={setShowCreateTeamDialog}>
                  <DialogTrigger asChild>
                    <Button className="bg-gradient-to-r from-[#00D4FF] to-[#00D4FF]/80 text-white">
                      <Plus className="w-4 h-4 mr-2" />Create Team
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="bg-[#0A0E1A] border-[#00D4FF]/20 max-w-lg">
                    <DialogHeader>
                      <DialogTitle className="text-white text-2xl">Create New Team</DialogTitle>
                      <DialogDescription className="text-gray-400">
                        Saved to Firebase under organizations/{'{orgId}'}/teams. Link a project and members will get access.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 pt-4">
                      <div>
                        <Label className="text-white mb-2">Team Name *</Label>
                        <Input value={teamName} onChange={e => setTeamName(e.target.value)} placeholder="Alpha Team" className="bg-white/5 border-[#00D4FF]/20 text-white mt-2" />
                      </div>

                      <div>
                        <Label className="text-white mb-2">Team Lead</Label>
                        <Select value={teamLeadId} onValueChange={v => {
                          setTeamLeadId(v);
                          const m = members.find(mb => mb.userId === v);
                          setTeamLeadName(m?.fullName || '');
                        }}>
                          <SelectTrigger className="bg-white/5 border-[#00D4FF]/20 text-white mt-2">
                            <SelectValue placeholder="Select team lead" />
                          </SelectTrigger>
                          <SelectContent className="bg-[#0A0E1A] border-[#00D4FF]/20">
                            {members.map(m => (
                              <SelectItem key={m.userId} value={m.userId} className="text-white">{m.fullName}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Member picker */}
                      <div>
                        <Label className="text-white mb-2">Add Members</Label>
                        <p className="text-xs text-gray-500 mb-2">Select employees to include in this team</p>
                        <div className="max-h-40 overflow-y-auto border border-[#00D4FF]/20 rounded-lg p-2 space-y-1 bg-white/5">
                          {members.length === 0 ? (
                            <p className="text-gray-500 text-sm text-center py-2">No employees found. Invite some first.</p>
                          ) : members.map(m => {
                            const isLead = m.userId === teamLeadId;
                            const isSelected = selectedMemberIds.includes(m.userId) || isLead;
                            return (
                              <div
                                key={m.userId}
                                onClick={() => !isLead && toggleMember(m.userId)}
                                className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-colors ${
                                  isSelected ? 'bg-[#00D4FF]/20' : 'hover:bg-white/5'
                                } ${isLead ? 'cursor-default' : ''}`}
                              >
                                <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                                  isSelected ? 'bg-[#00D4FF] border-[#00D4FF]' : 'border-gray-500'
                                }`}>
                                  {isSelected && <Check className="w-3 h-3 text-white" />}
                                </div>
                                <span className={`text-sm ${isSelected ? 'text-white' : 'text-gray-400'}`}>{m.fullName}</span>
                                {isLead && <Badge className="ml-auto text-xs bg-[#00D4FF]/20 text-[#00D4FF]">Lead</Badge>}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div>
                        <Label className="text-white mb-2">Link to Project</Label>
                        <Select value={teamProjectId} onValueChange={setTeamProjectId}>
                          <SelectTrigger className="bg-white/5 border-[#00D4FF]/20 text-white mt-2">
                            <SelectValue placeholder="Select a project (optional)" />
                          </SelectTrigger>
                          <SelectContent className="bg-[#0A0E1A] border-[#00D4FF]/20">
                            <SelectItem value="none" className="text-gray-400">No project</SelectItem>
                            {projects.map(p => (
                              <SelectItem key={p.id} value={p.id} className="text-white">{p.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {teamProjectId && (
                          <p className="text-xs text-[#00D4FF] mt-1">✓ Team members will see this project in their dashboard</p>
                        )}
                      </div>

                      <div className="flex gap-3 pt-4">
                        <Button onClick={handleCreateTeam} disabled={creatingTeam} className="flex-1 bg-[#00D4FF] text-white">
                          {creatingTeam ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating…</> : 'Create Team'}
                        </Button>
                        <Button onClick={() => setShowCreateTeamDialog(false)} variant="outline" className="flex-1 border-[#00D4FF]/50 text-[#00D4FF]">Cancel</Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              {loadingTeams ? (
                <div className="flex items-center justify-center p-12 text-gray-400">
                  <Loader2 className="w-6 h-6 animate-spin mr-2" />Loading teams from Firebase…
                </div>
              ) : teams.length === 0 ? (
                <Card className="p-12 bg-white/5 backdrop-blur-sm border-[#00D4FF]/20 text-center">
                  <UsersRound className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400 text-lg">No teams yet</p>
                  <p className="text-gray-500 text-sm mt-1">Click "Create Team" — it will persist in Firebase.</p>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {teams.map((team) => (
                    <Card key={team.id} className="p-6 bg-white/5 backdrop-blur-sm border-[#00D4FF]/20">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <h3 className="text-xl font-semibold text-white mb-1">{team.name}</h3>
                          <p className="text-gray-400 text-sm">Lead: {team.leadName || 'Unassigned'}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={getStatusColor(team.status)}>{team.status}</Badge>
                          <Button size="sm" variant="ghost" className="text-red-400 hover:bg-red-500/10 p-1"
                            onClick={() => handleDeleteTeam(team.id, team.name)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-400">Members:</span>
                          <span className="text-white">{team.memberCount}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-400">Linked Project:</span>
                          <span className="text-[#00D4FF]">{team.projectName || '—'}</span>
                        </div>
                        {(() => {
                          const linkedProject = team.projectId ? projects.find(p => p.id === team.projectId) : undefined;
                          const teamRisk = linkedProject?.riskScore;
                          const memberAvatars = ((team as any).memberIds ?? []).slice(0, 5).map((mid: string) => members.find(m => m.userId === mid)).filter(Boolean);
                          return (
                            <>
                              {teamRisk !== undefined && (
                                <div className="flex items-center justify-between text-sm">
                                  <span className="text-gray-400">Project Risk:</span>
                                  <span className={`font-bold ${teamRisk >= 70 ? 'text-red-400' : teamRisk >= 40 ? 'text-yellow-400' : 'text-green-400'}`}>{teamRisk}/100</span>
                                </div>
                              )}
                              {memberAvatars.length > 0 && (
                                <div className="flex items-center -space-x-2 pt-1">
                                  {memberAvatars.map((m: any) => (
                                    <div key={m.userId} title={m.fullName}
                                      className="w-7 h-7 rounded-full bg-gradient-to-br from-[#00D4FF] to-purple-600 border-2 border-[#0F1629] flex items-center justify-center text-[10px] text-white font-semibold">
                                      {m.fullName?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                                    </div>
                                  ))}
                                  {((team as any).memberIds?.length ?? 0) > 5 && (
                                    <div className="w-7 h-7 rounded-full bg-white/10 border-2 border-[#0F1629] flex items-center justify-center text-[10px] text-gray-300">
                                      +{(team as any).memberIds.length - 5}
                                    </div>
                                  )}
                                </div>
                              )}
                            </>
                          );
                        })()}
                        <div className="flex gap-2 pt-3 border-t border-[#00D4FF]/20">
                          <Button size="sm" className="flex-1 bg-[#00D4FF] text-white"
                            onClick={() => handleManageTeam(team)}>Manage</Button>
                          <Button size="sm" variant="outline" className="flex-1 border-[#00D4FF]/50 text-[#00D4FF]"
                            onClick={() => handleEditTeam(team)}>Edit</Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* ════════════════ AUDIT LOG ════════════════ */}
          {activePage === 'audit-log' && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-3xl font-bold text-white">Audit Log</h1>
                  <p className="text-gray-400 text-sm mt-1">Full history of org activity — who did what, and when.</p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <Input
                  placeholder="Search by user or action…"
                  value={auditSearch}
                  onChange={e => setAuditSearch(e.target.value)}
                  className="bg-white/5 border-[#00D4FF]/20 text-white flex-1"
                />
                <Select value={auditTypeFilter} onValueChange={setAuditTypeFilter}>
                  <SelectTrigger className="bg-white/5 border-[#00D4FF]/20 text-white sm:w-48">
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0A0E1A] border-[#00D4FF]/20">
                    <SelectItem value="all" className="text-white">All types</SelectItem>
                    <SelectItem value="info" className="text-white">Info</SelectItem>
                    <SelectItem value="success" className="text-white">Success</SelectItem>
                    <SelectItem value="warning" className="text-white">Warning</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Card className="bg-white/5 backdrop-blur-sm border-[#00D4FF]/20 overflow-hidden">
                {loadingAuditLogs ? (
                  <div className="flex items-center justify-center p-12 text-gray-400">
                    <Loader2 className="w-6 h-6 animate-spin mr-2" />Loading audit log…
                  </div>
                ) : (() => {
                  const filtered = auditLogs.filter(log => {
                    const matchesType = auditTypeFilter === 'all' || log.type === auditTypeFilter;
                    const q = auditSearch.trim().toLowerCase();
                    const matchesSearch = !q || (log.userName ?? '').toLowerCase().includes(q) || (log.action ?? '').toLowerCase().includes(q);
                    return matchesType && matchesSearch;
                  });
                  if (filtered.length === 0) {
                    return (
                      <div className="text-center p-12 text-gray-400">
                        <Activity className="w-12 h-12 mx-auto mb-3 text-gray-600" />
                        <p>No matching activity found.</p>
                      </div>
                    );
                  }
                  return (
                    <Table>
                      <TableHeader>
                        <TableRow className="border-[#00D4FF]/20 hover:bg-transparent">
                          <TableHead className="text-gray-400">User</TableHead>
                          <TableHead className="text-gray-400">Action</TableHead>
                          <TableHead className="text-gray-400">Type</TableHead>
                          <TableHead className="text-gray-400">When</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filtered.map(log => (
                          <TableRow key={log.id} className="border-[#00D4FF]/20 hover:bg-white/5">
                            <TableCell className="text-white font-medium">{log.userName}</TableCell>
                            <TableCell className="text-gray-300">{log.action}</TableCell>
                            <TableCell>
                              <Badge className={
                                log.type === 'warning' ? 'bg-red-500/20 text-red-400' :
                                log.type === 'success' ? 'bg-green-500/20 text-green-400' :
                                'bg-blue-500/20 text-blue-400'
                              }>{log.type}</Badge>
                            </TableCell>
                            <TableCell className="text-gray-400 text-sm">
                              {(log as any).createdAt?.toDate?.().toLocaleString() || '—'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  );
                })()}
              </Card>
            </motion.div>
          )}

          {/* ════════════════ SUBSCRIPTION ════════════════ */}
          {activePage === 'subscription' && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
              <div>
                <h1 className="text-3xl font-bold text-white mb-2">Subscription Plans</h1>
                <p className="text-gray-400">Choose the plan that best fits your organization's needs</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[
                  { name: 'Starter', price: 'Rs. 500', period: '/month', features: ['Up to 5 org projects', 'Up to 5 team members', 'All 5 SDLC phases', 'Team & project management', 'Phase review workflow', 'Basic PDF reports'] },
                  { name: 'Business', price: 'Rs. 1,000', period: '/month', popular: true, features: ['Unlimited org projects', 'Unlimited team members', 'All 5 SDLC phases', 'AI-powered analysis', 'Phase review workflow', 'Vulnerability assignment', 'Consolidated reports', 'Priority support'] }
                ].map((plan) => {
                  const isActive = currentPlan === plan.name;
                  const planOrder = ['Starter', 'Business'];
                  const isHigher = planOrder.indexOf(plan.name) > planOrder.indexOf(currentPlan);
                  const isDisabled = !planToggles[plan.name as keyof typeof planToggles];
                  return (
                    <Card key={plan.name} className={`p-6 bg-white/5 backdrop-blur-sm border relative ${isActive ? 'border-[#00D4FF]' : 'border-[#00D4FF]/20'} ${isDisabled ? 'opacity-50' : ''}`}>
                      {(plan as any).popular && (
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                          <Badge className="bg-[#00D4FF] text-white">Most Popular</Badge>
                        </div>
                      )}
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xl font-semibold text-white">{plan.name}</h3>
                        <Switch
                          checked={planToggles[plan.name as keyof typeof planToggles]}
                          onCheckedChange={() => setPlanToggles(prev => ({ ...prev, [plan.name]: !prev[plan.name as keyof typeof planToggles] }))}
                        />
                      </div>
                      <div className="mb-6">
                        <span className="text-3xl font-bold text-white">{plan.price}</span>
                        <span className="text-gray-400">{plan.period}</span>
                      </div>
                      <div className="space-y-2 mb-6">
                        {plan.features.map((f, i) => (
                          <div key={i} className="flex items-center gap-2 text-sm">
                            <Check className="w-4 h-4 text-[#00D4FF] flex-shrink-0" />
                            <span className="text-gray-300">{f}</span>
                          </div>
                        ))}
                      </div>
                      {isActive ? (
                        <Button className="w-full bg-[#00D4FF]/20 text-[#00D4FF] border border-[#00D4FF]/50" disabled>Current Plan</Button>
                      ) : (
                        <Button className="w-full bg-[#00D4FF] text-white" disabled={isDisabled}
                          onClick={() => handlePlanChange(plan.name, isHigher ? 'upgrade' : 'downgrade')}>
                          {isHigher ? 'Upgrade' : 'Downgrade'}
                        </Button>
                      )}
                    </Card>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* ════════════════ REPORTS ════════════════ */}
          {activePage === 'reports' && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-3xl font-bold text-white">Security Reports</h1>
                  <p className="text-gray-400 text-sm mt-1">Per-project reports + org-wide executive summary</p>
                </div>
                <div className="flex gap-3">
                  <Button onClick={handleDownloadOrgReport} disabled={generatingOrgReport || projects.length === 0}
                    className="bg-gradient-to-r from-purple-600 to-purple-500 text-white">
                    {generatingOrgReport
                      ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generating…</>
                      : <><FileText className="w-4 h-4 mr-2" />Org Executive Summary</>}
                  </Button>
                  <Button onClick={loadReports} disabled={loadingReports}
                    variant="outline" className="border-[#00D4FF]/50 text-[#00D4FF]">
                    {loadingReports ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Loading…</> : 'Refresh Reports'}
                  </Button>
                  <Button onClick={downloadAllReports} className="bg-gradient-to-r from-[#00D4FF] to-[#00D4FF]/80 text-white">
                    <Download className="w-4 h-4 mr-2" />Export All
                  </Button>
                </div>
              </div>

              {reportsList.length === 0 && !loadingReports ? (
                <Card className="p-12 bg-white/5 backdrop-blur-sm border-[#00D4FF]/20 text-center">
                  <FileText className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400 text-lg">No reports yet</p>
                  <p className="text-gray-500 text-sm mt-1 mb-6">
                    Reports are generated from analysis data. Run Phase 1, 2, or 3 analysis on your projects first.
                  </p>
                  <Button onClick={loadReports} className="bg-[#00D4FF] text-white">
                    Load Reports
                  </Button>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {reportsList.map((report) => {
                    const critical = report.vulnerabilities.filter((v: any) => v.severity === 'Critical').length;
                    const high     = report.vulnerabilities.filter((v: any) => v.severity === 'High').length;
                    const medium   = report.vulnerabilities.filter((v: any) => v.severity === 'Medium').length;
                    const low      = report.vulnerabilities.filter((v: any) => v.severity === 'Low').length;
                    return (
                      <Card key={report.projectId} className="p-6 bg-white/5 backdrop-blur-sm border-[#00D4FF]/20">
                        <div className="flex items-start justify-between mb-4">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <FileText className="w-5 h-5 text-[#00D4FF]" />
                              <h3 className="text-white font-semibold">{report.projectName}</h3>
                            </div>
                            <p className="text-gray-400 text-xs">Generated: {report.generatedAt} · {report.domain}</p>
                          </div>
                          <Badge className={getRiskColor(report.riskScore)}>Risk: {report.riskScore}</Badge>
                        </div>

                        <div className="grid grid-cols-4 gap-2 mb-4">
                          {[
                            { label: 'Critical', count: critical, color: 'text-red-400' },
                            { label: 'High',     count: high,     color: 'text-orange-400' },
                            { label: 'Medium',   count: medium,   color: 'text-yellow-400' },
                            { label: 'Low',      count: low,      color: 'text-green-400' },
                          ].map(s => (
                            <div key={s.label} className="text-center bg-white/5 rounded-lg p-2">
                              <div className={`text-xl font-bold ${s.color}`}>{s.count}</div>
                              <div className="text-xs text-gray-500">{s.label}</div>
                            </div>
                          ))}
                        </div>

                        <div className="flex items-center justify-between text-sm mb-4">
                          <span className="text-gray-400">Total issues:</span>
                          <span className="text-white font-medium">{report.vulnerabilities.length}</span>
                        </div>

                        <Button onClick={() => downloadReport(report)}
                          className="w-full bg-[#00D4FF] text-white">
                          <Download className="w-4 h-4 mr-2" />Download Report
                        </Button>
                      </Card>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}

          {/* ════════════════ SETTINGS ════════════════ */}
          {activePage === 'settings' && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              <h1 className="text-3xl font-bold text-white">Settings</h1>

              {/* Org Settings */}
              <Card className="p-6 bg-white/5 backdrop-blur-sm border-[#00D4FF]/20">
                <h2 className="text-xl font-semibold text-white mb-6">Organization Settings</h2>
                <div className="space-y-4">
                  <div>
                    <Label className="text-white mb-2 block">Organization Name</Label>
                    <Input
                      id="org-name-input"
                      defaultValue={user?.orgId ? '' : 'My Organization'}
                      placeholder="Enter organization name"
                      className="bg-white/5 border-[#00D4FF]/20 text-white mt-2"
                      onFocus={async e => {
                        if (!user?.orgId || e.target.value) return;
                        const { doc: fbDoc, getDoc } = await import('firebase/firestore');
                        const snap = await getDoc(fbDoc(db, 'organizations', user.orgId));
                        if (snap.exists()) e.target.value = snap.data().name ?? '';
                      }}
                    />
                  </div>
                  <div>
                    <Label className="text-white mb-2 block">Industry</Label>
                    <select
                      id="org-industry-input"
                      className="w-full bg-white/5 border border-[#00D4FF]/20 text-white rounded-lg px-3 py-2 mt-2"
                    >
                      {['Technology','Finance','Healthcare','Education','Retail','Manufacturing','Government','Other'].map(i => (
                        <option key={i} value={i.toLowerCase()} className="bg-[#0A0E1A]">{i}</option>
                      ))}
                    </select>
                  </div>
                  <Button
                    className="bg-[#00D4FF] text-white"
                    onClick={async () => {
                      if (!user?.orgId) return;
                      const name = (document.getElementById('org-name-input') as HTMLInputElement)?.value;
                      const industry = (document.getElementById('org-industry-input') as HTMLSelectElement)?.value;
                      try {
                        await updateDoc(doc(db, 'organizations', user.orgId), {
                          name: name || undefined, industry: industry || undefined,
                        });
                        toast.success('Organization settings saved');
                      } catch { toast.error('Failed to save settings'); }
                    }}
                  >Save Changes</Button>
                </div>
              </Card>

              {/* Role Management */}
              <Card className="p-6 bg-white/5 backdrop-blur-sm border-[#00D4FF]/20">
                <h2 className="text-xl font-semibold text-white mb-2">Role Management</h2>
                <p className="text-gray-400 text-sm mb-6">Manage employee roles within your organization</p>
                <div className="space-y-3">
                  {members.length === 0 ? (
                    <p className="text-gray-500 text-sm">No employees yet. Invite employees to manage their roles.</p>
                  ) : members.map(member => (
                    <div key={member.userId ?? member.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10">
                      <div>
                        <p className="text-white font-medium">{member.fullName}</p>
                        <p className="text-gray-400 text-xs">{member.email}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge className={member.status === 'active' ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-red-500/20 text-red-400 border-red-500/30'}>
                          {member.status}
                        </Badge>
                        <select
                          defaultValue={(member as any).role ?? 'employee'}
                          onChange={async e => {
                            if (!user?.orgId) return;
                            const memberId = member.userId ?? member.id;
                            try {
                              await updateDoc(doc(db, 'organizations', user.orgId, 'members', memberId), {
                                role: e.target.value,
                              });
                              await updateDoc(doc(db, 'users', memberId), { role: e.target.value }).catch(() => {});
                              toast.success(`${member.fullName}'s role updated to ${e.target.value}`);
                            } catch { toast.error('Failed to update role'); }
                          }}
                          className="bg-white/5 border border-[#00D4FF]/20 text-white rounded-lg px-2 py-1 text-sm"
                        >
                          <option value="employee" className="bg-[#0A0E1A]">Employee</option>
                          <option value="team_lead" className="bg-[#0A0E1A]">Team Lead</option>
                          <option value="manager" className="bg-[#0A0E1A]">Manager</option>
                          <option value="reviewer" className="bg-[#0A0E1A]">Reviewer</option>
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </motion.div>
          )}

        </div>
      </div>

      {/* ════════════════ DIALOGS ════════════════ */}

      {/* ── Project Detail Drill-Down Dialog ──────────────────────────────── */}
      <Dialog open={!!selectedProjectDetail} onOpenChange={open => { if (!open) setSelectedProjectDetail(null); }}>
        <DialogContent className="bg-[#0F1629] border-[#00D4FF]/20 max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white text-xl flex items-center gap-2">
              <FolderKanban className="w-5 h-5 text-[#00D4FF]" />
              {selectedProjectDetail?.name}
            </DialogTitle>
            <DialogDescription className="text-gray-400 text-sm">{selectedProjectDetail?.description}</DialogDescription>
          </DialogHeader>

          {loadingProjectDetail ? (
            <div className="flex items-center justify-center py-12 text-gray-400">
              <Loader2 className="w-6 h-6 animate-spin mr-2" />Loading project details…
            </div>
          ) : selectedProjectDetail && (
            <div className="space-y-6 pt-2">

              {/* Stats row */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Risk Score', value: `${selectedProjectDetail.riskScore ?? 0}/100`,
                    color: (selectedProjectDetail.riskScore ?? 0) >= 70 ? 'text-red-400' : (selectedProjectDetail.riskScore ?? 0) >= 40 ? 'text-yellow-400' : 'text-green-400' },
                  { label: 'Progress', value: `${selectedProjectDetail.progress ?? 0}%`, color: 'text-[#00D4FF]' },
                  { label: 'Phase', value: phaseLabel[selectedProjectDetail.currentPhase] || selectedProjectDetail.currentPhase, color: 'text-purple-400', noCapitalize: true },
                ].map(s => (
                  <div key={s.label} className="bg-white/5 rounded-lg p-3 text-center">
                    <p className={`text-xl font-bold ${s.color} ${(s as any).noCapitalize ? '' : 'capitalize'}`}>{s.value}</p>
                    <p className="text-xs text-gray-400 mt-1">{s.label}</p>
                  </div>
                ))}
              </div>

              {/* SDLC Phases */}
              <div>
                <h4 className="text-white font-semibold text-sm mb-3 flex items-center gap-2">
                  <GitBranch className="w-4 h-4 text-[#00D4FF]" /> SDLC Phase Progress
                  <span className="text-xs text-gray-500 font-normal ml-1">— Approve submitted phases to mark them complete</span>
                </h4>
                <div className="space-y-2">
                  {(['requirement', 'design', 'development', 'sca', 'pipeline', 'crossphase'] as const).map(phase => {
                    const phaseData = projectDetailPhases[phase];
                    const completion = phaseData?.completion ?? 0;
                    const status = phaseData?.status ?? 'not-started';
                    const phaseLabelMap: Record<string, string> = { requirement: 'Requirements Analysis', design: 'Threat Modeling (STRIDE)', development: 'Code Review (SAST)', sca: 'Dependency Scanning (SCA)', pipeline: 'Pipeline Security', crossphase: 'Cross-Phase Consistency' };
                    const statusColor = status === 'completed' ? 'bg-green-500/20 text-green-400'
                      : status === 'submitted' ? 'bg-yellow-500/20 text-yellow-400'
                      : status === 'needs-revision' ? 'bg-red-500/20 text-red-400'
                      : 'bg-gray-500/20 text-gray-400';
                    const statusLabel = status === 'not-started' ? 'Not Started'
                      : status === 'submitted' ? 'Awaiting Review'
                      : status === 'needs-revision' ? 'Needs Revision'
                      : status === 'completed' ? 'Approved ✓'
                      : status;
                    return (
                      <div key={phase} className="bg-white/5 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-gray-300 text-sm">{phaseLabelMap[phase]}</span>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor}`}>{statusLabel}</span>
                            <span className="text-xs text-gray-400">{completion}%</span>
                          </div>
                        </div>
                        <div className="w-full bg-white/5 rounded-full h-1.5 mb-2">
                          <div className={`h-1.5 rounded-full transition-all ${
                            status === 'completed' ? 'bg-green-500' :
                            status === 'submitted' ? 'bg-yellow-500' : 'bg-[#00D4FF]'
                          }`} style={{ width: `${completion}%` }} />
                        </div>

                        {/* ── Analysis Result Preview — what the org admin is reviewing ── */}
                        {(status === 'submitted' || status === 'completed') && phaseData?.analysisData && (() => {
                          const ad = phaseData.analysisData;
                          // Pipeline stores findings flat on analysisData (no .result wrapper)
                          const result = ad.result ?? (phase === 'pipeline' ? ad : null);
                          if (!result) return null;

                          // Collect findings depending on phase type
                          const findings: Array<{ severity: string; text: string }> = [];

                          if (phase === 'requirement') {
                            (result.findings ?? []).slice(0, 4).forEach((f: any) =>
                              findings.push({ severity: f.severity ?? 'Medium', text: f.issue ?? f.description ?? '' })
                            );
                          } else if (phase === 'design') {
                            (result.threats ?? []).slice(0, 4).forEach((t: any) =>
                              findings.push({ severity: t.severity ?? t.riskLevel ?? 'Medium', text: `[${t.category ?? 'STRIDE'}] ${t.description?.slice(0, 80) ?? ''}` })
                            );
                          } else if (phase === 'development') {
                            (result.vulnerabilities ?? []).slice(0, 4).forEach((v: any) =>
                              findings.push({ severity: v.severity ?? 'Medium', text: v.type ?? v.description?.slice(0, 80) ?? '' })
                            );
                          } else if (phase === 'sca') {
                            (result.vulnerabilities ?? ad.vulnerabilities ?? []).slice(0, 4).forEach((v: any) =>
                              findings.push({ severity: v.severity ?? 'Medium', text: `${v.package ?? ''}: ${v.title ?? v.id ?? ''}`.trim() })
                            );
                          } else if (phase === 'pipeline') {
                            (ad.findings ?? []).slice(0, 4).forEach((f: any) =>
                              findings.push({ severity: f.severity ?? 'Medium', text: `${f.rule ?? ''}: ${f.description?.slice(0, 70) ?? ''}`.trim() })
                            );
                          } else if (phase === 'crossphase') {
                            (result.conflicts ?? []).slice(0, 2).forEach((c: any) =>
                              findings.push({ severity: 'High', text: c.description?.slice(0, 80) ?? '' })
                            );
                            (result.warnings ?? []).slice(0, 2).forEach((w: any) =>
                              findings.push({ severity: 'Medium', text: w.description?.slice(0, 80) ?? '' })
                            );
                          }

                          const riskScore = result.riskScore ?? result.securityScore ?? null;
                          const submittedByEmail = phaseData.submittedBy ? members.find(m => m.userId === phaseData.submittedBy)?.email ?? phaseData.submittedBy : null;

                          return (
                            <div className="bg-black/20 rounded-lg p-3 mb-2 border border-white/5">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs text-gray-400">
                                  {submittedByEmail ? `Submitted by: ${submittedByEmail}` : 'Analysis result'}
                                </span>
                                {riskScore !== null && (
                                  <span className={`text-xs font-bold ${riskScore >= 70 ? 'text-red-400' : riskScore >= 40 ? 'text-yellow-400' : 'text-green-400'}`}>
                                    Risk: {riskScore}/100
                                  </span>
                                )}
                              </div>
                              {findings.length === 0 ? (
                                <p className="text-xs text-green-400">✓ No significant findings detected</p>
                              ) : (
                                <div className="space-y-1">
                                  {findings.map((f, i) => (
                                    <div key={i} className="flex items-start gap-2">
                                      <span className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${
                                        f.severity.toLowerCase() === 'critical' ? 'bg-red-500/20 text-red-400' :
                                        f.severity.toLowerCase() === 'high' ? 'bg-orange-500/20 text-orange-400' :
                                        f.severity.toLowerCase() === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                                        'bg-gray-500/20 text-gray-400'
                                      }`}>{f.severity}</span>
                                      <span className="text-xs text-gray-300 line-clamp-1">{f.text}</span>
                                    </div>
                                  ))}
                                  {(() => {
                                    const total = phase === 'requirement' ? (result.findings ?? []).length
                                      : phase === 'design' ? (result.threats ?? []).length
                                      : phase === 'development' ? (result.vulnerabilities ?? []).length
                                      : phase === 'sca' ? (result.vulnerabilities ?? ad.vulnerabilities ?? []).length
                                      : phase === 'pipeline' ? (ad.findings ?? []).length
                                      : (result.conflicts?.length ?? 0) + (result.warnings?.length ?? 0);
                                    return total > 4 ? <p className="text-xs text-gray-500 mt-1">+{total - 4} more findings</p> : null;
                                  })()}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                        {status === 'submitted' && selectedProjectDetail && (
                          <div className="mt-2 space-y-2">
                            {rejectingPhase === phase ? (
                              <div className="space-y-2">
                                <Input
                                  value={rejectionReason}
                                  onChange={e => setRejectionReason(e.target.value)}
                                  placeholder="Reason for revision (optional)"
                                  className="bg-white/5 border-red-500/30 text-white text-xs h-8"
                                  autoFocus
                                />
                                <div className="flex gap-2">
                                  <button
                                    onClick={async () => {
                                      try {
                                        const { auth } = await import('../../lib/firebase');
                                        const token = await auth.currentUser?.getIdToken() ?? '';
                                        const BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
                                        const r = await fetch(`${BASE}/api/analysis/reject-phase`, {
                                          method: 'POST',
                                          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                          body: JSON.stringify({ projectId: selectedProjectDetail.id, phase, reason: rejectionReason }),
                                        });
                                        const d = await r.json();
                                        if (!r.ok) throw new Error(d.error || 'Failed');
                                        setProjectDetailPhases(prev => ({ ...prev, [phase]: { ...prev[phase], status: 'needs-revision', rejectionReason } }));
                                        toast.success(`${phaseLabelMap[phase]} sent back for revision`);
                                        setRejectingPhase(null); setRejectionReason('');
                                      } catch { toast.error('Reject failed'); }
                                    }}
                                    className="flex-1 text-xs py-1.5 rounded-lg bg-red-500/30 hover:bg-red-500/40 text-red-300 border border-red-500/30 transition-colors"
                                  >Send Back</button>
                                  <button onClick={() => { setRejectingPhase(null); setRejectionReason(''); }}
                                    className="px-3 text-xs py-1.5 rounded-lg bg-white/5 text-gray-400 border border-white/10">Cancel</button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex gap-2">
                                <button
                                  onClick={async () => {
                                    try {
                                      const { auth } = await import('../../lib/firebase');
                                      const token = await auth.currentUser?.getIdToken() ?? '';
                                      const BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
                                      const r = await fetch(`${BASE}/api/analysis/approve-phase`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                        body: JSON.stringify({ projectId: selectedProjectDetail.id, phase }),
                                      });
                                      const d = await r.json();
                                      if (!r.ok) throw new Error(d.error || 'Failed');
                                      setProjectDetailPhases(prev => ({ ...prev, [phase]: { ...prev[phase], status: 'completed' } }));
                                      toast.success(`${phaseLabelMap[phase]} approved ✓`);
                                    } catch (e: any) { toast.error('Approve failed: ' + (e?.message || 'unknown')); }
                                  }}
                                  className="flex-1 text-xs py-1.5 rounded-lg bg-green-500/20 hover:bg-green-500/30 text-green-400 border border-green-500/30 transition-colors font-semibold"
                                >✓ Approve</button>
                                <button
                                  onClick={() => { setRejectingPhase(phase); setRejectionReason(''); }}
                                  className="flex-1 text-xs py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 transition-colors font-semibold"
                                >↩ Request Revision</button>
                              </div>
                            )}
                          </div>
                        )}
                        {status === 'needs-revision' && phaseData?.rejectionReason && (
                          <p className="text-xs text-red-300 mt-1">Reason: {phaseData.rejectionReason}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Team Members on this Project */}
              <div>
                <h4 className="text-white font-semibold text-sm mb-3 flex items-center gap-2">
                  <Users className="w-4 h-4 text-[#00D4FF]" /> Assigned Team
                </h4>
                {(() => {
                  const linkedTeam = teams.find(t => t.projectId === selectedProjectDetail.id);
                  if (!linkedTeam) return <p className="text-gray-500 text-sm">No team assigned to this project.</p>;
                  const teamMembers = members.filter(m =>
                    ((linkedTeam as any).memberIds ?? []).includes(m.userId) || m.userId === linkedTeam.leadUserId
                  );
                  return (
                    <div className="bg-white/5 rounded-lg p-3 space-y-2">
                      <p className="text-[#00D4FF] text-sm font-medium">{linkedTeam.name}</p>
                      {teamMembers.length === 0 ? (
                        <p className="text-gray-500 text-xs">No members assigned yet.</p>
                      ) : teamMembers.map(m => (
                        <div key={m.userId} className="flex items-center gap-3">
                          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#00D4FF] to-purple-600 flex items-center justify-center text-[10px] text-white font-semibold flex-shrink-0">
                            {m.fullName?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-white text-xs font-medium">{m.fullName}</p>
                            <p className="text-gray-500 text-xs">{m.email}{m.userId === linkedTeam.leadUserId ? ' · Lead' : ''}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>

              {/* Vulnerabilities */}
              <div>
                <h4 className="text-white font-semibold text-sm mb-3 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                  Vulnerabilities ({projectDetailVulns.length})
                  {projectDetailVulns.filter(v => v.severity === 'Critical' || v.severity === 'critical').length > 0 && (
                    <Badge className="bg-red-500/20 text-red-400 text-xs">
                      {projectDetailVulns.filter(v => v.severity === 'Critical' || v.severity === 'critical').length} critical
                    </Badge>
                  )}
                </h4>
                {projectDetailVulns.length === 0 ? (
                  <p className="text-gray-500 text-sm">No vulnerabilities recorded yet.</p>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {projectDetailVulns.slice(0, 15).map((v: any) => (
                      <div key={v.id} className="bg-white/5 rounded-lg p-3 flex items-start gap-3">
                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5 ${
                          v.severity === 'Critical' || v.severity === 'critical' ? 'bg-red-500/20 text-red-400' :
                          v.severity === 'High' || v.severity === 'high' ? 'bg-orange-500/20 text-orange-400' :
                          'bg-yellow-500/20 text-yellow-400'
                        }`}>{v.severity}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-gray-300 text-xs font-medium">{v.title || v.description?.slice(0, 80)}</p>
                          {v.recommendation && <p className="text-gray-500 text-xs mt-0.5">Fix: {v.recommendation?.slice(0, 80)}</p>}
                          {v.assignedToName && (
                            <p className="text-[#00D4FF] text-xs mt-0.5">Assigned to: {v.assignedToName}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {v.isResolved ? (
                            <Badge className="bg-green-500/20 text-green-400 text-xs">Resolved</Badge>
                          ) : (
                            <>
                              {/* Assign button */}
                              <button
                                onClick={() => handleOpenAssignDialog(v)}
                                className="text-xs px-2 py-1 rounded bg-[#00D4FF]/10 text-[#00D4FF] hover:bg-[#00D4FF]/20 transition-colors"
                                title="Assign to employee"
                              >
                                {v.assignedToName ? 'Reassign' : 'Assign'}
                              </button>
                              {/* Resolve button */}
                              <button
                                onClick={() => handleResolveVuln(v)}
                                disabled={resolvingVulnId === v.id}
                                className="text-xs px-2 py-1 rounded bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors disabled:opacity-50"
                                title="Mark as resolved"
                              >
                                {resolvingVulnId === v.id ? '...' : 'Resolve'}
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent Activity */}
              <div>
                <h4 className="text-white font-semibold text-sm mb-3 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-[#00D4FF]" /> Recent Activity
                </h4>
                {projectDetailActivity.length === 0 ? (
                  <p className="text-gray-500 text-sm">No activity recorded yet. Activity appears once team members run analyses.</p>
                ) : (
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {projectDetailActivity.slice(0, 8).map((log: any) => (
                      <div key={log.id} className="bg-white/5 rounded-lg p-2.5">
                        <p className="text-gray-300 text-xs">{log.action}</p>
                        <p className="text-gray-500 text-xs mt-0.5">{log.userName} · {log.createdAt?.toDate?.().toLocaleString() || '—'}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* View Employee */}
      <Dialog open={showEmployeeViewDialog} onOpenChange={setShowEmployeeViewDialog}>
        <DialogContent className="bg-[#0F1629] border-[#00D4FF]/20 max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white text-2xl">Employee Details</DialogTitle>
          </DialogHeader>
          {selectedEmployee && (() => {
            const employeeTeams = teams.filter(t => {
              const tAny = t as any;
              return tAny.memberIds?.includes(selectedEmployee.userId) || t.leadUserId === selectedEmployee.userId;
            });
            const linkedProjectNames = [...new Set(employeeTeams.map(t => t.projectName).filter(Boolean))];
            const activitySource = auditLogs.length > 0 ? auditLogs : activityLogs;
            const employeeActivity = activitySource.filter((log: any) => log.userId === selectedEmployee.userId);
            const lastActive = employeeActivity[0] as any;

            // Per-employee contribution stats
            const analysesRun = employeeActivity.filter((log: any) =>
              log.action?.toLowerCase().includes('analysis') ||
              log.action?.toLowerCase().includes('review') ||
              log.action?.toLowerCase().includes('scan') ||
              log.action?.toLowerCase().includes('mapping')
            ).length;
            const criticalFound = employeeActivity.filter((log: any) =>
              log.type === 'warning'
            ).length;
            const thisMonth = employeeActivity.filter((log: any) => {
              const d = log.createdAt?.toDate?.();
              return d && d.getMonth() === new Date().getMonth() && d.getFullYear() === new Date().getFullYear();
            }).length;

            return (
              <div className="space-y-4 pt-2">
                {/* Basic Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div><Label className="text-gray-400">Name</Label><p className="text-white font-medium mt-1">{selectedEmployee.fullName}</p></div>
                  <div><Label className="text-gray-400">Job Title</Label><p className="text-white font-medium mt-1">{selectedEmployee.jobTitle || '—'}</p></div>
                  <div><Label className="text-gray-400">Department</Label><p className="text-white font-medium mt-1">{selectedEmployee.department || '—'}</p></div>
                  <div><Label className="text-gray-400">Email</Label><p className="text-white font-medium mt-1 text-sm">{selectedEmployee.email}</p></div>
                  <div><Label className="text-gray-400">Status</Label><div className="mt-1"><Badge className={getStatusColor(selectedEmployee.status)}>{selectedEmployee.status}</Badge></div></div>
                  <div><Label className="text-gray-400">Last Active</Label><p className="text-white text-sm mt-1">{lastActive?.createdAt?.toDate?.().toLocaleString() || 'No activity yet'}</p></div>
                </div>

                {/* Contribution Stats */}
                <div className="border-t border-[#00D4FF]/20 pt-4">
                  <Label className="text-gray-400 text-xs mb-3 block">Contribution Stats</Label>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'Total Analyses', value: analysesRun, color: 'text-[#00D4FF]' },
                      { label: 'Critical Flags', value: criticalFound, color: criticalFound > 0 ? 'text-red-400' : 'text-green-400' },
                      { label: 'This Month', value: thisMonth, color: 'text-purple-400' },
                    ].map(stat => (
                      <div key={stat.label} className="bg-white/5 rounded-lg p-3 text-center">
                        <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                        <p className="text-xs text-gray-400 mt-1">{stat.label}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Teams */}
                <div className="border-t border-[#00D4FF]/20 pt-4">
                  <Label className="text-gray-400 text-xs mb-2 block">Teams ({employeeTeams.length})</Label>
                  {employeeTeams.length === 0 ? (
                    <p className="text-gray-500 text-sm">Not assigned to any team yet.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {employeeTeams.map(t => (
                        <Badge key={t.id} className="bg-[#00D4FF]/10 text-[#00D4FF] border border-[#00D4FF]/30">
                          {t.name}{t.leadUserId === selectedEmployee.userId ? ' (Lead)' : ''}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                {/* Linked Projects */}
                <div className="border-t border-[#00D4FF]/20 pt-4">
                  <Label className="text-gray-400 text-xs mb-2 block">Linked Projects ({linkedProjectNames.length})</Label>
                  {linkedProjectNames.length === 0 ? (
                    <p className="text-gray-500 text-sm">No project access via teams yet.</p>
                  ) : (
                    <div className="space-y-1">
                      {(linkedProjectNames as string[]).map((name, i) => (
                        <p key={i} className="text-[#00D4FF] text-sm flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#00D4FF] flex-shrink-0" />
                          {name}
                        </p>
                      ))}
                    </div>
                  )}
                </div>

                {/* Recent Activity */}
                <div className="border-t border-[#00D4FF]/20 pt-4">
                  <Label className="text-gray-400 text-xs mb-2 block">Recent Activity ({employeeActivity.length})</Label>
                  {employeeActivity.length === 0 ? (
                    <p className="text-gray-500 text-sm">No activity recorded for this employee yet.</p>
                  ) : (
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {employeeActivity.slice(0, 8).map((log: any) => (
                        <div key={log.id} className="text-sm bg-white/5 rounded-lg p-2">
                          <div className="flex items-center gap-2">
                            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${log.type === 'warning' ? 'bg-red-400' : 'bg-green-400'}`} />
                            <p className="text-gray-300">{log.action}</p>
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5 ml-3.5">{log.createdAt?.toDate?.().toLocaleString() || '—'}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <Button onClick={() => setShowEmployeeViewDialog(false)} className="w-full bg-[#00D4FF] text-white mt-4">Close</Button>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Edit Employee */}
      <Dialog open={showEmployeeEditDialog} onOpenChange={setShowEmployeeEditDialog}>
        <DialogContent className="bg-[#0F1629] border-[#00D4FF]/20">
          <DialogHeader>
            <DialogTitle className="text-white text-2xl">Edit Employee</DialogTitle>
          </DialogHeader>
          {selectedEmployee && (
            <div className="space-y-4 pt-2">
              <div>
                <Label className="text-white mb-2 block">Full Name</Label>
                <Input
                  id="edit-fullname"
                  defaultValue={selectedEmployee.fullName}
                  className="bg-white/5 border-[#00D4FF]/20 text-white mt-1"
                />
              </div>
              <div>
                <Label className="text-white mb-2 block">Job Title</Label>
                <Input
                  id="edit-jobtitle"
                  defaultValue={selectedEmployee.jobTitle}
                  className="bg-white/5 border-[#00D4FF]/20 text-white mt-1"
                />
              </div>
              <div>
                <Label className="text-white mb-2 block">Department</Label>
                <Input
                  id="edit-dept"
                  defaultValue={selectedEmployee.department}
                  className="bg-white/5 border-[#00D4FF]/20 text-white mt-1"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <Button
                  onClick={async () => {
                    const fullName  = (document.getElementById('edit-fullname')  as HTMLInputElement)?.value ?? selectedEmployee.fullName;
                    const jobTitle  = (document.getElementById('edit-jobtitle')  as HTMLInputElement)?.value ?? selectedEmployee.jobTitle;
                    const department = (document.getElementById('edit-dept')     as HTMLInputElement)?.value ?? selectedEmployee.department;
                    if (!user?.orgId) return;
                    try {
                      await updateDoc(
                        doc(db, 'organizations', user.orgId, 'members', selectedEmployee.userId ?? selectedEmployee.id),
                        { fullName, jobTitle, department, updatedAt: new Date().toISOString() }
                      );
                      // Also update users/{uid} profile
                      await updateDoc(
                        doc(db, 'users', selectedEmployee.userId ?? selectedEmployee.id),
                        { fullName, jobTitle, department }
                      ).catch(() => {});
                      setMembers(prev => prev.map(m =>
                        (m.userId ?? m.id) === (selectedEmployee.userId ?? selectedEmployee.id)
                          ? { ...m, fullName, jobTitle, department }
                          : m
                      ));
                      toast.success('Employee updated successfully');
                      setShowEmployeeEditDialog(false);
                    } catch (err) {
                      console.error(err);
                      toast.error('Failed to update employee');
                    }
                  }}
                  className="flex-1 bg-[#00D4FF] text-white"
                >Save Changes</Button>
                <Button onClick={() => setShowEmployeeEditDialog(false)} variant="outline" className="flex-1 border-[#00D4FF]/50 text-[#00D4FF]">Cancel</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Suspend Confirm */}
      <Dialog open={showSuspendDialog} onOpenChange={setShowSuspendDialog}>
        <DialogContent className="bg-[#0F1629] border-[#00D4FF]/20">
          <DialogHeader>
            <DialogTitle className="text-white text-2xl">Confirm Suspension</DialogTitle>
            <DialogDescription className="text-gray-400">This will suspend the employee's access.</DialogDescription>
          </DialogHeader>
          {selectedEmployee && (
            <p className="text-gray-300 py-4">
              <span className="text-white font-semibold">{selectedEmployee.fullName}</span> will lose access to all projects until reactivated.
            </p>
          )}
          <div className="flex gap-3">
            <Button onClick={() => setShowSuspendDialog(false)} variant="outline" className="flex-1 border-[#00D4FF]/50 text-[#00D4FF]">Cancel</Button>
            <Button onClick={confirmSuspend} className="flex-1 bg-red-500 hover:bg-red-600 text-white">Suspend Employee</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Team Manage Dialog ─────────────────────────────────────────────── */}
      <Dialog open={showTeamManageDialog} onOpenChange={setShowTeamManageDialog}>
        <DialogContent className="bg-[#0F1629] border-[#00D4FF]/20 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white text-2xl">Manage Team</DialogTitle>
            <DialogDescription className="text-gray-400">
              {selectedTeam?.name} — {selectedTeam?.memberCount} member(s)
            </DialogDescription>
          </DialogHeader>
          {selectedTeam && (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-gray-400 text-xs">Team Name</Label>
                  <p className="text-white font-medium mt-1">{selectedTeam.name}</p>
                </div>
                <div>
                  <Label className="text-gray-400 text-xs">Team Lead</Label>
                  <p className="text-white font-medium mt-1">{selectedTeam.leadName || 'Unassigned'}</p>
                </div>
                <div>
                  <Label className="text-gray-400 text-xs">Status</Label>
                  <div className="mt-1"><Badge className={getStatusColor(selectedTeam.status)}>{selectedTeam.status}</Badge></div>
                </div>
                <div>
                  <Label className="text-gray-400 text-xs">Linked Project</Label>
                  <p className="text-[#00D4FF] font-medium mt-1">{selectedTeam.projectName || '—'}</p>
                </div>
                <div>
                  <Label className="text-gray-400 text-xs">Total Members</Label>
                  <p className="text-white font-medium mt-1">{selectedTeam.memberCount}</p>
                </div>
              </div>

              <div className="border-t border-[#00D4FF]/20 pt-4">
                <Label className="text-gray-400 text-xs mb-3 block">Team Members</Label>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {members.filter(m => {
                    const teamAny = selectedTeam as any;
                    return teamAny.memberIds?.includes(m.userId) || m.userId === selectedTeam.leadUserId;
                  }).length === 0 ? (
                    <p className="text-gray-500 text-sm">No members linked yet.</p>
                  ) : members.filter(m => {
                    const teamAny = selectedTeam as any;
                    return teamAny.memberIds?.includes(m.userId) || m.userId === selectedTeam.leadUserId;
                  }).map(m => (
                    <div key={m.id} className="flex items-center gap-3 p-2 bg-white/5 rounded-lg">
                      <div className="w-8 h-8 rounded-full bg-[#00D4FF]/20 flex items-center justify-center text-[#00D4FF] text-sm font-bold">
                        {m.fullName.charAt(0)}
                      </div>
                      <div className="flex-1">
                        <p className="text-white text-sm font-medium">{m.fullName}</p>
                        <p className="text-gray-400 text-xs">{m.jobTitle || m.department}</p>
                      </div>
                      {m.userId === selectedTeam.leadUserId && (
                        <Badge className="bg-[#00D4FF]/20 text-[#00D4FF] text-xs">Lead</Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <Button onClick={() => { setShowTeamManageDialog(false); handleEditTeam(selectedTeam!); }}
                  className="flex-1 bg-[#00D4FF] text-white">
                  Edit Team
                </Button>
                <Button onClick={() => setShowTeamManageDialog(false)}
                  variant="outline" className="flex-1 border-[#00D4FF]/50 text-[#00D4FF]">Close</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Team Edit Dialog ──────────────────────────────────────────────────── */}
      <Dialog open={showTeamEditDialog} onOpenChange={setShowTeamEditDialog}>
        <DialogContent className="bg-[#0F1629] border-[#00D4FF]/20 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white text-2xl">Edit Team</DialogTitle>
            <DialogDescription className="text-gray-400">Update team details — saved to Firebase instantly</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div>
              <Label className="text-white mb-2">Team Name *</Label>
              <Input value={editTeamName} onChange={e => setEditTeamName(e.target.value)}
                className="bg-white/5 border-[#00D4FF]/20 text-white mt-2" />
            </div>
            <div>
              <Label className="text-white mb-2">Team Lead</Label>
              <Select value={editTeamLeadId} onValueChange={setEditTeamLeadId}>
                <SelectTrigger className="bg-white/5 border-[#00D4FF]/20 text-white mt-2">
                  <SelectValue placeholder="Select team lead" />
                </SelectTrigger>
                <SelectContent className="bg-[#0A0E1A] border-[#00D4FF]/20">
                  <SelectItem value="none" className="text-gray-400">No lead</SelectItem>
                  {members.map(m => (
                    <SelectItem key={m.userId} value={m.userId} className="text-white">{m.fullName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Member picker — the key piece that was missing */}
            <div>
              <Label className="text-white mb-2">Team Members</Label>
              <p className="text-xs text-gray-500 mb-2">Select employees to include in this team</p>
              <div className="max-h-40 overflow-y-auto border border-[#00D4FF]/20 rounded-lg p-2 space-y-1 bg-white/5">
                {members.length === 0 ? (
                  <p className="text-gray-500 text-sm text-center py-2">No employees found.</p>
                ) : members.map(m => {
                  const isLead = m.userId === editTeamLeadId;
                  const isSelected = editSelectedMemberIds.includes(m.userId) || isLead;
                  return (
                    <div
                      key={m.userId}
                      onClick={() => {
                        if (isLead) return;
                        setEditSelectedMemberIds(prev =>
                          prev.includes(m.userId) ? prev.filter(id => id !== m.userId) : [...prev, m.userId]
                        );
                      }}
                      className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-colors ${
                        isSelected ? 'bg-[#00D4FF]/20' : 'hover:bg-white/5'
                      } ${isLead ? 'cursor-default' : ''}`}
                    >
                      <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                        isSelected ? 'bg-[#00D4FF] border-[#00D4FF]' : 'border-gray-500'
                      }`}>
                        {isSelected && <Check className="w-3 h-3 text-white" />}
                      </div>
                      <span className={`text-sm ${isSelected ? 'text-white' : 'text-gray-400'}`}>{m.fullName}</span>
                      {isLead && <Badge className="ml-auto text-xs bg-[#00D4FF]/20 text-[#00D4FF]">Lead</Badge>}
                    </div>
                  );
                })}
              </div>
            </div>
            <div>
              <Label className="text-white mb-2">Linked Project</Label>
              <Select value={editTeamProjectId} onValueChange={setEditTeamProjectId}>
                <SelectTrigger className="bg-white/5 border-[#00D4FF]/20 text-white mt-2">
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent className="bg-[#0A0E1A] border-[#00D4FF]/20">
                  <SelectItem value="none" className="text-gray-400">No project</SelectItem>
                  {projects.map(p => (
                    <SelectItem key={p.id} value={p.id} className="text-white">{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-3 pt-4">
              <Button onClick={handleSaveTeamEdit} disabled={savingTeam} className="flex-1 bg-[#00D4FF] text-white">
                {savingTeam ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</> : 'Save Changes'}
              </Button>
              <Button onClick={() => setShowTeamEditDialog(false)}
                variant="outline" className="flex-1 border-[#00D4FF]/50 text-[#00D4FF]">Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Plan Change Confirm */}
      <Dialog open={showPlanChangeDialog} onOpenChange={setShowPlanChangeDialog}>
        <DialogContent className="bg-[#0F1629] border-[#00D4FF]/20">
          <DialogHeader>
            <DialogTitle className="text-white text-2xl">Confirm Plan Change</DialogTitle>
            <DialogDescription className="text-gray-400">
              {targetPlan?.action === 'upgrade' ? 'Upgrade' : 'Downgrade'} to {targetPlan?.name} plan?
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 pt-4">
            <Button onClick={() => setShowPlanChangeDialog(false)} variant="outline" className="flex-1 border-[#00D4FF]/50 text-[#00D4FF]">Cancel</Button>
            <Button onClick={confirmPlanChange} className="flex-1 bg-[#00D4FF] text-white">Confirm</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── FIX 3: Assign Vulnerability Dialog ── */}
      <Dialog open={showAssignDialog} onOpenChange={open => { if (!open) { setShowAssignDialog(false); setVulnToAssign(null); } }}>
        <DialogContent className="bg-[#0F1629] border-[#00D4FF]/20 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white text-lg">Assign Vulnerability</DialogTitle>
            <DialogDescription className="text-gray-400 text-sm">Assign this issue to a team member for remediation.</DialogDescription>
          </DialogHeader>

          {vulnToAssign && (
            <div className="space-y-4 pt-2">
              <div className="bg-white/5 rounded-lg p-3">
                <span className={`text-xs font-medium px-1.5 py-0.5 rounded mr-2 ${
                  vulnToAssign.severity === 'Critical' || vulnToAssign.severity === 'critical'
                    ? 'bg-red-500/20 text-red-400'
                    : vulnToAssign.severity === 'High' || vulnToAssign.severity === 'high'
                    ? 'bg-orange-500/20 text-orange-400'
                    : 'bg-yellow-500/20 text-yellow-400'
                }`}>{vulnToAssign.severity}</span>
                <span className="text-gray-300 text-sm">
                  {vulnToAssign.title || vulnToAssign.description?.slice(0, 80)}
                </span>
              </div>

              <div>
                <label className="text-gray-300 text-sm mb-2 block">Assign to:</label>
                <select
                  value={assignToMemberId}
                  onChange={e => setAssignToMemberId(e.target.value)}
                  className="w-full bg-white/5 border border-[#00D4FF]/20 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#00D4FF]/50"
                >
                  <option value="" className="bg-[#0F1629]">-- Select employee --</option>
                  {members.filter(m => m.status !== 'suspended').map(m => (
                    <option key={m.userId} value={m.userId} className="bg-[#0F1629]">
                      {m.fullName || m.email} — {m.jobTitle || m.department || 'Employee'}
                    </option>
                  ))}
                </select>
                {members.length === 0 && (
                  <p className="text-yellow-400 text-xs mt-1">No employees loaded — go to Employees page first to load members.</p>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  onClick={handleAssignVuln}
                  disabled={!assignToMemberId || assigningVulnId === vulnToAssign.id}
                  className="flex-1 bg-[#00D4FF] text-white hover:bg-[#00D4FF]/80 disabled:opacity-50"
                >
                  {assigningVulnId === vulnToAssign.id ? 'Assigning...' : 'Assign'}
                </Button>
                <Button
                  onClick={() => { setShowAssignDialog(false); setVulnToAssign(null); }}
                  variant="outline"
                  className="flex-1 border-white/10 text-gray-400"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

    </motion.div>
  );
}
import { analysisApi } from '../../lib/apiService';
import { db } from '../../lib/firebase';
import { collection, query, orderBy, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import {
  updateUserProject,
  addUserHistoryEntry,
  addUserProjectVersion,
  updateUserProjectVersionNote,
  subscribeUserProjectHistory,
  subscribeUserProjectVersions,
  getUserStats,
  updateUserStats,
  deleteUserProject,
  saveAnalysisCache,
  loadAnalysisCache,
  saveRemediation,
  loadRemediations,
  saveBaselineScore,
  getEmployeeOrgProjects,
  sanitizeDoc,
  type OrgProjectForEmployee,
} from '../../lib/firebaseService';
import {
  generateRequirementPDF,
  generateThreatPDF,
  generateCodeReviewPDF,
  generateDependencyPDF,
  generateCrossPhasePDF,
  generateFullProjectPDF,
} from '../../lib/reportPdfGenerator';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import {
  Shield, LogOut, Upload, FolderOpen, BarChart3, AlertTriangle, CheckCircle2,
  Download, Database, Server, Globe, Smartphone, Brain, Bell, Search, Filter,
  Target, Activity, TrendingUp, TrendingDown, FileText, Eye, Calendar, PlusCircle,
  Code, Lock, FileJson, Package, GitBranch, BookOpen, Zap, Edit, ChevronDown,
  Copy, Trash2, History, Clock, User, RefreshCw, ChevronRight, X, Info,
  GitBranch as VersionIcon, RotateCcw, StickyNote, ArrowUpDown, ListFilter,
  Loader2, AlertCircle, MoreVertical, Pencil, ExternalLink, TrendingUp as TrendUp,
  ShieldAlert, BarChart2, LineChart, CheckSquare, XSquare, MinusSquare,
  Building2, Users,
} from 'lucide-react';
import { LineChart as ReLineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Label } from '../components/ui/label';
import { Progress } from '../components/ui/progress';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Switch } from '../components/ui/switch';
import { Checkbox } from '../components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '../components/ui/dialog';
import { motion, AnimatePresence } from 'motion/react';
import { PAGE_FADE, CARD_STAGGER_PARENT, CARD_STAGGER_CHILD, TAB_CROSSFADE, PROGRESS_TRANSITION } from '../../lib/motionPresets';
import { toast } from 'sonner';
import logoImage from '../../assets/logo.png';
import { UserAvatar } from '../components/UserAvatar';
import { RequirementAnalysisReport } from '../components/RequirementAnalysisReport';
import { CodeReviewReport } from '../components/CodeReviewReport';
// ProjectVersionHistory — imported only when version history dialog is open

// ─── Types ────────────────────────────────────────────────────────────────────

type HistoryAction =
  | 'project_created' | 'requirement_upload' | 'requirement_analysis'
  | 'threat_analysis' | 'code_upload' | 'code_review' | 'report_generated'
  | 'project_completed' | 'project_reopened' | 'version_created' | 'project_edited';

interface HistoryEntry {
  id: string;
  date: string;
  time: string;
  user: string;
  action: HistoryAction;
  version?: string;
  description: string;
  category: 'analysis' | 'reports' | 'versions' | 'status';
}

interface ProjectVersion {
  id: string;
  versionNumber: number;
  label: string;
  description: string;
  createdAt: string;
  createdBy: string;
  notes?: string;
  snapshot: {
    requirementResult?: any;
    threatResult?: any;
    codeAnalyzed?: boolean;
    progress?: number;
    status?: string;
  };
}

interface ProjectExtra {
  status: string;
  progress: number;
  riskScore: number;
  completedAt?: string;
  reopenedAt?: string;
  history: HistoryEntry[];
  versions: ProjectVersion[];
  currentPhase?: string;
  domain?: string;
  assignedTo?: string;
  createdAt?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// FIX: phase keys were rendered raw + capitalized (e.g. "development" -> "Development
// Phase"), which doesn't match how the platform actually labels these phases anywhere
// else (ProjectVersionHistory.tsx's PHASE_CONFIG, OrgAdminDashboard.tsx's phaseLabel).
// This also covers 'sca' and 'crossphase', which had no label at all before.
const PHASE_LABELS: Record<string, string> = {
  requirement: 'Requirements Analysis',
  design: 'Threat Modeling (STRIDE)',
  development: 'Code Review (SAST)',
  sca: 'Dependency Scanning (SCA)',
  pipeline: 'Pipeline Security',
  crossphase: 'Cross-Phase Consistency',
};

// Sequential phase order — each phase unlocks only after previous is approved
const PHASE_ORDER = ['requirement', 'design', 'development', 'sca', 'pipeline', 'crossphase'] as const;

function getPhaseUnlockState(phaseKey: string, orgPhaseStatus: Record<string, any>, isOrgProject: boolean): {
  locked: boolean;
  reason: string | null;
  phaseStatus: string;
} {
  if (!isOrgProject) return { locked: false, reason: null, phaseStatus: 'available' };

  const idx = PHASE_ORDER.indexOf(phaseKey as any);
  if (idx === -1) return { locked: false, reason: null, phaseStatus: 'available' };

  const myStatus = orgPhaseStatus[phaseKey]?.status ?? 'not-started';

  // First phase always available
  if (idx === 0) return { locked: false, reason: null, phaseStatus: myStatus };

  // Check if previous phase is approved
  const prevPhase = PHASE_ORDER[idx - 1];
  const prevStatus = orgPhaseStatus[prevPhase]?.status ?? 'not-started';
  if (prevStatus !== 'completed') {
    return {
      locked: true,
      reason: `Complete "${PHASE_LABELS[prevPhase]}" first (awaiting approval)`,
      phaseStatus: myStatus,
    };
  }

  return { locked: false, reason: null, phaseStatus: myStatus };
}
function phaseLabel(phase?: string | null): string {
  if (!phase) return '—';
  return PHASE_LABELS[phase] ?? phase;
}

function makeHistoryEntry(
  action: HistoryAction,
  description: string,
  user: string,
  version?: string
): HistoryEntry {
  const now = new Date();
  const cat: Record<HistoryAction, HistoryEntry['category']> = {
    project_created:       'status',
    project_completed:     'status',
    project_reopened:      'status',
    project_edited:        'status',
    requirement_upload:    'analysis',
    requirement_analysis:  'analysis',
    threat_analysis:       'analysis',
    code_upload:           'analysis',
    code_review:           'analysis',
    report_generated:      'reports',
    version_created:       'versions',
  };
  return {
    id: `h_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    date: now.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }),
    time: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    user,
    action,
    version,
    description,
    category: cat[action],
  };
}

function actionLabel(action: HistoryAction): string {
  const map: Record<HistoryAction, string> = {
    project_created:      'Project Created',
    requirement_upload:   'Requirements Uploaded',
    requirement_analysis: 'Requirement Analysis',
    threat_analysis:      'Threat Modeling',
    code_upload:          'Code Uploaded',
    code_review:          'Code Review',
    report_generated:     'Report Generated',
    project_completed:    'Project Completed',
    project_reopened:     'Project Reopened',
    version_created:      'Version Created',
    project_edited:       'Project Edited',
  };
  return map[action] ?? action;
}

function actionColor(action: HistoryAction): string {
  if (['project_completed', 'report_generated'].includes(action)) return 'text-green-400 bg-green-500/10 border-green-500/20';
  if (['project_reopened'].includes(action)) return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20';
  if (['project_created'].includes(action)) return 'text-[#00D4FF] bg-[#00D4FF]/10 border-[#00D4FF]/20';
  if (['version_created'].includes(action)) return 'text-purple-400 bg-purple-500/10 border-purple-500/20';
  return 'text-gray-300 bg-white/5 border-white/10';
}

// ─── PortalSection ────────────────────────────────────────────────────────────

interface PortalSectionProps {
  currentProject?: any;
  projectExtra?: ProjectExtra;
  onCreateProject: () => void;
  onGoOverview: () => void;
  onNavigate: (tab: string) => void;
  onMarkComplete?: () => void;
  onFullReport?: () => void;
  activeTab?: string;
}

function PortalSection({ currentProject, projectExtra, onCreateProject, onGoOverview, onNavigate, onMarkComplete, onFullReport, activeTab }: PortalSectionProps) {
  const navLinks = [
    { label: 'Requirements', tab: 'requirements', icon: FileText },
    { label: 'Design', tab: 'design', icon: Target },
    { label: 'Code Review', tab: 'code-review', icon: Code },
    { label: 'Dependencies', tab: 'dependencies', icon: Package },
    { label: 'Pipeline', tab: 'pipeline', icon: Shield },
    { label: 'Cross-Phase', tab: 'cross-phase', icon: Activity },
    { label: 'History', tab: 'history', icon: History },
    { label: 'Versions', tab: 'versions', icon: GitBranch },
  ];

  return (
    <div className="relative overflow-hidden rounded-2xl border border-[#00D4FF]/15 bg-gradient-to-br from-[#060a14] via-[#0a0e1a] to-[#060d1a] mt-8">
      <div className="absolute -top-16 -left-16 w-56 h-56 bg-[#00D4FF]/6 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-16 -right-16 w-56 h-56 bg-purple-500/6 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 p-6 md:p-8">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-6">
          <div>
            <div className="inline-flex items-center gap-2 bg-[#00D4FF]/10 border border-[#00D4FF]/20 rounded-full px-3 py-1 mb-3">
              <div className="w-1.5 h-1.5 rounded-full bg-[#00D4FF] animate-pulse" />
              <span className="text-[#00D4FF] text-xs font-medium tracking-wide">FortifyLens Platform</span>
            </div>
            <h3 className="text-white text-xl font-bold">
              {currentProject ? currentProject.name : 'Secure every phase of your lifecycle'}
            </h3>
            {currentProject && projectExtra && (
              <div className="flex flex-wrap items-center gap-3 mt-2">
                <span className={`text-xs px-2 py-0.5 rounded-full border ${
                  projectExtra.status === 'completed' ? 'bg-green-500/15 text-green-400 border-green-500/20' :
                  'bg-[#00D4FF]/10 text-[#00D4FF] border-[#00D4FF]/20'
                }`}>{projectExtra.status === 'completed' ? 'Completed' : 'In Progress'}</span>
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <GitBranch className="w-3 h-3" />
                  {projectExtra.versions.length} version{projectExtra.versions.length !== 1 ? 's' : ''}
                </span>
                {projectExtra.status !== 'completed' && (
                  <span className="text-xs text-gray-400 flex items-center gap-1">
                    <Activity className="w-3 h-3" />
                    Phase: {phaseLabel((currentProject as any).currentPhase)}
                  </span>
                )}
                {projectExtra.versions.length > 0 && (
                  <span className="text-xs text-gray-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {projectExtra.versions[projectExtra.versions.length - 1].createdAt}
                  </span>
                )}
              </div>
            )}
          </div>

          {currentProject && projectExtra?.status !== 'completed' && onMarkComplete && (
            <Button
              onClick={onMarkComplete}
              className="bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white border-0 shrink-0"
            >
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Mark Complete
            </Button>
          )}
        </div>

        {/* Quick Nav (workspace only) */}
        {currentProject && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 mb-6">
            {navLinks.map(({ label, tab, icon: Icon }) => (
              <button
                key={tab}
                onClick={() => onNavigate(tab)}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm transition-all ${
                  activeTab === tab
                    ? 'bg-[#00D4FF] border-[#00D4FF] text-white'
                    : 'bg-white/5 border-white/10 text-gray-400 hover:border-[#00D4FF]/40 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Bottom row */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-white/5">
          <div className="flex items-center gap-2 text-gray-500 text-xs">
            <Zap className="w-3.5 h-3.5 text-[#00D4FF]" />
            Each project gets its own workspace, history & version reports
          </div>
          <div className="flex items-center gap-3">
            {currentProject && onFullReport && (
              <button onClick={onFullReport} className="text-xs text-purple-400 hover:underline flex items-center gap-1">
                <Download className="w-3 h-3" />Full Project PDF
              </button>
            )}
            {currentProject && (
              <button onClick={onGoOverview} className="text-xs text-[#00D4FF] hover:underline flex items-center gap-1">
                ← Back to Overview
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── ProjectHistoryPanel ──────────────────────────────────────────────────────

interface ProjectHistoryPanelProps {
  history: HistoryEntry[];
  projectName: string;
}

function ProjectHistoryPanel({ history, projectName }: ProjectHistoryPanelProps) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'analysis' | 'reports' | 'versions' | 'status'>('all');
  const [sortAsc, setSortAsc] = useState(false);

  const filtered = history
    .filter(e => filter === 'all' || e.category === filter)
    .filter(e =>
      e.description.toLowerCase().includes(search.toLowerCase()) ||
      actionLabel(e.action).toLowerCase().includes(search.toLowerCase())
    )
    .slice()
    .sort((a, b) => sortAsc ? a.id.localeCompare(b.id) : b.id.localeCompare(a.id));

  const categoryCounts = {
    analysis: history.filter(e => e.category === 'analysis').length,
    reports: history.filter(e => e.category === 'reports').length,
    versions: history.filter(e => e.category === 'versions').length,
    status: history.filter(e => e.category === 'status').length,
  };

  const categoryIcon = (cat: string) => {
    if (cat === 'analysis') return <Brain className="w-3.5 h-3.5" />;
    if (cat === 'reports') return <FileText className="w-3.5 h-3.5" />;
    if (cat === 'versions') return <GitBranch className="w-3.5 h-3.5" />;
    if (cat === 'status') return <Activity className="w-3.5 h-3.5" />;
    return <Clock className="w-3.5 h-3.5" />;
  };

  const exportCSV = () => {
    const rows = [
      ['Date', 'Time', 'Action', 'Category', 'Version', 'Description', 'User'],
      ...filtered.map(e => [e.date, e.time, actionLabel(e.action), e.category, e.version ?? '', e.description, e.user])
    ];
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `${projectName.replace(/\s+/g, '_')}_history.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <Card className="bg-white/5 border-[#00D4FF]/20 overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 border-b border-white/5">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#00D4FF] to-[#00D4FF]/50 flex items-center justify-center shadow-lg shadow-[#00D4FF]/10">
              <History className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-white font-bold text-base">Project History</h3>
              <p className="text-xs text-gray-400 mt-0.5">{projectName} · {history.length} total entries</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setSortAsc(p => !p)}
              className="border-white/15 text-gray-400 hover:text-white text-xs h-8 px-3">
              <ArrowUpDown className="w-3.5 h-3.5 mr-1.5" />
              {sortAsc ? 'Oldest First' : 'Newest First'}
            </Button>
            <Button size="sm" variant="outline" onClick={exportCSV}
              className="border-[#00D4FF]/30 text-[#00D4FF] hover:bg-[#00D4FF]/10 text-xs h-8 px-3">
              <Download className="w-3.5 h-3.5 mr-1.5" />Export CSV
            </Button>
          </div>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-4 gap-2 mb-4">
          {([
            { key: 'analysis', label: 'Analyses', color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
            { key: 'reports', label: 'Reports', color: 'text-green-400 bg-green-500/10 border-green-500/20' },
            { key: 'versions', label: 'Versions', color: 'text-purple-400 bg-purple-500/10 border-purple-500/20' },
            { key: 'status', label: 'Status Changes', color: 'text-[#00D4FF] bg-[#00D4FF]/10 border-[#00D4FF]/20' },
          ] as const).map(({ key, label, color }) => (
            <button key={key} onClick={() => setFilter(filter === key ? 'all' : key)}
              className={`rounded-lg border p-2.5 text-center transition-all ${filter === key ? color : 'bg-white/3 border-white/8 text-gray-500 hover:border-white/20'}`}>
              <div className={`text-lg font-bold ${filter === key ? '' : 'text-gray-300'}`}>{categoryCounts[key]}</div>
              <div className={`text-xs mt-0.5 ${filter === key ? '' : 'text-gray-500'}`}>{label}</div>
            </button>
          ))}
        </div>

        {/* Search + Filter */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <Input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search history entries..."
              className="pl-9 bg-white/5 border-white/10 text-white text-sm h-9" />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <button onClick={() => setFilter('all')}
            className={`px-3 h-9 rounded-lg text-xs font-medium border transition-all ${filter === 'all' ? 'bg-[#00D4FF] text-white border-[#00D4FF]' : 'bg-white/5 text-gray-400 border-white/10 hover:border-white/20'}`}>
            All
          </button>
        </div>
      </div>

      {/* Timeline */}
      <div className="px-6 py-4">
        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-3">
              <History className="w-6 h-6 text-gray-500" />
            </div>
            <p className="text-gray-400 text-sm font-medium">No entries found</p>
            <p className="text-gray-500 text-xs mt-1">{search ? 'Try a different search term' : 'This category has no entries yet'}</p>
          </div>
        ) : (
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-[19px] top-3 bottom-3 w-px bg-gradient-to-b from-[#00D4FF]/30 via-white/10 to-transparent" />
            <div className="space-y-1 max-h-[520px] overflow-y-auto pr-1">
              {filtered.map((entry, i) => (
                <motion.div key={entry.id} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(i * 0.025, 0.3) }}
                  className="flex gap-4 py-3 group">
                  {/* Node */}
                  <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 z-10 transition-all group-hover:scale-105 ${actionColor(entry.action)}`}>
                    {categoryIcon(entry.category)}
                  </div>
                  {/* Content */}
                  <div className="flex-1 min-w-0 pt-1.5">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-white text-sm font-semibold">{actionLabel(entry.action)}</span>
                        {entry.version && (
                          <span className="text-xs px-1.5 py-0.5 rounded-md bg-purple-500/20 text-purple-300 border border-purple-500/20 font-mono">
                            {entry.version}
                          </span>
                        )}
                        <span className={`text-xs px-1.5 py-0.5 rounded-md border capitalize ${actionColor(entry.action)}`}>
                          {entry.category}
                        </span>
                      </div>
                      <span className="text-xs text-gray-500 shrink-0 font-mono">{entry.time}</span>
                    </div>
                    <p className="text-xs text-gray-400 leading-relaxed mb-1.5">{entry.description}</p>
                    <div className="flex items-center gap-3 text-xs text-gray-600">
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{entry.date}</span>
                      <span className="flex items-center gap-1"><User className="w-3 h-3" />{entry.user}</span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
            {filtered.length > 10 && (
              <div className="text-center pt-3 border-t border-white/5 mt-2">
                <span className="text-xs text-gray-500">{filtered.length} entries total · scroll to view all</span>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

// ─── VersionControlPanel ──────────────────────────────────────────────────────

interface VersionControlPanelProps {
  versions: ProjectVersion[];
  onRestore: (v: ProjectVersion) => void;
  onAddNote: (versionId: string, note: string) => void;
  onDownloadPdf: (v: ProjectVersion) => void;
}

function VersionControlPanel({ versions, onRestore, onAddNote, onDownloadPdf }: VersionControlPanelProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [noteInput, setNoteInput] = useState('');
  const [editingNoteFor, setEditingNoteFor] = useState<string | null>(null);

  const sorted = [...versions].reverse();

  const completedAnalyses = versions.reduce((acc, v) => {
    if (v.snapshot?.hasRequirementResult) acc.req = true;
    if (v.snapshot?.hasThreatResult) acc.threat = true;
    if (v.snapshot?.codeAnalyzed) acc.code = true;
    return acc;
  }, { req: false, threat: false, code: false });

  return (
    <Card className="bg-white/5 border-[#00D4FF]/20 overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 border-b border-white/5">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center shadow-lg shadow-purple-500/10">
              <GitBranch className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-white font-bold text-base">Version Control</h3>
              <p className="text-xs text-gray-400 mt-0.5">{versions.length} snapshot{versions.length !== 1 ? 's' : ''} tracked</p>
            </div>
          </div>
          {versions.length > 0 && (
            <div className="flex items-center gap-1.5 bg-[#00D4FF]/10 border border-[#00D4FF]/20 rounded-lg px-3 py-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-[#00D4FF] animate-pulse" />
              <span className="text-[#00D4FF] text-xs font-medium">v{sorted[0]?.versionNumber} is latest</span>
            </div>
          )}
        </div>

        {/* Coverage bar */}
        {versions.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Requirements', done: completedAnalyses.req, color: 'text-blue-400 bg-blue-500/10 border-blue-500/20', icon: <FileText className="w-3.5 h-3.5" /> },
              { label: 'Threat Model', done: completedAnalyses.threat, color: 'text-purple-400 bg-purple-500/10 border-purple-500/20', icon: <Target className="w-3.5 h-3.5" /> },
              { label: 'Code Review', done: completedAnalyses.code, color: 'text-green-400 bg-green-500/10 border-green-500/20', icon: <Code className="w-3.5 h-3.5" /> },
            ].map(({ label, done, color, icon }) => (
              <div key={label} className={`flex items-center gap-2 p-2.5 rounded-lg border ${done ? color : 'bg-white/3 border-white/8 text-gray-500'}`}>
                {done ? icon : <div className="w-3.5 h-3.5 rounded-full border border-gray-600" />}
                <span className="text-xs font-medium truncate">{label}</span>
                {done && <CheckCircle2 className="w-3 h-3 ml-auto shrink-0" />}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Version list */}
      <div className="px-6 py-4">
        {versions.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-3">
              <GitBranch className="w-6 h-6 text-gray-500" />
            </div>
            <p className="text-gray-400 text-sm font-medium">No versions yet</p>
            <p className="text-xs text-gray-500 mt-1 max-w-xs mx-auto">Snapshots are automatically created when you complete an analysis. Run a requirement, threat, or code analysis to create your first version.</p>
          </div>
        ) : (
          <div className="relative">
            {/* Vertical rail */}
            <div className="absolute left-4 top-5 bottom-5 w-px bg-gradient-to-b from-purple-500/40 via-white/10 to-transparent" />
            <div className="space-y-2">
              {sorted.map((ver, i) => (
                <div key={ver.id}
                  className={`rounded-xl border transition-all ${i === 0
                    ? 'border-[#00D4FF]/30 bg-gradient-to-r from-[#00D4FF]/5 to-transparent'
                    : 'border-white/8 bg-white/2 hover:border-white/15'}`}>
                  {/* Version row */}
                  <button onClick={() => setExpandedId(expandedId === ver.id ? null : ver.id)}
                    className="w-full flex items-center gap-4 p-4 text-left">
                    {/* Version badge */}
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-black shrink-0 z-10 ${
                      i === 0 ? 'bg-gradient-to-br from-[#00D4FF] to-[#00D4FF]/70 text-white shadow-lg shadow-[#00D4FF]/20'
                               : 'bg-white/8 text-gray-300 border border-white/10'}`}>
                      v{ver.versionNumber}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-white text-sm font-semibold">{ver.label}</span>
                        {i === 0 && (
                          <span className="text-xs px-1.5 py-0.5 rounded-md bg-[#00D4FF]/15 text-[#00D4FF] border border-[#00D4FF]/25 font-medium">Latest</span>
                        )}
                        {ver.notes && (
                          <span className="text-xs px-1.5 py-0.5 rounded-md bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
                            <StickyNote className="w-2.5 h-2.5 inline mr-0.5" />Note
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{ver.createdAt}</span>
                        <span className="flex items-center gap-1"><User className="w-3 h-3" />{ver.createdBy}</span>
                      </div>
                    </div>
                    {/* Snapshot pills */}
                    <div className="hidden md:flex items-center gap-1.5 shrink-0">
                      {ver.snapshot.hasRequirementResult && <span className="w-2 h-2 rounded-full bg-blue-400" title="Requirements" />}
                      {ver.snapshot.hasThreatResult && <span className="w-2 h-2 rounded-full bg-purple-400" title="Threats" />}
                      {ver.snapshot.codeAnalyzed && <span className="w-2 h-2 rounded-full bg-green-400" title="Code" />}
                    </div>
                    <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform shrink-0 ${expandedId === ver.id ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Expanded */}
                  <AnimatePresence>
                    {expandedId === ver.id && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden">
                        <div className="px-5 pb-5 border-t border-white/5 pt-4 space-y-4">
                          <p className="text-sm text-gray-300 leading-relaxed">{ver.description}</p>

                          {/* Snapshot summary */}
                          <div>
                            <p className="text-xs text-gray-500 uppercase tracking-wider mb-2 font-medium">Analysis Snapshot</p>
                            <div className="grid grid-cols-3 gap-2">
                              <div className={`p-3 rounded-lg border text-center transition-all ${ver.snapshot.hasRequirementResult ? 'bg-blue-500/10 border-blue-500/20 text-blue-300' : 'bg-white/3 border-white/8 text-gray-600'}`}>
                                <FileText className="w-4 h-4 mx-auto mb-1.5" />
                                <div className="text-xs font-medium">Requirements</div>
                                <div className="text-xs mt-0.5 opacity-70">{ver.snapshot.hasRequirementResult ? `Score: ${ver.snapshot.requirementScore ?? '—'}/100` : 'Not run'}</div>
                              </div>
                              <div className={`p-3 rounded-lg border text-center transition-all ${ver.snapshot.hasThreatResult ? 'bg-purple-500/10 border-purple-500/20 text-purple-300' : 'bg-white/3 border-white/8 text-gray-600'}`}>
                                <Target className="w-4 h-4 mx-auto mb-1.5" />
                                <div className="text-xs font-medium">Threats</div>
                                <div className="text-xs mt-0.5 opacity-70">{ver.snapshot.hasThreatResult ? `${ver.snapshot.threatCount ?? 0} found` : 'Not run'}</div>
                              </div>
                              <div className={`p-3 rounded-lg border text-center transition-all ${ver.snapshot.codeAnalyzed ? 'bg-green-500/10 border-green-500/20 text-green-300' : 'bg-white/3 border-white/8 text-gray-600'}`}>
                                <Code className="w-4 h-4 mx-auto mb-1.5" />
                                <div className="text-xs font-medium">Code Review</div>
                                <div className="text-xs mt-0.5 opacity-70">{ver.snapshot.codeAnalyzed ? 'Analyzed' : 'Not run'}</div>
                              </div>
                            </div>
                          </div>

                          {/* Progress at snapshot */}
                          {ver.snapshot.progress !== undefined && (
                            <div>
                              <div className="flex justify-between text-xs mb-1.5">
                                <span className="text-gray-500">Progress at snapshot</span>
                                <span className="text-white font-medium">{ver.snapshot.progress}%</span>
                              </div>
                              <div className="h-1.5 bg-white/8 rounded-full">
                                <div className="h-1.5 bg-gradient-to-r from-[#00D4FF] to-purple-400 rounded-full transition-all"
                                  style={{ width: `${ver.snapshot.progress}%` }} />
                              </div>
                            </div>
                          )}

                          {/* Notes */}
                          {ver.notes && (
                            <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-3.5">
                              <div className="flex items-center gap-2 mb-1.5">
                                <StickyNote className="w-3.5 h-3.5 text-yellow-400" />
                                <span className="text-xs text-yellow-400 font-semibold uppercase tracking-wide">Note</span>
                              </div>
                              <p className="text-sm text-yellow-200/80 leading-relaxed">{ver.notes}</p>
                            </div>
                          )}

                          {/* Add/edit note */}
                          {editingNoteFor === ver.id ? (
                            <div className="space-y-2">
                              <Textarea value={noteInput} onChange={e => setNoteInput(e.target.value)}
                                placeholder="Add a note for this version snapshot..."
                                className="bg-white/5 border-white/10 text-white text-sm min-h-[72px] resize-none" />
                              <div className="flex gap-2">
                                <Button size="sm" onClick={() => { onAddNote(ver.id, noteInput); setNoteInput(''); setEditingNoteFor(null); }}
                                  className="bg-[#00D4FF] text-white text-xs h-8">
                                  <CheckCircle2 className="w-3.5 h-3.5 mr-1" />Save Note
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => { setEditingNoteFor(null); setNoteInput(''); }}
                                  className="border-white/15 text-gray-400 text-xs h-8">Cancel</Button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex gap-2 flex-wrap">
                              <Button size="sm" variant="outline"
                                onClick={() => { setEditingNoteFor(ver.id); setNoteInput(ver.notes ?? ''); }}
                                className="border-white/15 text-gray-400 hover:text-white hover:border-white/30 text-xs h-8">
                                <StickyNote className="w-3.5 h-3.5 mr-1.5" />
                                {ver.notes ? 'Edit Note' : 'Add Note'}
                              </Button>
                              {((ver.snapshot as any).requirementResult || (ver.snapshot as any).threatResult || (ver.snapshot as any).codeResult || (ver.snapshot as any).crossPhaseResult || (ver.snapshot as any).depScanResult) && (
                                <Button size="sm" variant="outline" onClick={() => onDownloadPdf(ver)}
                                  className="border-[#00D4FF]/30 text-[#00D4FF] hover:bg-[#00D4FF]/10 hover:border-[#00D4FF]/50 text-xs h-8">
                                  <Download className="w-3.5 h-3.5 mr-1.5" />Download PDF
                                </Button>
                              )}
                              {i > 0 && (
                                <Button size="sm" variant="outline" onClick={() => onRestore(ver)}
                                  className="border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10 hover:border-yellow-500/50 text-xs h-8">
                                  <RotateCcw className="w-3.5 h-3.5 mr-1.5" />Restore This Version
                                </Button>
                              )}
                              {i === 0 && (
                                <span className="flex items-center gap-1.5 text-xs text-gray-500 ml-1">
                                  <Info className="w-3 h-3" />Current version
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function UserDashboard() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { projects, addProject, updateProject, currentProjectId, setCurrentProjectId, loadingProjects } = useApp();

  // ── Org Projects (for employees linked to an org) ─────────────────────────
  const [orgProjects, setOrgProjects] = useState<OrgProjectForEmployee[]>([]);
  const [loadingOrgProjects, setLoadingOrgProjects] = useState(false);
  const [selectedOrgProject, setSelectedOrgProject] = useState<OrgProjectForEmployee | null>(null);

  // ── Org Project Workspace Context ─────────────────────────────────────────
  // When an employee opens an org project in the workspace, we need to know
  // (a) which project, and (b) it's an org project so analysis.js saves to
  // organizations/{orgId}/projects/{projectId} instead of users/{uid}/projects
  // FIX: Persist activeOrgProject to sessionStorage so refresh doesn't lose workspace context.
  // On mount, restore from sessionStorage if available.
  const [activeOrgProject, setActiveOrgProject] = useState<OrgProjectForEmployee | null>(() => {
    try {
      const saved = sessionStorage.getItem('fortifylens_activeOrgProject');
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });

  // Keep sessionStorage in sync whenever activeOrgProject changes
  useEffect(() => {
    if (activeOrgProject) {
      sessionStorage.setItem('fortifylens_activeOrgProject', JSON.stringify(activeOrgProject));
    } else {
      sessionStorage.removeItem('fortifylens_activeOrgProject');
    }
  }, [activeOrgProject]);

  // ── ISOLATION FIX: Clear org project context if user has no orgId ─────────
  // Individual users must NEVER see an org project workspace even if
  // sessionStorage had a stale activeOrgProject from a previous session
  useEffect(() => {
    if (user && !user.orgId && activeOrgProject) {
      setActiveOrgProject(null);
      sessionStorage.removeItem('fortifylens_activeOrgProject');
    }
  }, [user?.orgId]);

  // Phase review statuses for org project — drives locking + "needs revision" indicators
  const [orgPhaseStatus, setOrgPhaseStatus] = useState<Record<string, {
    status: 'submitted' | 'completed' | 'needs-revision' | 'not-started';
    rejectionReason?: string;
    approvedBy?: string;
  }>>({});
  const [orgProjectNotifications, setOrgProjectNotifications] = useState<any[]>([]);

  const [activeView, setActiveView] = useState<'overview' | 'workspace'>('overview');

  // Create Project Dialog
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [newProjectDomain, setNewProjectDomain] = useState('web-application');
  const [newProjectPhase, setNewProjectPhase] = useState<'requirement' | 'design' | 'development'>('requirement');

  // Workspace tabs
  const [activeWorkspace, setActiveWorkspace] = useState<'requirements' | 'design' | 'code-review' | 'dependencies' | 'pipeline' | 'cross-phase' | 'history' | 'versions'>('requirements');

  // Project detail modal (completed)
  const [viewingProject, setViewingProject] = useState<typeof projects[0] | null>(null);
  const [showReopenConfirm, setShowReopenConfirm] = useState(false);

  // Edit project
  const [editingProject, setEditingProject] = useState<typeof projects[0] | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // Delete project
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Project search
  const [projectSearch, setProjectSearch] = useState('');

  // Firestore error state
  const [firestoreError, setFirestoreError] = useState<string | null>(null);

  // ── Per-project extra data — Firestore backed ─────────────────────────────
  // projectExtras holds local state; Firestore is the source of truth.
  // history and versions are loaded via real-time listeners per project.
  const [projectExtras, setProjectExtras] = useState<Record<string, ProjectExtra>>({});

  // Real-time listeners keyed by projectId — cleaned up on switch
  const unsubHistoryRef = useRef<(() => void) | null>(null);
  const unsubVersionsRef = useRef<(() => void) | null>(null);

  // Load top-level project extra fields (status, progress, riskScore) from Firestore
  // These are stored directly on the UserProject doc.
  // We build projectExtras from the `projects` array returned by AppContext (already Firestore-synced).
  useEffect(() => {
    setProjectExtras(prev => {
      const next = { ...prev };
      projects.forEach(p => {
        const fp = p as any; // AppContext maps UserProject → Project; extra fields carried through
        if (!next[p.id]) {
          next[p.id] = {
            status: fp.status ?? 'in-progress',
            progress: fp.progress ?? 0,
            riskScore: fp.riskScore ?? 0,
            completedAt: fp.completedAt,
            reopenedAt: fp.reopenedAt,
            history: next[p.id]?.history ?? [],
            versions: next[p.id]?.versions ?? [],
            currentPhase: fp.currentPhase,
            domain: fp.domain,
            assignedTo: fp.assignedTo,
            createdAt: fp.createdAt,
          };
        } else {
          // Merge updated Firestore fields but keep local history/versions until listeners update
          next[p.id] = {
            ...next[p.id],
            status: fp.status ?? next[p.id].status,
            progress: fp.progress ?? next[p.id].progress,
            riskScore: fp.riskScore ?? next[p.id].riskScore,
            completedAt: fp.completedAt ?? next[p.id].completedAt,
            reopenedAt: fp.reopenedAt ?? next[p.id].reopenedAt,
          };
        }
      });
      return next;
    });
  }, [projects]);

  // Subscribe to history + versions for the current project
  useEffect(() => {
    if (unsubHistoryRef.current) { unsubHistoryRef.current(); unsubHistoryRef.current = null; }
    if (unsubVersionsRef.current) { unsubVersionsRef.current(); unsubVersionsRef.current = null; }
    if (!currentProjectId || !user?.uid) return;

    // For org projects, subscribe to versions AND phases-as-history
    if (activeOrgProject && user.orgId) {
      // Subscribe to phases collection to build history
      unsubHistoryRef.current = onSnapshot(
        collection(db, 'organizations', user.orgId, 'projects', activeOrgProject.projectId, 'phases'),
        (pSnap: any) => {
          const phaseLabels: Record<string, string> = {
            requirement: 'Requirements Analysis', design: 'Threat Modeling',
            development: 'Code Review', sca: 'Dependency Scan', pipeline: 'Pipeline Security', crossphase: 'Cross-Phase Check',
          };
          const historyEntries = pSnap.docs.map((d: any) => {
            const data = sanitizeDoc(d.data());
            const status = data.status || 'not-started';
            const phaseNm = phaseLabels[d.id] || d.id;
            const statusLabel = status === 'completed' ? 'Approved ✓' : status === 'submitted' ? 'Submitted ⏳' : status === 'needs-revision' ? 'Needs Revision ↩' : 'Not started';
            return {
              id: d.id,
              date: data.updatedAt ? new Date(data.updatedAt).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }) : '—',
              time: data.updatedAt ? new Date(data.updatedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—',
              user: data.submittedBy || data.approvedBy || data.rejectedBy || 'Team',
              action: 'requirement_analysis' as HistoryAction,
              description: `${phaseNm}: ${statusLabel}${data.rejectionReason ? ` — "${data.rejectionReason}"` : ''}`,
              category: 'analysis' as const,
            };
          }).filter((e: any) => e.date !== '—');
          setProjectExtras(prev => ({
            ...prev,
            [currentProjectId]: {
              ...(prev[currentProjectId] ?? { status: 'in-progress', progress: activeOrgProject.progress, riskScore: activeOrgProject.riskScore, versions: [] }),
              history: historyEntries,
            },
          }));
        }
      );

      unsubVersionsRef.current = onSnapshot(
        query(collection(db, 'organizations', user.orgId, 'projects', activeOrgProject.projectId, 'versions'), orderBy('createdAt', 'asc')),
        (snap: any) => {
          setProjectExtras(prev => ({
            ...prev,
            [currentProjectId]: {
              ...(prev[currentProjectId] ?? { status: 'in-progress', progress: activeOrgProject.progress, riskScore: activeOrgProject.riskScore, history: [] }),
              versions: snap.docs.map((d: any, i: number) => {
                const raw = sanitizeDoc(d.data());
                const phase = raw.analyzedPhase || '';
                const phaseLabels: Record<string, string> = {
                  requirement: 'Requirements Analysis', design: 'Threat Modeling',
                  development: 'Code Review', sca: 'Dependency Scan', pipeline: 'Pipeline Security', crossphase: 'Cross-Phase Check',
                };
                return {
                  id: d.id,
                  versionNumber: raw.versionNumber ?? (i + 1),
                  label: raw.label ?? `v${raw.versionNumber ?? (i+1)}: ${phaseLabels[phase] || phase}`,
                  description: `${phaseLabels[phase] || phase} submitted by ${raw.analyzedBy || 'team member'}`,
                  createdAt: raw.createdAt ? new Date(raw.createdAt).toLocaleString() : new Date().toLocaleString(),
                  createdBy: raw.analyzedBy || 'Team Member',
                  notes: raw.notes || '',
                  snapshot: {
                    hasRequirementResult: phase === 'requirement',
                    hasThreatResult: phase === 'design',
                    codeAnalyzed: phase === 'development',
                    progress: null,
                    ...(raw.snapshot ?? {}),
                  },
                };
              }),
            },
          }));
        }
      );
      return () => { if (unsubVersionsRef.current) { unsubVersionsRef.current(); unsubVersionsRef.current = null; } };
    }

    unsubHistoryRef.current = subscribeUserProjectHistory(user.uid, currentProjectId, (entries) => {
      setProjectExtras(prev => ({
        ...prev,
        [currentProjectId]: {
          ...(prev[currentProjectId] ?? { status: 'in-progress', progress: 0, riskScore: 0, versions: [] }),
          history: entries.map(e => ({
            id: e.id,
            date: e.date,
            time: e.time,
            user: e.user,
            action: e.action as HistoryAction,
            version: e.version,
            description: e.description,
            category: e.category,
          })),
        },
      }));
    });

    unsubVersionsRef.current = subscribeUserProjectVersions(user.uid, currentProjectId, (vers) => {
      setProjectExtras(prev => ({
        ...prev,
        [currentProjectId]: {
          ...(prev[currentProjectId] ?? { status: 'in-progress', progress: 0, riskScore: 0, history: [] }),
          versions: vers.map(v => ({
            id: v.id,
            versionNumber: v.versionNumber,
            label: v.label,
            description: v.description,
            createdAt: v.createdAt,
            createdBy: v.createdBy,
            notes: v.notes,
            snapshot: v.snapshot,
          })),
        },
      }));
    });

    return () => {
      if (unsubHistoryRef.current) { unsubHistoryRef.current(); unsubHistoryRef.current = null; }
      if (unsubVersionsRef.current) { unsubVersionsRef.current(); unsubVersionsRef.current = null; }
    };
  }, [currentProjectId, user?.uid, activeOrgProject?.projectId]);

  const getExtra = useCallback((id: string): ProjectExtra => {
    return projectExtras[id] ?? {
      status: 'in-progress', progress: 0, riskScore: 0,
      history: [], versions: [],
    };
  }, [projectExtras]);

  // updateExtra: persists status/progress/riskScore to Firestore project doc,
  // adds new history entries to subcollection, adds new versions to subcollection.
  const updateExtra = useCallback(async (id: string, patch: Partial<ProjectExtra>) => {
    if (!user?.uid) return;

    const safePatch = sanitizeDoc(patch) as Partial<ProjectExtra>;
    // 1. Optimistic local update for immediate UI response
    setProjectExtras(prev => ({
      ...prev,
      [id]: { ...(prev[id] ?? { status: 'in-progress', progress: 0, riskScore: 0, history: [], versions: [] }), ...safePatch },
    }));

    const current = projectExtras[id] ?? { status: 'in-progress', progress: 0, riskScore: 0, history: [], versions: [] };

    // 2. Persist top-level scalar fields to the project doc
    const projectDocUpdates: Record<string, any> = {};
    if (patch.status !== undefined) projectDocUpdates.status = patch.status;
    if (patch.progress !== undefined) projectDocUpdates.progress = patch.progress;
    if (patch.riskScore !== undefined) projectDocUpdates.riskScore = patch.riskScore;
    if (patch.completedAt !== undefined) projectDocUpdates.completedAt = patch.completedAt ?? null;
    if (patch.reopenedAt !== undefined) projectDocUpdates.reopenedAt = patch.reopenedAt ?? null;
    if (Object.keys(projectDocUpdates).length > 0) {
      updateUserProject(user.uid, id, projectDocUpdates).catch(err => {
        console.error(err);
        setFirestoreError('Failed to save project data. Check your connection.');
        setTimeout(() => setFirestoreError(null), 5000);
      });
    }

    // 3. Persist NEW history entries (entries not already in current.history)
    if (patch.history) {
      const existingIds = new Set((current.history ?? []).map((h: HistoryEntry) => h.id));
      const newEntries = patch.history.filter((h: HistoryEntry) => !existingIds.has(h.id));
      for (const entry of newEntries) {
        addUserHistoryEntry(user.uid, id, {
          date: entry.date, time: entry.time, user: entry.user,
          action: entry.action as any, version: entry.version,
          description: entry.description, category: entry.category,
        }).catch(console.error);
      }
    }
    // Note: versions are written directly to Firestore at analysis time, not through updateExtra
  }, [user?.uid, projectExtras]);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const addHistory = useCallback((projectId: string, entry: HistoryEntry) => {
    const ex = getExtra(projectId);
    updateExtra(projectId, { history: [...ex.history, entry] });
  }, [getExtra, updateExtra]);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const addVersion = useCallback((projectId: string, version: ProjectVersion) => {
    const ex = getExtra(projectId);
    updateExtra(projectId, {
      versions: [...ex.versions, version],
      history: [...ex.history, makeHistoryEntry(
        'version_created',
        `Version ${version.versionNumber} created: ${version.label}`,
        user?.email ?? 'User',
        `v${version.versionNumber}`
      )]
    });
  }, [getExtra, updateExtra, user]);

  // Analysis State
  const [authentication, setAuthentication] = useState(false);
  const [sensitiveData, setSensitiveData] = useState(false);
  const [encryption, setEncryption] = useState(false);
  const [dataStorage, setDataStorage] = useState(false);
  const [thirdPartyAPIs, setThirdPartyAPIs] = useState(false);
  const [compliance, setCompliance] = useState<string[]>([]);
  const [showRequirementAnalysis, setShowRequirementAnalysis] = useState(false);
  const [analyzingRequirements, setAnalyzingRequirements] = useState(false);
  const [requirementResult, setRequirementResult] = useState<any>(null);

  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [requirementsCompleted, setRequirementsCompleted] = useState(false);
  const [designCompleted, setDesignCompleted] = useState(false);

  const [sessionStats, setSessionStats] = useState({ threatsAnalyzed: 0, lastRiskScore: 0, reportsGenerated: 0 });

  // Load stats from Firestore on mount
  useEffect(() => {
    if (!user?.uid) return;
    getUserStats(user.uid).then(stats => {
      if (stats) {
        setSessionStats({
          threatsAnalyzed: stats.threatsAnalyzed ?? 0,
          lastRiskScore: stats.lastRiskScore ?? 0,
          reportsGenerated: stats.reportsGenerated ?? 0,
        });
      }
    }).catch(console.error);
  }, [user?.uid]);

  // Fetch org-assigned projects for employees via backend API
  useEffect(() => {
    if (!user?.uid || !user?.orgId) return;
    setLoadingOrgProjects(true);
    const BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
    import('../../lib/firebase')
      .then(({ auth }) => auth.currentUser?.getIdToken() ?? Promise.resolve(''))
      .then(token => fetch(`${BASE}/api/teams/my-projects`, {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
      }))
      .then(res => res.json())
      .then((r: any) => setOrgProjects(r.projects ?? []))
      .catch(() => setOrgProjects([]))
      .finally(() => setLoadingOrgProjects(false));
  }, [user?.uid, user?.orgId]);

  // Real-time sync of active org project (progress, riskScore, currentPhase)
  // so workspace banner and project card always show accurate live data
  useEffect(() => {
    if (!activeOrgProject?.projectId || !activeOrgProject?.orgId) return;
    const unsub = onSnapshot(
      doc(db, 'organizations', activeOrgProject.orgId, 'projects', activeOrgProject.projectId),
      (snap: any) => {
        if (!snap.exists()) return;
        const d = sanitizeDoc(snap.data());
        setActiveOrgProject(prev => prev ? {
          ...prev,
          progress:     d.progress     ?? prev.progress,
          riskScore:    d.riskScore     ?? prev.riskScore,
          currentPhase: d.currentPhase  ?? prev.currentPhase,
          status:       d.status        ?? prev.status,
        } : null);
        setOrgProjects(prev => prev.map(op =>
          op.projectId === activeOrgProject.projectId
            ? { ...op, progress: d.progress ?? op.progress, riskScore: d.riskScore ?? op.riskScore, currentPhase: d.currentPhase ?? op.currentPhase, status: d.status ?? op.status }
            : op
        ));
      }
    );
    return () => unsub();
  }, [activeOrgProject?.projectId, activeOrgProject?.orgId]);

  const [architectureUploaded, setArchitectureUploaded] = useState(false);
  const [components, setComponents] = useState<Array<{ name: string; type: 'API' | 'Database' | 'Client' | 'Server' }>>([]);
  const [showThreatAnalysis, setShowThreatAnalysis] = useState(false);
  const [threatResult, setThreatResult] = useState<any>(null);
  const [analyzingThreats, setAnalyzingThreats] = useState(false);

  const [showCodeAnalysis, setShowCodeAnalysis] = useState(false);
  const [analyzingCode, setAnalyzingCode] = useState(false);
  const [sourceCode, setSourceCode] = useState('');
  const [codeLanguage, setCodeLanguage] = useState('javascript');

  // Cross-phase mapping state
  const [phaseMappingResult, setPhaseMappingResult] = useState<any>(null);
  const [analyzingPhaseMapping, setAnalyzingPhaseMapping] = useState(false);
  const [codeAnalysisResult, setCodeAnalysisResult] = useState<any>(null);

  // Dependency / SCA scanning state
  const [depScanResult, setDepScanResult] = useState<any>(null);
  const [scanningDeps, setScanningDeps] = useState(false);
  const [depFileContent, setDepFileContent] = useState('');
  const [depFileName, setDepFileName] = useState('package.json');

  // Pipeline security (CI/CD) scanning state
  const [pipelineResults, setPipelineResults] = useState<any>(null);
  const [pipelineScanning, setPipelineScanning] = useState(false);
  const [pipelineContent, setPipelineContent] = useState('');
  const [pipelineFilename, setPipelineFilename] = useState('.github/workflows/ci.yml');

  // Remediation tracking per finding (key = findingId, value = status)
  const [remediations, setRemediations] = useState<Record<string, 'fixed' | 'in_progress' | 'wont_fix' | null>>({});
  const [falsePositives, setFalsePositives] = useState<Record<string, 'false_positive' | 'accepted' | null>>({});

  const setRemediation = (id: string, status: 'fixed' | 'in_progress' | 'wont_fix' | null) => {
    setRemediations(prev => ({ ...prev, [id]: status }));
    const label = status === 'fixed' ? 'Marked as fixed' : status === 'in_progress' ? 'Marked as in progress' : status === 'wont_fix' ? "Marked as won't fix" : 'Status cleared';
    toast.success(label);
    // Save to Firestore via project extras history
    if (currentProjectId && user?.uid && status) {
      const entry = makeHistoryEntry('project_edited', `Finding ${id}: ${label}`, user?.email ?? 'User');
      addUserHistoryEntry(user.uid, currentProjectId, {
        date: entry.date, time: entry.time, user: entry.user,
        action: entry.action as any, description: entry.description,
        category: 'status',
      }).catch(console.error);
    }
  };

  // Phase mapping cooldown (30 seconds)
  const [phaseMappingCooldown, setPhaseMappingCooldown] = useState(0);

  // Rescan recommendation (cache older than 7 days)
  const [staleCache, setStaleCache] = useState<string[]>([]);
  const [requirementsText, setRequirementsText] = useState('');
  const [requirementsCode, setRequirementsCode] = useState('');
  const [designCode, setDesignCode] = useState('');
  const [reviewCode, setReviewCode] = useState('');

  const requirementsFileRef = useRef<HTMLInputElement>(null);
  const designFileRef = useRef<HTMLInputElement>(null);
  const codeFileRef = useRef<HTMLInputElement>(null);
  const requirementReportRef = useRef<HTMLDivElement>(null);
  const threatReportRef = useRef<HTMLDivElement>(null);
  const codeReportRef = useRef<HTMLDivElement>(null);
  const depResultsRef = useRef<HTMLDivElement>(null);
  const pipelineResultsRef = useRef<HTMLDivElement>(null);

  // Current project extra — org projects use real data from activeOrgProject (synced from Firestore)
  const currentExtra = activeOrgProject
    ? {
        status: activeOrgProject.status as any,
        progress: activeOrgProject.progress,
        riskScore: activeOrgProject.riskScore,
        history: [],
        versions: projectExtras[activeOrgProject.projectId]?.versions ?? [],
        baselineScore: null,
      }
    : (currentProjectId ? getExtra(currentProjectId) : undefined);
  const currentProject = activeOrgProject
    ? {
        id: activeOrgProject.projectId,
        name: activeOrgProject.projectName,
        description: activeOrgProject.description,
        currentPhase: activeOrgProject.currentPhase,
        domain: activeOrgProject.domain,
        status: activeOrgProject.status,
        progress: activeOrgProject.progress,
        riskScore: activeOrgProject.riskScore,
        createdAt: '',
        assignedTo: '',
      }
    : projects.find(p => p.id === currentProjectId);

  // ── Persist stats to Firestore (debounced — only after 2s of no change) ──
  useEffect(() => {
    if (!user?.uid) return;
    const timer = setTimeout(() => {
      updateUserStats(user.uid!, sessionStats).catch(console.error);
    }, 2000);
    return () => clearTimeout(timer);
  }, [sessionStats, user?.uid]);

  // ── Load cached analysis results when project switches ────────────────────
  useEffect(() => {
    if (!currentProjectId) return;

    // Always reset UI state immediately
    setRequirementsCode(''); setRequirementsText(''); setDesignCode('');
    setReviewCode(''); setSourceCode('');
    setShowRequirementAnalysis(false); setShowThreatAnalysis(false);
    setShowCodeAnalysis(false);
    setRequirementsCompleted(false); setDesignCompleted(false);
    setArchitectureUploaded(false); setComponents([]);
    setUploadedFile(null); setAuthentication(false);
    setSensitiveData(false); setEncryption(false);
    setDataStorage(false); setThirdPartyAPIs(false);
    setCompliance([]); setActiveWorkspace('requirements');
    setPhaseMappingResult(null);

    // Reset results optimistically — will be replaced by cache if found
    setRequirementResult(null);
    setThreatResult(null);
    setCodeAnalysisResult(null);

    // Load cached results from Firestore
    if (!user?.uid) return;
    loadAnalysisCache(user.uid, currentProjectId)
      .then(cache => {
        const stale: string[] = [];

        if (cache.requirement) {
          setRequirementResult(cache.requirement.result);
          setShowRequirementAnalysis(true);
          setRequirementsCompleted(true);
          if (cache.requirement.inputText) setRequirementsCode(cache.requirement.inputText);
        }
        if (cache.threat) {
          setThreatResult(cache.threat.result);
          setShowThreatAnalysis(true);
          setDesignCompleted(true);
          if (cache.threat.inputText) setDesignCode(cache.threat.inputText);
        }
        if (cache.code) {
          setCodeAnalysisResult(cache.code.result);
          setShowCodeAnalysis(true);
          if (cache.code.inputText) setReviewCode(cache.code.inputText);
        }
        // Restore dependency scan from cache
        if ((cache as any).dependency) {
          setDepScanResult((cache as any).dependency.result);
        }
        // Restore cross-phase mapping from cache
        if ((cache as any).crossphase) {
          setPhaseMappingResult((cache as any).crossphase.result);
        }
        if (stale.length > 0) setStaleCache(stale);
      })
      .catch(err => console.error('[analysisCache] load failed:', err));
  }, [currentProjectId, user?.uid]);

  // ── Cleanup phase mapping cooldown timer on unmount ─────────────────────
  useEffect(() => {
    return () => {
      if ((window as any).__phaseMappingTimer) {
        clearInterval((window as any).__phaseMappingTimer);
        (window as any).__phaseMappingTimer = null;
      }
    };
  }, []);

  // ── Load remediations when project switches ──────────────────────────────
  useEffect(() => {
    if (!currentProjectId || !user?.uid) return;
    loadRemediations(user.uid, currentProjectId)
      .then(data => {
        if (data) {
          // Restore false positives and remediations
          const fp: Record<string, 'false_positive' | 'accepted' | null> = {};
          const rem: Record<string, 'fixed' | 'in_progress' | 'wont_fix' | null> = {};
          Object.entries(data).forEach(([id, val]: [string, any]) => {
            if (val?.type === 'false_positive' || val?.type === 'accepted') fp[id] = val.type;
            if (val?.status) rem[id] = val.status;
          });
          if (Object.keys(fp).length > 0) setFalsePositives(fp);
          if (Object.keys(rem).length > 0) setRemediations(rem);
        }
      })
      .catch(err => console.error('[remediations] load failed:', err));
  }, [currentProjectId, user?.uid]);

  // ── Download helpers ───────────────────────────────────────────────────────

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleLogout = () => { logout(); toast.success('Logged out'); navigate('/'); };

  // Open an org-assigned project in the workspace — sets the active context
  // so all analysis API calls include projectId + isOrgProject flag,
  // causing analysis.js to persist results to organizations/{orgId}/projects/{projectId}
  const handleOpenOrgProject = (op: OrgProjectForEmployee) => {
    setActiveOrgProject(op);
    setSelectedOrgProject(null);
    setCurrentProjectId(op.projectId);
    setActiveView('workspace');
    setRequirementResult(null);
    setThreatResult(null);
    setDepScanResult(null);
    setPipelineResults(null);
    setPhaseMappingResult(null);
    // Real-time phase status listener — revision/approval shows instantly
    if (user.orgId && op.projectId) {
      const phaseUnsub = onSnapshot(
        collection(db, 'organizations', user.orgId, 'projects', op.projectId, 'phases'),
        (pSnap: any) => {
          const phases: Record<string, any> = {};
          pSnap.docs.forEach((d: any) => {
            const data = sanitizeDoc(d.data());
            phases[d.id] = {
              status: data.status,
              completion: data.completion,
              rejectionReason: data.rejectionReason,
              approvedBy: data.approvedBy,
            };
          });
          setOrgPhaseStatus(phases);
        }
      );
      (window as any).__phaseStatusUnsub = phaseUnsub;
    }
    // Also fetch notifications once
    analysisApi.getPhaseStatus(op.projectId)
      .then((r: any) => { setOrgProjectNotifications(r.notifications ?? []); })
      .catch(() => {});
  };

  const handleCloseOrgProject = () => {
    // Clear phase status polling interval
    if ((window as any).__phaseStatusUnsub) {
      (window as any).__phaseStatusUnsub();
      (window as any).__phaseStatusUnsub = null;
    }
    setActiveOrgProject(null);
    setOrgPhaseStatus({});
    setOrgProjectNotifications([]);
    setCurrentProjectId(null);
    setActiveView('overview');
  };

  const handleCreateProject = async () => {
    if (!newProjectName) return;
    const now = new Date().toISOString();
    const newProject = {
      id: '',                    // will be replaced by Firestore ID
      name: newProjectName,
      description: newProjectDesc || 'Security assessment project',
      currentPhase: newProjectPhase,
      createdAt: now.split('T')[0],
      assignedTo: user?.email || 'User',
      domain: newProjectDomain,
    };

    const firestoreId = await addProject(newProject);
    if (!firestoreId) { toast.error('Failed to create project'); return; }

    // Clear org project context — new project is always personal
    setActiveOrgProject(null);
    setOrgPhaseStatus({});
    setOrgProjectNotifications([]);
    setCurrentProjectId(firestoreId);

    // Write the initial history entry to Firestore
    if (user?.uid) {
      const initEntry = makeHistoryEntry('project_created', `Project "${newProjectName}" created`, user?.email ?? 'User');
      addUserHistoryEntry(user.uid, firestoreId, {
        date: initEntry.date, time: initEntry.time, user: initEntry.user,
        action: initEntry.action as any, description: initEntry.description,
        category: initEntry.category, version: initEntry.version,
      }).catch(console.error);
    }

    setNewProjectName(''); setNewProjectDesc('');
    setNewProjectDomain('web-application'); setNewProjectPhase('requirement');
    setShowCreateProject(false); setActiveView('workspace');
    toast.success('Project created — workspace is ready');
  };

  const handleMarkComplete = async (projectId: string) => {
    const proj = activeOrgProject
      ? { id: activeOrgProject.projectId, name: activeOrgProject.projectName }
      : projects.find(p => p.id === projectId);
    if (!proj) return;

    // Org project — update organizations/{orgId}/projects/{projectId}
    if (activeOrgProject && user?.orgId) {
      try {
        await updateDoc(doc(db, 'organizations', user.orgId, 'projects', activeOrgProject.projectId), {
          status: 'completed', progress: 100,
          completedAt: new Date().toISOString(),
        });
        setActiveOrgProject(prev => prev ? { ...prev, status: 'completed', progress: 100 } : null);
        toast.success(`"${activeOrgProject.projectName}" marked as completed`);
      } catch (err) {
        console.error('Mark complete org project error:', err);
        toast.error('Failed to update project status');
      }
      return;
    }

    // Personal project — existing path
    const ex = getExtra(projectId);
    const now = new Date().toISOString();
    const entry = makeHistoryEntry('project_completed', `Project "${proj.name}" marked as completed`, user?.email ?? 'User');
    updateExtra(projectId, {
      status: 'completed', progress: 100,
      completedAt: now,
      history: [...ex.history, entry],
    });
    toast.success(`"${proj.name}" marked as completed`);
  };

  const handleReopenProject = (projectId: string) => {
    const proj = viewingProject || projects.find(p => p.id === projectId);
    if (!proj) return;
    const ex = getExtra(projectId);
    const now = new Date().toISOString();
    const entry = makeHistoryEntry('project_reopened', `Project "${proj.name}" reopened for further work`, user?.email ?? 'User');
    updateExtra(projectId, {
      status: 'in-progress',
      progress: Math.min((ex.progress ?? 100) - 5, 95),
      completedAt: undefined,
      reopenedAt: now,
      history: [...ex.history, entry],
    });
    setViewingProject(null);
    setShowReopenConfirm(false);
    toast.success(`"${proj.name}" reopened — workspace restored`);
  };

  const handleEditProject = async () => {
    if (!editingProject || !editName.trim()) return;
    setEditSaving(true);
    try {
      updateProject(editingProject.id, { name: editName.trim(), description: editDesc.trim() });
      const ex = getExtra(editingProject.id);
      const entry = makeHistoryEntry('project_edited', `Project renamed to "${editName.trim()}"`, user?.email ?? 'User');
      updateExtra(editingProject.id, { history: [...ex.history, entry] });
      toast.success('Project updated');
      setEditingProject(null);
    } catch {
      toast.error('Failed to update project');
    }
    setEditSaving(false);
  };

  const handleDeleteProject = async (projectId: string) => {
    if (!user?.uid) return;
    setDeletingProjectId(projectId);
    try {
      await deleteUserProject(user.uid, projectId);
      if (currentProjectId === projectId) {
        setCurrentProjectId(null);
        setActiveView('overview');
      }
      setDeleteConfirmId(null);
      toast.success('Project deleted');
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete project');
    }
    setDeletingProjectId(null);
  };

  const handleRequirementAnalysis = async () => {
    const text = requirementsCode.trim() || requirementsText.trim();
    if (!text) { toast.error('Please enter requirements to analyze'); return; }
    setAnalyzingRequirements(true);
    try {
      const result = await analysisApi.analyzeRequirements({
        projectId: currentProjectId || undefined,
        authentication, sensitiveData, encryption, dataStorage, thirdPartyAPIs, compliance,
        requirementsText: text, codeSnippet: text,
        ...(activeOrgProject ? { isOrgProject: true, orgId: activeOrgProject.orgId } : {}),
      });
      setAnalyzingRequirements(false);
      setRequirementResult(result.analysis);
      setShowRequirementAnalysis(true);
      setRequirementsCompleted(true);
      const score = result.analysis.securityScore ?? result.analysis.riskScore ?? 0;

      setSessionStats((prev: any) => ({ ...prev, lastRiskScore: score, reportsGenerated: prev.reportsGenerated + 1 }));

      // Cache result to Firestore — survives refresh
      if (currentProjectId && user?.uid) {
        saveAnalysisCache(user.uid, currentProjectId, 'requirement', result.analysis, text.slice(0, 100), text)
          .then(() => {
            // Set baseline score on FIRST analysis only (if not already set)
            const ex = getExtra(currentProjectId!);
            if (!ex.baselineScore && result.analysis.securityScore) {
              saveBaselineScore(user!.uid, currentProjectId!, result.analysis.securityScore).catch(console.error);
            }
          })
          .catch(err => console.error('[analysisCache] requirement save failed:', err));
      }

      if (currentProjectId && user?.uid) {
        const ex = getExtra(currentProjectId);
        const vNum = ex.versions.length + 1;
        const entry = makeHistoryEntry('requirement_analysis', `Requirement analysis complete — Score: ${score}/100`, user?.email ?? 'User', `v${vNum}`);
        const reportEntry = makeHistoryEntry('report_generated', `Requirement analysis report generated`, user?.email ?? 'User', `v${vNum}`);
        const verEntry = makeHistoryEntry('version_created', `Version ${vNum} created: Requirement Analysis Completed`, user?.email ?? 'User', `v${vNum}`);

        const lightSnapshot = {
          progress: Math.max(ex.progress, 33),
          status: 'in-progress',
          codeAnalyzed: false,
          hasRequirementResult: true,
          requirementScore: score,
          hasThreatResult: false,
          threatCount: null,
          threatRiskScore: null,
          // Full result stored so PDF can be regenerated without re-running analysis
          requirementResult: result.analysis,
        };

        // Write version directly to Firestore — bypasses stale closure issue in updateExtra
        addUserProjectVersion(user.uid, currentProjectId, {
          versionNumber: vNum,
          label: 'Requirement Analysis Completed',
          description: `Security score: ${score}/100. Analysis run on requirements.`,
          createdAt: new Date().toLocaleString(),
          createdBy: user?.email ?? 'User',
          snapshot: lightSnapshot,
        }).catch(err => { console.error('Version save failed:', err); toast.error('Failed to save version'); });

        // Write history entries directly
        for (const e of [entry, reportEntry, verEntry]) {
          addUserHistoryEntry(user.uid, currentProjectId, {
            date: e.date, time: e.time, user: e.user,
            action: e.action as any, description: e.description,
            category: e.category, version: e.version,
          }).catch(console.error);
        }

        // Update scalars only via updateExtra
        updateExtra(currentProjectId, {
          progress: Math.max(ex.progress, 33),
          riskScore: score,
        });
      }

      toast.success(`Analysis complete — Score: ${score}/100`);
      setTimeout(() => requirementReportRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
    } catch {
      setAnalyzingRequirements(false);
      toast.error('Analysis failed. Check backend connection.');
    }
  };

  const handleThreatAnalysis = async () => {
    const ok = designCode.trim() || architectureUploaded;
    if (!ok) { toast.error('Please paste code or upload architecture'); return; }
    setAnalyzingThreats(true);
    try {
      const result = await analysisApi.analyzeThreats({
        projectId: currentProjectId || undefined,
        components: architectureUploaded ? components : [],
        designCode,
        ...(activeOrgProject ? { isOrgProject: true, orgId: activeOrgProject.orgId } : {}),
      });
      setThreatResult(result.analysis);
      setAnalyzingThreats(false);
      setShowThreatAnalysis(true);
      setDesignCompleted(true);
      const count = result.analysis.threats?.length ?? 0;
      const risk = result.analysis.riskScore ?? 0;

      setSessionStats((prev: any) => ({ ...prev, threatsAnalyzed: prev.threatsAnalyzed + count, lastRiskScore: risk, reportsGenerated: prev.reportsGenerated + 1 }));

      // Cache result to Firestore — survives refresh
      if (currentProjectId && user?.uid) {
        saveAnalysisCache(user.uid, currentProjectId, 'threat', result.analysis, designCode.slice(0, 100), designCode)
          .catch(err => console.error('[analysisCache] threat save failed:', err));
      }

      if (currentProjectId && user?.uid) {
        const ex = getExtra(currentProjectId);
        const vNum = ex.versions.length + 1;
        const entry = makeHistoryEntry('threat_analysis', `STRIDE analysis complete — ${count} threats found, Risk: ${risk}/100`, user?.email ?? 'User', `v${vNum}`);
        const reportEntry = makeHistoryEntry('report_generated', `Threat modeling report generated`, user?.email ?? 'User', `v${vNum}`);
        const verEntry = makeHistoryEntry('version_created', `Version ${vNum} created: Threat Modeling Completed`, user?.email ?? 'User', `v${vNum}`);

        const lightSnapshot = {
          progress: Math.max(ex.progress, 66),
          status: 'in-progress',
          codeAnalyzed: false,
          hasRequirementResult: false,
          requirementScore: null,
          hasThreatResult: true,
          threatCount: count,
          threatRiskScore: risk,
          // Full result stored so PDF can be regenerated without re-running analysis
          threatResult: result.analysis,
        };

        addUserProjectVersion(user.uid, currentProjectId, {
          versionNumber: vNum,
          label: 'Threat Modeling Completed',
          description: `${count} threats detected. Risk score: ${risk}/100.`,
          createdAt: new Date().toLocaleString(),
          createdBy: user?.email ?? 'User',
          snapshot: lightSnapshot,
        }).catch(err => { console.error('Version save failed:', err); toast.error('Failed to save version'); });

        for (const e of [entry, reportEntry, verEntry]) {
          addUserHistoryEntry(user.uid, currentProjectId, {
            date: e.date, time: e.time, user: e.user,
            action: e.action as any, description: e.description,
            category: e.category, version: e.version,
          }).catch(console.error);
        }

        updateExtra(currentProjectId, {
          progress: Math.max(ex.progress, 66),
          riskScore: risk,
        });
      }

      toast.success(`STRIDE analysis complete — ${count} threats found`);
      setTimeout(() => threatReportRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
    } catch {
      setAnalyzingThreats(false);
      toast.error('Threat analysis failed.');
    }
  };

  const handleCodeAnalysis = () => {
    const code = reviewCode.trim() || sourceCode.trim();
    if (!code) { toast.error('Please paste source code'); return; }
    setShowCodeAnalysis(true);
    // NOTE: Version and history are created in onResult callback AFTER AI returns result
    // This prevents saving a version with null codeAnalysisResult (Bug 5 fix)
    setTimeout(() => codeReportRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
  };

  // Called by CodeReviewReport once real result is received from AI
  const handleCodeAnalysisResult = (r: any) => {
    setCodeAnalysisResult(r);
    setSessionStats((prev: any) => ({ ...prev, reportsGenerated: prev.reportsGenerated + 1 }));

    const code = reviewCode.trim() || sourceCode.trim();

    if (currentProjectId && user?.uid) {
      const ex = getExtra(currentProjectId);
      const vNum = ex.versions.length + 1;
      const entry = makeHistoryEntry('code_review', `Code review completed — ${codeLanguage}`, user?.email ?? 'User', `v${vNum}`);
      const reportEntry = makeHistoryEntry('report_generated', `Code review report generated — Risk: ${r.overallRisk ?? 'unknown'}`, user?.email ?? 'User', `v${vNum}`);
      const verEntry = makeHistoryEntry('version_created', `Version ${vNum} created: Code Review Completed`, user?.email ?? 'User', `v${vNum}`);

      const lightSnapshot = {
        progress: Math.max(ex.progress, 90),
        status: 'in-progress',
        codeAnalyzed: true,
        hasRequirementResult: !!requirementResult,
        requirementScore: requirementResult?.securityScore ?? null,
        hasThreatResult: !!threatResult,
        threatCount: threatResult?.threats?.length ?? null,
        threatRiskScore: threatResult?.riskScore ?? null,
        codeRisk: r.overallRisk ?? null,
        codeVulnCount: r.vulnerabilities?.length ?? null,
        // Full result stored so PDF can be regenerated without re-running analysis
        codeResult: r,
        codeLanguage,
      };

      addUserProjectVersion(user.uid, currentProjectId, {
        versionNumber: vNum,
        label: 'Code Review Completed',
        description: `Static security analysis on ${codeLanguage} — ${r.vulnerabilities?.length ?? 0} issues found.`,
        createdAt: new Date().toLocaleString(),
        createdBy: user?.email ?? 'User',
        snapshot: lightSnapshot,
      }).catch(err => { console.error('Version save failed:', err); toast.error('Failed to save version'); });

      for (const e of [entry, reportEntry, verEntry]) {
        addUserHistoryEntry(user.uid, currentProjectId, {
          date: e.date, time: e.time, user: e.user,
          action: e.action as any, description: e.description,
          category: e.category, version: e.version,
        }).catch(console.error);
      }

      updateExtra(currentProjectId, { progress: Math.max(ex.progress, 90) });

      // Save to Firestore cache now that real result exists
      saveAnalysisCache(user.uid, currentProjectId, 'code', r, code.slice(0, 100), code).catch(console.error);

      // FIX 5: If this is an org project, also update the org project's Firestore doc
      // so OrgAdminDashboard can see the latest code review risk score in real-time.
      if (activeOrgProject?.orgId && activeOrgProject?.projectId) {
        import('firebase/firestore').then(({ doc, updateDoc, serverTimestamp }) => {
          import('../../lib/firebase').then(({ db }) => {
            updateDoc(
              doc(db, 'organizations', activeOrgProject.orgId, 'projects', activeOrgProject.projectId),
              {
                lastCodeRiskScore:   r.overallRisk ?? null,
                lastCodeVulnCount:   r.vulnerabilities?.length ?? 0,
                lastScanAt:          serverTimestamp(),
              }
            ).catch(console.error);
          });
        });
      }
    }
  };

  const handlePhaseMapping = async () => {
    if (phaseMappingCooldown > 0) {
      toast.error(`Please wait ${phaseMappingCooldown}s before running another cross-phase check`);
      return;
    }
    if (!requirementResult && !threatResult && !codeAnalysisResult) {
      toast.error('Run at least one analysis first (Requirements, Design, or Code Review)');
      return;
    }
    setAnalyzingPhaseMapping(true);
    // Start 30s cooldown
    setPhaseMappingCooldown(30);
    const timer = setInterval(() => {
      setPhaseMappingCooldown(prev => {
        if (prev <= 1) { clearInterval(timer); return 0; }
        return prev - 1;
      });
    }, 1000);
    // Store timer ref for cleanup on unmount
    (window as any).__phaseMappingTimer = timer;
    try {
      const token = await (await import('firebase/auth')).getAuth().currentUser?.getIdToken() ?? '';

      const res = await fetch(
        `${import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000'}/api/analysis/phase-mapping`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            projectId: currentProjectId || undefined,
            requirementsText: requirementsCode.trim() || requirementsText.trim(),
            requirementResult: requirementResult || undefined,
            threatResult: threatResult || undefined,
            codeResult: codeAnalysisResult || undefined,
            ...(activeOrgProject ? { isOrgProject: true, orgId: activeOrgProject.orgId } : {}),
          }),
        }
      );
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Phase mapping failed');

      setPhaseMappingResult(data.result);
      // Save to Firestore cache so it survives project switch
      if (user?.uid && currentProjectId) {
        saveAnalysisCache(user.uid, currentProjectId, 'crossphase' as any, data.result, '', '').catch(console.error);
      }

      const score = data.result.overallScore ?? 0;

      // Save version + history
      if (currentProjectId && user?.uid) {
        const ex = getExtra(currentProjectId);
        const vNum = ex.versions.length + 1;

        const crossSnapshot = {
          progress: ex.progress,
          status: ex.status,
          codeAnalyzed: !!codeAnalysisResult,
          hasRequirementResult: !!requirementResult,
          requirementScore: requirementResult?.securityScore ?? null,
          hasThreatResult: !!threatResult,
          threatCount: threatResult?.threats?.length ?? null,
          threatRiskScore: threatResult?.riskScore ?? null,
          crossPhaseScore: score,
          conflictCount: data.result.conflicts?.length ?? 0,
          warningCount: data.result.warnings?.length ?? 0,
          // Full result stored so PDF can be regenerated without re-running
          crossPhaseResult: data.result,
        };

        addUserProjectVersion(user.uid, currentProjectId, {
          versionNumber: vNum,
          label: `Cross-Phase Consistency Check`,
          description: `Score: ${score}/100 — ${data.result.conflicts?.length ?? 0} conflicts, ${data.result.warnings?.length ?? 0} warnings`,
          createdAt: new Date().toLocaleString(),
          createdBy: user?.email ?? 'User',
          snapshot: crossSnapshot,
        }).catch(err => { console.error('Version save failed:', err); });

        const verEntry = makeHistoryEntry('version_created', `Version ${vNum} created: Cross-Phase Analysis (Score: ${score}/100)`, user?.email ?? 'User', `v${vNum}`);
        const entry = makeHistoryEntry(
          'report_generated',
          `Cross-phase consistency check — Score: ${score}/100, ${data.result.conflicts?.length ?? 0} conflicts, ${data.result.warnings?.length ?? 0} warnings`,
          user?.email ?? 'User', `v${vNum}`
        );
        for (const e of [entry, verEntry]) {
          addUserHistoryEntry(user.uid, currentProjectId, {
            date: e.date, time: e.time, user: e.user,
            action: e.action as any, description: e.description,
            category: e.category, version: e.version,
          }).catch(console.error);
        }
        setSessionStats((prev: any) => ({ ...prev, reportsGenerated: prev.reportsGenerated + 1 }));
      }

      toast.success(`Cross-phase analysis complete — Score: ${score}/100`);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Phase mapping failed');
    }
    setAnalyzingPhaseMapping(false);
  };

  // ── Dependency / SCA scan ─────────────────────────────────────────────────
  const handleDepScan = async () => {
    if (!depFileContent.trim()) { toast.error('Paste your dependency file content first'); return; }
    setScanningDeps(true);
    setDepScanResult(null);
    try {
      // FIX 2: Replaced raw fetch() + dynamic firebase import with analysisApi.scanDependencies()
      // which handles auth centrally via apiService request() helper.
      // FIX 3: Added isOrgProject + orgId so employee SCA results save to
      // organizations/{orgId}/projects/{projectId} — same as requirements/threats/phase-mapping.
      const data = await analysisApi.scanDependencies({
        content:     depFileContent,
        filename:    depFileName,
        projectId:   currentProjectId || undefined,
        ...(activeOrgProject ? { isOrgProject: true, orgId: activeOrgProject.orgId } : {}),
      });
      if (!data.success) throw new Error(data.error || 'Scan failed');
      setDepScanResult(data);
      toast.success(`Scan complete — ${data.vulnCount} vulnerabilities in ${data.totalDeps} dependencies`);
      // Save to Firestore cache so it survives project switch
      if (user?.uid && currentProjectId) {
        saveAnalysisCache(user.uid, currentProjectId, 'dependency' as any, data, depFileName, depFileContent).catch(console.error);
      }
      // Auto-scroll to results
      setTimeout(() => depResultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);

      if (currentProjectId && user?.uid) {
        const ex = getExtra(currentProjectId);
        const vNum = ex.versions.length + 1;

        const depSnapshot = {
          progress: ex.progress,
          status: ex.status,
          codeAnalyzed: !!codeAnalysisResult,
          hasRequirementResult: !!requirementResult,
          requirementScore: null,
          hasThreatResult: !!threatResult,
          threatCount: null,
          threatRiskScore: null,
          depFileName,
          depTotalDeps: data.totalDeps,
          depVulnCount: data.vulnCount,
          depCritical: data.critical ?? 0,
          // Full result stored so PDF can be regenerated without re-running
          depScanResult: data,
        };

        addUserProjectVersion(user.uid, currentProjectId, {
          versionNumber: vNum,
          label: `Dependency Scan (${depFileName})`,
          description: `${data.vulnCount} vulnerabilities in ${data.totalDeps} packages — ${data.critical ?? 0} critical`,
          createdAt: new Date().toLocaleString(),
          createdBy: user?.email ?? 'User',
          snapshot: depSnapshot,
        }).catch(err => { console.error('Version save failed:', err); });

        const verEntry = makeHistoryEntry('version_created', `Version ${vNum} created: Dependency Scan (${data.vulnCount} CVEs)`, user?.email ?? 'User', `v${vNum}`);
        const entry = makeHistoryEntry(
          'report_generated',
          `Dependency scan (${depFileName}) — ${data.vulnCount} vulnerabilities, ${data.critical ?? 0} critical`,
          user?.email ?? 'User', `v${vNum}`
        );
        for (const e of [entry, verEntry]) {
          addUserHistoryEntry(user.uid, currentProjectId, {
            date: e.date, time: e.time, user: e.user,
            action: e.action as any, description: e.description,
            category: e.category, version: e.version,
          }).catch(console.error);
        }
        setSessionStats((prev: any) => ({ ...prev, reportsGenerated: prev.reportsGenerated + 1 }));
      }
    } catch (err: any) {
      toast.error(err.message || 'Dependency scan failed');
    }
    setScanningDeps(false);
  };

  const handleDepPdfDownload = async () => {
    if (!depScanResult) return;
    try {
      await generateDependencyPDF(depScanResult, currentProject?.name ?? 'Project', depFileName);
      toast.success('PDF report downloaded');
    } catch (err) {
      console.error(err);
      toast.error('PDF generation failed');
    }
  };

  // ── Pipeline security (CI/CD) scan ─────────────────────────────────────────
  const handlePipelineScan = async () => {
    if (!pipelineContent.trim()) { toast.error('Paste your CI/CD config file content first'); return; }
    setPipelineScanning(true);
    setPipelineResults(null);
    try {
      // Backend persists the result (version + phase doc) for org projects when
      // projectId + isOrgProject are provided — same contract as scanDependencies.
      const data = await analysisApi.analyzePipelineConfig(
        pipelineContent,
        pipelineFilename,
        currentProject?.id || undefined,
        !!activeOrgProject,
      );
      if (!data.success) throw new Error(data.error || 'Scan failed');
      setPipelineResults(data);
      toast.success(`Pipeline scan complete — ${data.totalFindings} finding${data.totalFindings !== 1 ? 's' : ''} (${data.riskLevel} risk)`);
      // Auto-scroll to results
      setTimeout(() => pipelineResultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Pipeline scan failed');
    }
    setPipelineScanning(false);
  };

  const handleCrossPhasePdf = async () => {
    if (!phaseMappingResult) return;
    try {
      await generateCrossPhasePDF(phaseMappingResult, currentProject?.name ?? 'Project');
      toast.success('PDF report downloaded');
    } catch (err) {
      console.error(err);
      toast.error('PDF generation failed');
    }
  };

  const handleFullProjectPdf = async () => {
    if (!requirementResult && !threatResult && !codeAnalysisResult && !depScanResult && !pipelineResults && !phaseMappingResult) {
      toast.error('Run at least one analysis first');
      return;
    }
    try {
      await generateFullProjectPDF(currentProject?.name ?? 'Project', {
        requirementResult:  requirementResult  || undefined,
        threatResult:       threatResult       || undefined,
        codeResult:         codeAnalysisResult || undefined,
        depScanResult:      depScanResult      || undefined,
        pipelineResult:     pipelineResults    || undefined,
        crossPhaseResult:   phaseMappingResult || undefined,
        codeLanguage:       codeLanguage,
        depFileName:        depFileName,
        pipelineFilename:   pipelineFilename,
      });
      toast.success('Full project report downloaded');
      if (currentProjectId && user?.uid) {
        const entry = makeHistoryEntry('report_generated', 'Full project security report generated (PDF)', user?.email ?? 'User');
        addUserHistoryEntry(user.uid, currentProjectId, {
          date: entry.date, time: entry.time, user: entry.user,
          action: entry.action as any, description: entry.description,
          category: entry.category,
        }).catch(console.error);
        setSessionStats((prev: any) => ({ ...prev, reportsGenerated: prev.reportsGenerated + 1 }));
      }
    } catch (err) {
      console.error(err);
      toast.error('PDF generation failed');
    }
  };

  // ── False positive / accepted risk ────────────────────────────────────────
  const toggleFindingStatus = (id: string, status: 'false_positive' | 'accepted') => {
    const newStatus = falsePositives[id] === status ? null : status;
    setFalsePositives(prev => ({ ...prev, [id]: newStatus }));
    // Persist to Firestore remediations subcollection
    if (user?.uid && currentProjectId) {
      saveRemediation(user.uid, currentProjectId, id, newStatus ?? 'none', status).catch(console.error);
    }
    toast.success(status === 'false_positive' ? 'Marked as false positive' : 'Marked as accepted risk');
  };

  const handleRestoreVersion = (ver: ProjectVersion) => {
    if (!currentProjectId) return;
    const ex = getExtra(currentProjectId);
    const entry = makeHistoryEntry(
      'version_created',
      `Restored to v${ver.versionNumber}: ${ver.label}`,
      user?.email ?? 'User',
      `v${ver.versionNumber}`
    );

    // Restore actual data from the stored snapshot — no re-run needed
    const snap = ver.snapshot as any;
    let restoredCount = 0;
    if (snap.requirementResult) {
      setRequirementResult(snap.requirementResult);
      setShowRequirementAnalysis(true);
      restoredCount++;
    }
    if (snap.threatResult) {
      setThreatResult(snap.threatResult);
      setShowThreatAnalysis(true);
      restoredCount++;
    }
    if (snap.codeResult) {
      setCodeAnalysisResult(snap.codeResult);
      setShowCodeAnalysis(true);
      if (snap.codeLanguage) setCodeLanguage(snap.codeLanguage);
      restoredCount++;
    }
    if (snap.crossPhaseResult) {
      setPhaseMappingResult(snap.crossPhaseResult);
      restoredCount++;
    }
    if (snap.depScanResult) {
      setDepScanResult(snap.depScanResult);
      if (snap.depFileName) setDepFileName(snap.depFileName);
      restoredCount++;
    }

    updateExtra(currentProjectId, { history: [...ex.history, entry] });

    if (restoredCount > 0) {
      toast.success(`Restored to ${ver.label} — ${restoredCount} report${restoredCount > 1 ? 's' : ''} loaded, ready to view or download`);
    } else {
      toast.success(`Restored to ${ver.label}`);
    }
  };

  // Download the PDF for a specific version directly from its stored snapshot — no re-run needed
  const handleDownloadVersionPdf = async (ver: ProjectVersion) => {
    const snap = ver.snapshot as any;
    const projectName = currentProject?.name ?? 'Project';
    try {
      if (snap.requirementResult) {
        await generateRequirementPDF(snap.requirementResult, projectName);
        toast.success(`PDF downloaded for v${ver.versionNumber}`);
        return;
      }
      if (snap.threatResult) {
        await generateThreatPDF(snap.threatResult, projectName);
        toast.success(`PDF downloaded for v${ver.versionNumber}`);
        return;
      }
      if (snap.codeResult) {
        await generateCodeReviewPDF(snap.codeResult, projectName, snap.codeLanguage ?? 'code');
        toast.success(`PDF downloaded for v${ver.versionNumber}`);
        return;
      }
      if (snap.crossPhaseResult) {
        await generateCrossPhasePDF(snap.crossPhaseResult, projectName);
        toast.success(`PDF downloaded for v${ver.versionNumber}`);
        return;
      }
      if (snap.depScanResult) {
        await generateDependencyPDF(snap.depScanResult, projectName, snap.depFileName ?? 'package.json');
        toast.success(`PDF downloaded for v${ver.versionNumber}`);
        return;
      }
      toast.error('No report data stored in this version — run a new analysis to generate a downloadable version');
    } catch (err) {
      console.error('Version PDF download failed:', err);
      toast.error('Failed to generate PDF for this version');
    }
  };

  const handleAddVersionNote = (versionId: string, note: string) => {
    if (!currentProjectId || !note.trim()) return;
    // Optimistic local update
    const ex = getExtra(currentProjectId);
    updateExtra(currentProjectId, {
      versions: ex.versions.map(v => v.id === versionId ? { ...v, notes: note.trim() } : v),
    });
    // Persist to Firestore
    if (user?.uid) {
      updateUserProjectVersionNote(user.uid, currentProjectId, versionId, note.trim()).catch(console.error);
    }
    toast.success('Note saved');
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  };

  const clearCode = (setter: React.Dispatch<React.SetStateAction<string>>, label: string) => {
    setter('');
    toast.success(`${label} cleared`);
  };

  // ── Overview summary data ──────────────────────────────────────────────────

  const allExtras = projects.map(p => getExtra(p.id));
  const activeProjects = projects.filter(p => getExtra(p.id).status !== 'completed');
  const completedProjects = projects.filter(p => getExtra(p.id).status === 'completed');
  const filteredProjects = projects.filter(p =>
    p.name.toLowerCase().includes(projectSearch.toLowerCase()) ||
    (p.description ?? '').toLowerCase().includes(projectSearch.toLowerCase())
  );
  const allHistory = allExtras
    .flatMap(e => e.history ?? [])
    .sort((a, b) => {
      // Sort by date+time string descending
      const ta = new Date(`${a.date} ${a.time}`).getTime();
      const tb = new Date(`${b.date} ${b.time}`).getTime();
      return tb - ta;
    })
    .slice(0, 8);
  const avgRisk = allExtras.length > 0
    ? Math.round(allExtras.reduce((s, e) => s + (e.riskScore ?? 0), 0) / allExtras.length)
    : 0;
  const totalVersions = allExtras.reduce((s, e) => s + (e.versions?.length ?? 0), 0);
  const latestVersionProject = allExtras
    .flatMap(e => e.versions?.map(v => ({ ...v, projectId: '' })) ?? [])
    .sort((a, b) => b.versionNumber - a.versionNumber)[0];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <motion.div {...PAGE_FADE} className="min-h-screen bg-gradient-to-b from-[#0A0E1A] to-[#0F1629]">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="border-b border-[#00D4FF]/20 bg-[#0A0E1A]/95 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <Link
                to="/"
                className="flex items-center gap-2 cursor-pointer"
                aria-label="Go to home"
              >
                <img src={logoImage} alt="FortifyLens" className="w-10 h-10 rounded-xl object-contain drop-shadow-[0_0_10px_rgba(0,212,255,0.5)]" />
                <div className="text-left">
                  <div className="font-bold text-white text-lg">FortifyLens</div>
                  <div className="text-xs text-[#00D4FF]">User Workspace</div>
                </div>
              </Link>
              <div className="hidden md:flex items-center gap-1 bg-white/5 rounded-lg p-1">
                <button
                  onClick={() => setActiveView('overview')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeView === 'overview' ? 'bg-[#00D4FF] text-white' : 'text-gray-400 hover:text-white'}`}
                >
                  <BarChart3 className="w-4 h-4 inline mr-2" />Overview
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Dialog open={showCreateProject} onOpenChange={setShowCreateProject}>
                <DialogTrigger asChild>
                  <Button className="bg-gradient-to-r from-[#00D4FF] to-[#00D4FF]/80 text-white border-0">
                    <PlusCircle className="w-4 h-4 mr-2" />
                    <span className="hidden sm:inline">Create Project</span>
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-[#0A0E1A] border-[#00D4FF]/20 max-w-lg">
                  <DialogHeader>
                    <DialogTitle className="text-white text-xl">Create New Project</DialogTitle>
                    <DialogDescription className="text-gray-400">Initialize a new security assessment</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 pt-4">
                    <div>
                      <Label className="text-white mb-2">Project Name *</Label>
                      <Input value={newProjectName} onChange={e => setNewProjectName(e.target.value)}
                        placeholder="e.g., E-Commerce Security Assessment"
                        className="bg-white/5 border-[#00D4FF]/20 text-white mt-2" />
                    </div>
                    <div>
                      <Label className="text-white mb-2">Description</Label>
                      <Textarea value={newProjectDesc} onChange={e => setNewProjectDesc(e.target.value)}
                        placeholder="Optional description..." className="bg-white/5 border-[#00D4FF]/20 text-white mt-2" rows={2} />
                    </div>
                    <div>
                      <Label className="text-white mb-2">Domain</Label>
                      <Select value={newProjectDomain} onValueChange={setNewProjectDomain}>
                        <SelectTrigger className="bg-white/5 border-[#00D4FF]/20 text-white mt-2">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-[#0A0E1A] border-[#00D4FF]/20">
                          <SelectItem value="web-application" className="text-white">Web Application</SelectItem>
                          <SelectItem value="mobile-app" className="text-white">Mobile App</SelectItem>
                          <SelectItem value="api" className="text-white">API / Microservices</SelectItem>
                          <SelectItem value="cloud" className="text-white">Cloud Infrastructure</SelectItem>
                          <SelectItem value="desktop" className="text-white">Desktop Application</SelectItem>
                          <SelectItem value="iot" className="text-white">IoT / Embedded</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex gap-3 pt-2">
                      <Button onClick={handleCreateProject} disabled={!newProjectName}
                        className="flex-1 bg-gradient-to-r from-[#00D4FF] to-[#00D4FF]/80 text-white border-0">
                        Create Project
                      </Button>
                      <Button onClick={() => setShowCreateProject(false)} variant="outline"
                        className="flex-1 border-[#00D4FF]/50 text-[#00D4FF]">Cancel</Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              <div className="hidden sm:flex items-center gap-2">
                <div className="text-right">
                  <div className="text-sm text-white font-medium">{user?.fullName || user?.email}</div>
                  <div className="text-xs text-[#00D4FF]">User</div>
                </div>
                <UserAvatar size={36} editable />
              </div>
              <Button onClick={handleLogout} variant="outline" className="border-[#00D4FF]/50 text-[#00D4FF] hover:bg-[#00D4FF]/10">
                <LogOut className="w-4 h-4 mr-2" /><span className="hidden sm:inline">Logout</span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">

        {/* ── Firestore error banner ─────────────────────────────────────────── */}
        {firestoreError && (
          <div className="mb-4 flex items-center gap-3 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span className="text-red-300 text-sm">{firestoreError}</span>
            <button onClick={() => setFirestoreError(null)} className="ml-auto text-red-400 hover:text-red-300"><X className="w-4 h-4" /></button>
          </div>
        )}

        {/* ── Stale cache banner ─────────────────────────────────────────────── */}
        {staleCache.length > 0 && currentProjectId && (
          <div className="mb-4 flex items-center gap-3 bg-yellow-500/10 border border-yellow-500/25 rounded-xl px-4 py-3">
            <RefreshCw className="w-4 h-4 text-yellow-400 shrink-0" />
            <span className="text-yellow-300 text-sm">Analysis results are over 7 days old — consider re-running {staleCache.join(', ')} analysis for up-to-date results.</span>
            <button onClick={() => setStaleCache([])} className="ml-auto text-yellow-400 hover:text-yellow-300"><X className="w-4 h-4" /></button>
          </div>
        )}

        {/* ── Loading skeleton ───────────────────────────────────────────────── */}
        {loadingProjects && (
          <div className="space-y-4 animate-pulse">
            <div className="h-48 rounded-2xl bg-white/5" />
            <div className="grid grid-cols-3 gap-4">
              <div className="h-32 rounded-xl bg-white/5" />
              <div className="h-32 rounded-xl bg-white/5" />
              <div className="h-32 rounded-xl bg-white/5" />
            </div>
            <div className="h-64 rounded-xl bg-white/5" />
          </div>
        )}

        {!loadingProjects && (<>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* OVERVIEW                                                           */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {activeView === 'overview' && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">

            {/* ── Platform Portal (hero) with Active Projects + New Project ── */}
            <div className="relative overflow-hidden rounded-2xl border border-[#00D4FF]/15 bg-gradient-to-br from-[#060a14] via-[#0a0e1a] to-[#060d1a]">
              <div className="absolute -top-24 -left-24 w-72 h-72 bg-[#00D4FF]/8 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute -bottom-24 -right-24 w-72 h-72 bg-purple-500/8 rounded-full blur-3xl pointer-events-none" />
              <div className="relative z-10 p-8 md:p-10">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div>
                    <div className="inline-flex items-center gap-2 bg-[#00D4FF]/10 border border-[#00D4FF]/20 rounded-full px-3 py-1 mb-3">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#00D4FF] animate-pulse" />
                      <span className="text-[#00D4FF] text-xs font-medium tracking-wide">FortifyLens Platform</span>
                    </div>
                    <h2 className="text-white text-2xl md:text-3xl font-bold leading-tight">
                      Secure every phase of <br className="hidden md:block" />
                      <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00D4FF] to-purple-400">your software lifecycle</span>
                    </h2>
                    <p className="text-gray-400 text-sm mt-2 max-w-md">
                      From requirements to deployment — every analysis creates a versioned report you can track, compare, and audit.
                    </p>
                  </div>

                  {/* Active Projects card */}
                  <div className="shrink-0 bg-white/5 border border-[#00D4FF]/10 rounded-2xl px-8 py-5 text-center">
                    <div className="text-4xl font-black text-white">{projects.length}</div>
                    <div className="text-xs text-gray-400 mt-1">Total Projects</div>
                    <div className="mt-3 flex gap-2 justify-center">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/20">
                        {completedProjects.length} done
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-[#00D4FF]/10 text-[#00D4FF] border border-[#00D4FF]/20">
                        {activeProjects.length} active
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-8 pt-6 border-t border-white/5">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#00D4FF]/10 border border-[#00D4FF]/20 flex items-center justify-center">
                      <Zap className="w-4 h-4 text-[#00D4FF]" />
                    </div>
                    <div>
                      <div className="text-white text-sm font-medium">Start a new assessment</div>
                      <div className="text-gray-500 text-xs">Each project gets its own workspace, history & reports</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Overview Info Grid ── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

              {/* A. Active Projects Summary */}
              <Card className="p-5 bg-white/5 border-[#00D4FF]/20">
                <div className="flex items-center gap-2 mb-4">
                  <FolderOpen className="w-4 h-4 text-[#00D4FF]" />
                  <span className="text-white font-semibold text-sm">Project Summary</span>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400 text-xs">Active</span>
                    <span className="text-[#00D4FF] font-bold">{activeProjects.length}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400 text-xs">Completed</span>
                    <span className="text-green-400 font-bold">{completedProjects.length}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400 text-xs">Total Projects</span>
                    <span className="text-white font-bold">{projects.length}</span>
                  </div>
                </div>
              </Card>

              {/* C. Project Health */}
              <Card className="p-5 bg-white/5 border-[#00D4FF]/20">
                <div className="flex items-center gap-2 mb-4">
                  <Shield className="w-4 h-4 text-red-400" />
                  <span className="text-white font-semibold text-sm">Security Health</span>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400 text-xs">Avg Risk Score</span>
                    <span className={`font-bold ${avgRisk >= 70 ? 'text-red-400' : avgRisk >= 40 ? 'text-yellow-400' : 'text-green-400'}`}>
                      {avgRisk > 0 ? `${avgRisk}/100` : '—'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400 text-xs">Reports Generated</span>
                    <span className="text-white font-bold">{sessionStats.reportsGenerated}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400 text-xs">Threats Analyzed</span>
                    <span className="text-white font-bold">{sessionStats.threatsAnalyzed}</span>
                  </div>
                </div>
              </Card>

              {/* D. Risk Trend */}
              <Card className="p-5 bg-white/5 border-[#00D4FF]/20">
                <div className="flex items-center gap-2 mb-4">
                  <BarChart2 className="w-4 h-4 text-[#00D4FF]" />
                  <span className="text-white font-semibold text-sm">Risk Trend</span>
                </div>
                {(() => {
                  const trendData = projects
                    .map(p => {
                      const ex = getExtra(p.id);
                      return ex.riskScore > 0 ? { name: p.name.slice(0, 10), risk: ex.riskScore, progress: ex.progress } : null;
                    })
                    .filter(Boolean) as { name: string; risk: number; progress: number }[];
                  return trendData.length === 0 ? (
                    <div className="text-center py-4">
                      <p className="text-gray-500 text-xs">Run analyses to see risk trends</p>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={90}>
                      <ReLineChart data={trendData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#6b7280' }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: '#6b7280' }} width={24} />
                        <Tooltip
                          contentStyle={{ background: '#0a0e1a', border: '1px solid rgba(0,212,255,0.2)', borderRadius: 8, fontSize: 11 }}
                          labelStyle={{ color: '#fff' }}
                        />
                        <Line type="monotone" dataKey="risk" stroke="#ef4444" strokeWidth={2} dot={{ r: 3, fill: '#ef4444' }} name="Risk" />
                        <Line type="monotone" dataKey="progress" stroke="#00D4FF" strokeWidth={2} dot={{ r: 3, fill: '#00D4FF' }} name="Progress" />
                      </ReLineChart>
                    </ResponsiveContainer>
                  );
                })()}
              </Card>
            </div>

            {/* ── Projects List ── */}
            <Card className="p-6 bg-white/5 border-[#00D4FF]/20">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-white font-semibold text-lg">Projects</h2>
                <span className="text-xs text-gray-500">{projects.length} total</span>
              </div>

              {/* Search */}
              {projects.length > 0 && (
                <div className="relative mb-5">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <Input
                    value={projectSearch}
                    onChange={e => setProjectSearch(e.target.value)}
                    placeholder="Search projects..."
                    className="pl-9 bg-white/5 border-white/10 text-white text-sm h-9"
                  />
                  {projectSearch && (
                    <button onClick={() => setProjectSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}

              {projects.length === 0 ? (
                <div className="text-center py-12">
                  <FolderOpen className="w-12 h-12 text-gray-500 mx-auto mb-3" />
                  <p className="text-gray-400 text-sm">No projects yet.</p>
                  <Button onClick={() => setShowCreateProject(true)} className="mt-4 bg-[#00D4FF] text-white">
                    <PlusCircle className="w-4 h-4 mr-2" />Create First Project
                  </Button>
                </div>
              ) : filteredProjects.length === 0 ? (
                <div className="text-center py-8">
                  <Search className="w-8 h-8 text-gray-500 mx-auto mb-2" />
                  <p className="text-gray-400 text-sm">No projects match "{projectSearch}"</p>
                  <button onClick={() => setProjectSearch('')} className="text-[#00D4FF] text-xs mt-1 hover:underline">Clear search</button>
                </div>
              ) : (() => {
                const inProgress = filteredProjects.filter(p => getExtra(p.id).status !== 'completed');
                const completed  = filteredProjects.filter(p => getExtra(p.id).status === 'completed');

                const ProjectRow = ({ project }: { project: typeof projects[0] }) => {
                  const ex = getExtra(project.id);
                  const isComplete = ex.status === 'completed';
                  const isDeleting = deletingProjectId === project.id;
                  const confirmingDelete = deleteConfirmId === project.id;
                  return (
                    <motion.div variants={CARD_STAGGER_CHILD} className={`rounded-xl border transition-all ${
                      isComplete ? 'bg-green-500/5 border-green-500/20 hover:border-green-500/30'
                                 : 'bg-white/5 border-[#00D4FF]/10 hover:border-[#00D4FF]/25'
                    }`}>
                      <div className="flex items-center justify-between p-4">
                        <div className="flex items-center gap-4 flex-1 min-w-0">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isComplete ? 'bg-green-500/15 border border-green-500/20' : 'bg-[#00D4FF]/10 border border-[#00D4FF]/15'}`}>
                            {isComplete ? <CheckCircle2 className="w-5 h-5 text-green-400" /> : <FolderOpen className="w-5 h-5 text-[#00D4FF]" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-white font-semibold truncate">{project.name}</span>
                              {ex.riskScore > 0 && (
                                <span className={`text-xs font-bold px-1.5 py-0.5 rounded-md border ${
                                  ex.riskScore >= 70 ? 'text-red-400 bg-red-500/10 border-red-500/20'
                                  : ex.riskScore >= 40 ? 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20'
                                  : 'text-green-400 bg-green-500/10 border-green-500/20'
                                }`}>
                                  Risk {ex.riskScore}
                                </span>
                              )}
                              {ex.versions.length > 0 && (
                                <span className="text-xs px-1.5 py-0.5 rounded-md bg-purple-500/10 text-purple-300 border border-purple-500/15">
                                  {ex.versions.length} version{ex.versions.length !== 1 ? 's' : ''}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-gray-500 truncate mt-0.5">{(project as any).description || 'Security assessment project'}</div>
                            <div className="flex items-center gap-3 mt-2">
                              <div className="flex-1 bg-white/8 rounded-full h-1.5 max-w-[140px]">
                                <motion.div className={`h-1.5 rounded-full transition-all ${isComplete ? 'bg-gradient-to-r from-green-400 to-green-500' : 'bg-gradient-to-r from-[#00D4FF] to-purple-400'}`}
                                  initial={false}
                                  animate={{ width: `${ex.progress}%` }}
                                  transition={PROGRESS_TRANSITION} />
                              </div>
                              <span className="text-xs text-gray-500">{ex.progress}%</span>
                              <div className="hidden md:flex items-center gap-1">
                                {(['requirement', 'design', 'development'] as const).map(phase => (
                                  <div key={phase} title={phase}
                                    className={`w-2 h-2 rounded-full ${isComplete ? 'bg-green-500' : (project as any).currentPhase === phase ? 'bg-[#00D4FF]' : 'bg-white/15'}`} />
                                ))}
                              </div>
                              {isComplete && ex.completedAt && (
                                <span className="text-xs text-green-400/60 flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {ex.completedAt ? (() => { try { const d = ex.completedAt as any; if (typeof d?.toDate === 'function') return d.toDate().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }); if (d?._seconds) return new Date(d._seconds * 1000).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }); return new Date(d).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return String(ex.completedAt); } })() : ''}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 ml-3 shrink-0">
                          <span className={`hidden sm:inline text-xs px-2 py-1 rounded-full border ${
                            isComplete ? 'bg-green-500/15 text-green-300 border-green-500/25'
                                       : 'bg-[#00D4FF]/10 text-[#00D4FF] border-[#00D4FF]/25'
                          }`}>
                            {isComplete ? 'Completed' : 'In Progress'}
                          </span>

                          {/* Edit */}
                          <Button size="sm" variant="outline"
                            onClick={() => { setEditingProject(project); setEditName(project.name); setEditDesc((project as any).description ?? ''); }}
                            className="border-white/15 text-gray-400 hover:text-white hover:border-white/30 h-8 w-8 p-0">
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>

                          {/* Delete */}
                          {confirmingDelete ? (
                            <div className="flex items-center gap-1">
                              <Button size="sm" disabled={isDeleting}
                                onClick={() => handleDeleteProject(project.id)}
                                className="bg-red-600 hover:bg-red-700 text-white h-8 px-2 text-xs">
                                {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Confirm'}
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => setDeleteConfirmId(null)}
                                className="border-white/15 text-gray-400 h-8 px-2 text-xs">Cancel</Button>
                            </div>
                          ) : (
                            <Button size="sm" variant="outline"
                              onClick={() => setDeleteConfirmId(project.id)}
                              className="border-red-500/20 text-red-400 hover:bg-red-500/10 hover:border-red-500/40 h-8 w-8 p-0">
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}

                          {/* Mark Complete */}
                          {!isComplete && (
                            <Button onClick={() => handleMarkComplete(project.id)} size="sm" variant="outline"
                              className="border-green-500/30 text-green-400 hover:bg-green-500/10 text-xs h-8 px-2 hidden sm:flex">
                              <CheckCircle2 className="w-3 h-3 mr-1" />Done
                            </Button>
                          )}

                          {/* Open / Details */}
                          <Button
                            onClick={() => {
                              if (isComplete) setViewingProject(project);
                              else {
                                // Clear org project context — personal project workspace only
                                setActiveOrgProject(null);
                                setOrgPhaseStatus({});
                                setOrgProjectNotifications([]);
                                setCurrentProjectId(project.id);
                                setActiveView('workspace');
                              }
                            }}
                            size="sm"
                            className={isComplete ? 'bg-green-600 hover:bg-green-700 text-white h-8' : 'bg-[#00D4FF] hover:bg-[#00D4FF]/90 text-white h-8'}>
                            {isComplete ? <Eye className="w-3.5 h-3.5 mr-1" /> : <ExternalLink className="w-3.5 h-3.5 mr-1" />}
                            {isComplete ? 'Details' : 'Open'}
                          </Button>
                        </div>
                      </div>
                    </motion.div>
                  );
                };

                return (
                  <div className="space-y-5">
                    {inProgress.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <Activity className="w-4 h-4 text-[#00D4FF]" />
                          <span className="text-sm font-medium text-[#00D4FF]">In Progress ({inProgress.length})</span>
                        </div>
                        <motion.div className="space-y-3" variants={CARD_STAGGER_PARENT} initial="hidden" animate="visible">{inProgress.map(p => <ProjectRow key={p.id} project={p} />)}</motion.div>
                      </div>
                    )}
                    {completed.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <CheckCircle2 className="w-4 h-4 text-green-400" />
                          <span className="text-sm font-medium text-green-400">Completed ({completed.length})</span>
                        </div>
                        <motion.div className="space-y-3" variants={CARD_STAGGER_PARENT} initial="hidden" animate="visible">{completed.map(p => <ProjectRow key={p.id} project={p} />)}</motion.div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </Card>

            {/* ── B. Recent Activity Panel ── */}
            <Card className="p-6 bg-white/5 border-[#00D4FF]/20">
              <div className="flex items-center gap-2 mb-4">
                <Activity className="w-4 h-4 text-[#00D4FF]" />
                <span className="text-white font-semibold">Recent Activity</span>
                <span className="text-xs text-gray-400 ml-auto">Across all projects</span>
              </div>
              {allHistory.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">
                  <Activity className="w-6 h-6 mx-auto mb-2 opacity-30" />
                  No activity yet. Create a project to get started.
                </div>
              ) : (
                <div className="space-y-2">
                  {allHistory.map(entry => (
                    <div key={entry.id} className={`flex items-center gap-3 p-3 rounded-lg border ${actionColor(entry.action)}`}>
                      <div className="w-1.5 h-1.5 rounded-full bg-current shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium truncate">{actionLabel(entry.action)}</span>
                          <span className="text-xs text-gray-500 shrink-0">{entry.time}</span>
                        </div>
                        <p className="text-xs text-gray-400 truncate mt-0.5">{entry.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* ── Completed Project Detail Modal ── */}
            {viewingProject && (() => {
              const ex = getExtra(viewingProject.id);
              return (
                <Dialog open={!!viewingProject} onOpenChange={() => { setViewingProject(null); setShowReopenConfirm(false); }}>
                  <DialogContent className="bg-[#0A0E1A] border-[#00D4FF]/20 max-w-2xl max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle className="text-white text-xl flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center">
                          <CheckCircle2 className="w-5 h-5 text-green-400" />
                        </div>
                        {viewingProject.name}
                      </DialogTitle>
                      <DialogDescription className="text-gray-400">{(viewingProject as any).description}</DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 pt-2">
                      {/* Status banner */}
                      <div className="rounded-xl bg-gradient-to-r from-green-500/10 to-emerald-500/5 border border-green-500/20 px-5 py-4 flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center shrink-0">
                          <CheckCircle2 className="w-6 h-6 text-green-400" />
                        </div>
                        <div className="flex-1">
                          <div className="text-green-300 font-semibold text-sm">Project Completed</div>
                          {ex.completedAt && (
                            <div className="text-green-400/60 text-xs mt-0.5">
                              {new Date(ex.completedAt).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                            </div>
                          )}
                          {ex.reopenedAt && (
                            <div className="text-yellow-400/60 text-xs mt-0.5">
                              Reopened on {new Date(ex.reopenedAt).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-2xl font-bold text-green-400">100%</div>
                          <div className="text-xs text-gray-400">Complete</div>
                        </div>
                      </div>

                      {/* Meta */}
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { label: 'Domain', value: (viewingProject as any).domain?.replace(/-/g, ' ') ?? '—' },
                          { label: 'Created', value: (viewingProject as any).createdAt ?? '—' },
                          { label: 'Assigned To', value: (viewingProject as any).assignedTo ?? '—' },
                          { label: 'Risk Score', value: ex.riskScore > 0 ? `${ex.riskScore}/100` : 'N/A', cls: ex.riskScore >= 70 ? 'text-red-400' : ex.riskScore >= 40 ? 'text-yellow-400' : 'text-green-400' },
                          { label: 'Versions', value: `${ex.versions.length} created` },
                          { label: 'History Entries', value: `${ex.history.length} entries` },
                        ].map(({ label, value, cls }) => (
                          <div key={label} className="bg-white/5 rounded-lg p-3 border border-white/5">
                            <div className="text-xs text-gray-400 mb-1">{label}</div>
                            <div className={`font-medium text-sm ${cls ?? 'text-white'} truncate`}>{value}</div>
                          </div>
                        ))}
                      </div>

                      {/* Phases */}
                      <div className="bg-white/5 rounded-lg p-4 border border-white/5">
                        <div className="text-xs text-gray-400 mb-3">Phase Completion</div>
                        <div className="space-y-2">
                          {(() => {
                            // FIX: this used to hardcode every phase as "Done" at 100% width no
                            // matter what actually happened, and only listed 3 of the 5 real
                            // phases. Now it derives real status from whether that phase's
                            // result actually shows up in any saved version snapshot.
                            const hasPhase = (phase: string) => ex.versions.some(v => {
                              const s: any = v.snapshot || {};
                              if (phase === 'requirement') return !!s.requirementResult;
                              if (phase === 'design') return !!s.threatResult;
                              if (phase === 'development') return !!s.codeAnalyzed || !!s.codeResult;
                              if (phase === 'sca') return !!s.depScanResult || !!s.scaResult;
                              if (phase === 'crossphase') return !!s.crossPhaseResult || !!s.phaseMappingResult;
                              return false;
                            });
                            return (['requirement', 'design', 'development', 'sca', 'crossphase'] as const).map(phase => {
                              const done = hasPhase(phase);
                              return (
                                <div key={phase} className="flex items-center gap-3">
                                  <div className={`w-2 h-2 rounded-full shrink-0 ${done ? 'bg-green-500' : 'bg-white/15'}`} />
                                  <span className="text-sm text-gray-300 w-40 shrink-0">{PHASE_LABELS[phase]}</span>
                                  <div className="flex-1 bg-white/10 rounded-full h-1.5">
                                    <motion.div className={`h-1.5 rounded-full ${done ? 'bg-gradient-to-r from-green-400 to-green-500' : ''}`}
                                      initial={false}
                                      animate={{ width: done ? '100%' : '0%' }}
                                      transition={PROGRESS_TRANSITION} />
                                  </div>
                                  <span className={`text-xs shrink-0 ${done ? 'text-green-400' : 'text-gray-500'}`}>{done ? 'Done' : 'Not run'}</span>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      </div>

                      {/* Reopen */}
                      {!showReopenConfirm ? (
                        <div className="flex items-center justify-between pt-2 border-t border-white/5">
                          <div>
                            <div className="text-sm text-white font-medium">Need to make changes?</div>
                            <div className="text-xs text-gray-400 mt-0.5">Reopen to restore full workspace access — all history & versions are preserved</div>
                          </div>
                          <Button onClick={() => setShowReopenConfirm(true)} variant="outline" size="sm"
                            className="border-yellow-500/40 text-yellow-400 hover:bg-yellow-500/10 shrink-0 ml-3">
                            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />Reopen Project
                          </Button>
                        </div>
                      ) : (
                        <div className="rounded-xl bg-yellow-500/5 border border-yellow-500/20 p-4 space-y-3">
                          <div className="flex items-start gap-3">
                            <AlertTriangle className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
                            <div>
                              <div className="text-yellow-300 font-medium text-sm">Reopen "{viewingProject.name}"?</div>
                              <div className="text-gray-400 text-xs mt-1">
                                Project will move back to <span className="text-[#00D4FF]">In Progress</span>. All reports, versions and history will remain intact.
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-2 justify-end">
                            <Button size="sm" variant="outline" onClick={() => setShowReopenConfirm(false)}
                              className="border-white/20 text-gray-400 text-xs">Cancel</Button>
                            <Button size="sm" onClick={() => handleReopenProject(viewingProject.id)}
                              className="bg-yellow-500 hover:bg-yellow-600 text-black font-semibold text-xs">
                              <RefreshCw className="w-3 h-3 mr-1" />Yes, Reopen
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </DialogContent>
                </Dialog>
              );
            })()}

            {/* ── Portal Section ── */}
            <PortalSection
              onCreateProject={() => setShowCreateProject(true)}
              onGoOverview={() => {}}
              onNavigate={() => {}}
            />

            {/* ── Org Assigned Projects (employees only) ─────────────────────── */}
            {user?.orgId && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center">
                      <Building2 className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <h3 className="text-white font-semibold">Organization Projects</h3>
                      <p className="text-gray-400 text-xs">Projects assigned to your team by your org admin</p>
                    </div>
                  </div>
                  {loadingOrgProjects && <RefreshCw className="w-4 h-4 text-[#00D4FF] animate-spin" />}
                </div>

                {!loadingOrgProjects && orgProjects.length === 0 && (
                  <div className="rounded-xl border border-white/5 bg-white/2 p-6 text-center text-gray-500 text-sm">
                    No projects assigned to your team yet. Contact your org admin.
                  </div>
                )}

                {!loadingOrgProjects && orgProjects.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {orgProjects.map(op => (
                      <div key={op.projectId}
                        className="group relative rounded-xl border border-purple-500/20 bg-gradient-to-br from-purple-500/5 to-transparent p-5 hover:border-purple-500/40 transition-all"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <p className="text-white font-semibold text-sm">{op.projectName}</p>
                            <p className="text-gray-400 text-xs mt-0.5">{op.domain}</p>
                          </div>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                            op.riskScore >= 70 ? 'bg-red-500/20 text-red-400' :
                            op.riskScore >= 40 ? 'bg-yellow-500/20 text-yellow-400' :
                            'bg-green-500/20 text-green-400'
                          }`}>{op.riskScore}/100</span>
                        </div>
                        <p className="text-gray-500 text-xs mb-3 line-clamp-2">{op.description}</p>
                        <div className="flex items-center justify-between text-xs text-gray-400 mb-3">
                          <span className="flex items-center gap-1"><Users className="w-3 h-3" />{op.teamName}</span>
                          <span>{phaseLabel(op.currentPhase)}</span>
                        </div>
                        <div className="mb-4">
                          <div className="flex justify-between text-xs text-gray-400 mb-1">
                            <span>Progress</span><span>{op.progress}%</span>
                          </div>
                          <div className="w-full bg-white/5 rounded-full h-1.5">
                            <div className="bg-gradient-to-r from-purple-500 to-purple-400 h-1.5 rounded-full transition-all"
                              style={{ width: `${op.progress}%` }} />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleOpenOrgProject(op)}
                            className="flex-1 py-2 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 text-xs font-semibold transition-colors flex items-center justify-center gap-1"
                          >
                            <ExternalLink className="w-3 h-3" /> Open in Workspace
                          </button>
                          <button
                            onClick={() => setSelectedOrgProject(op)}
                            className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 text-xs transition-colors"
                          >
                            <Eye className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Org Project Detail Dialog */}
            {selectedOrgProject && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
                onClick={() => setSelectedOrgProject(null)}>
                <div className="bg-[#0F1629] border border-purple-500/30 rounded-2xl p-6 max-w-md w-full shadow-2xl"
                  onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-white font-bold text-lg">{selectedOrgProject.projectName}</h3>
                    <button onClick={() => setSelectedOrgProject(null)} className="text-gray-400 hover:text-white">
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between"><span className="text-gray-400">Team</span><span className="text-white">{selectedOrgProject.teamName}</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">Domain</span><span className="text-white">{selectedOrgProject.domain}</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">Phase</span><span className="text-white">{phaseLabel(selectedOrgProject.currentPhase)}</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">Risk Score</span>
                      <span className={`font-bold ${selectedOrgProject.riskScore >= 70 ? 'text-red-400' : selectedOrgProject.riskScore >= 40 ? 'text-yellow-400' : 'text-green-400'}`}>
                        {selectedOrgProject.riskScore}/100
                      </span>
                    </div>
                    <div className="flex justify-between"><span className="text-gray-400">Progress</span><span className="text-white">{selectedOrgProject.progress}%</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">Status</span><span className="text-white capitalize">{selectedOrgProject.status}</span></div>
                    {selectedOrgProject.lastScanAt && (
                      <div className="flex justify-between">
                        <span className="text-gray-400">Last Scan</span>
                        <span className="text-white text-xs">{(selectedOrgProject.lastScanAt as any)?.toDate?.().toLocaleDateString() || '—'}</span>
                      </div>
                    )}
                    <p className="text-gray-400 text-xs pt-2 border-t border-white/10">{selectedOrgProject.description}</p>
                  </div>
                </div>
              </div>
            )}

          </motion.div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* WORKSPACE                                                           */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {activeView === 'workspace' && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">

            {/* Org Project Banner */}
            {activeOrgProject && (
              <div className="rounded-xl border border-purple-500/40 bg-purple-500/10 px-5 py-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Building2 className="w-5 h-5 text-purple-400 flex-shrink-0" />
                    <div>
                      <p className="text-white text-sm font-semibold">
                        Org Project: {activeOrgProject.projectName}
                        <span className="ml-2 text-xs text-purple-300">Team: {activeOrgProject.teamName}</span>
                      </p>
                      <p className="text-purple-300 text-xs">
                        Your analysis results will be reviewed by your org admin before being marked complete
                      </p>
                    </div>
                  </div>
                  <button onClick={handleCloseOrgProject}
                    className="text-gray-400 hover:text-white text-xs border border-white/20 rounded-lg px-3 py-1.5 transition-colors">
                    ← Back to My Projects
                  </button>
                </div>

                {/* Phase review status row */}
                <div className="flex gap-2 flex-wrap pt-1">
                  {PHASE_ORDER.map(phase => {
                    const ps = orgPhaseStatus[phase]?.status ?? 'not-started';
                    const color = ps === 'completed' ? 'bg-green-500/20 text-green-400 border-green-500/30'
                      : ps === 'submitted' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
                      : ps === 'needs-revision' ? 'bg-red-500/20 text-red-400 border-red-500/30'
                      : 'bg-white/5 text-gray-500 border-white/10';
                    const icon = ps === 'completed' ? '✓' : ps === 'submitted' ? '⏳' : ps === 'needs-revision' ? '↩' : '○';
                    return (
                      <span key={phase} className={`text-xs px-2 py-0.5 rounded-full border ${color}`}>
                        {icon} {PHASE_LABELS[phase]}
                      </span>
                    );
                  })}
                </div>

                {/* Rejection notices */}
                {PHASE_ORDER.filter(p => orgPhaseStatus[p]?.status === 'needs-revision').map(phase => (
                  <div key={phase} className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-xs text-red-300">
                    ↩ <strong>{PHASE_LABELS[phase]}</strong> needs revision:
                    {orgPhaseStatus[phase]?.rejectionReason
                      ? ` "${orgPhaseStatus[phase].rejectionReason}"`
                      : ' Please redo this phase analysis.'}
                  </div>
                ))}

                {/* Unread notifications */}
                {orgProjectNotifications.length > 0 && (
                  <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2 text-xs text-yellow-300">
                    🔔 {orgProjectNotifications.length} new notification(s) — check your phase statuses above
                  </div>
                )}
              </div>
            )}
            {!currentProjectId ? (
              <Card className="p-12 bg-white/5 border-[#00D4FF]/20 text-center">
                <FolderOpen className="w-12 h-12 text-gray-500 mx-auto mb-4" />
                <h3 className="text-white font-semibold text-lg mb-2">No Project Selected</h3>
                <p className="text-gray-400 text-sm mb-4">Open a project from Overview or create a new one.</p>
                <div className="flex gap-3 justify-center">
                  <Button onClick={() => setActiveView('overview')} variant="outline" className="border-[#00D4FF]/40 text-[#00D4FF]">
                    Go to Overview
                  </Button>
                  <Button onClick={() => setShowCreateProject(true)} className="bg-[#00D4FF] text-white">
                    <PlusCircle className="w-4 h-4 mr-2" />New Project
                  </Button>
                </div>
              </Card>
            ) : (
              <>
                <Tabs value={activeWorkspace} onValueChange={v => setActiveWorkspace(v as any)}>
                  {/* Crossfade tab content with a single keyed motion.div — Radix
                      TabsContent unmounts instantly, so exits can't animate through it. */}
                  <AnimatePresence mode="wait">
                    <motion.div key={activeWorkspace} className="space-y-6" {...TAB_CROSSFADE}>
                  {/* ── Requirements ── */}
                  {activeWorkspace === 'requirements' && (<>
                    <PortalSection
                      currentProject={currentProject} projectExtra={currentExtra}
                      onCreateProject={() => setShowCreateProject(true)}
                      onGoOverview={() => setActiveView('overview')}
                      onNavigate={tab => setActiveWorkspace(tab as any)}
                      onMarkComplete={currentProjectId ? () => handleMarkComplete(currentProjectId) : undefined}
                      onFullReport={currentProjectId ? handleFullProjectPdf : undefined}
                      activeTab="requirements"
                    />
                    <Card className="p-6 bg-white/5 border-[#00D4FF]/20">
                      <h2 className="text-xl font-semibold text-white mb-6">Requirement Analysis</h2>
                      <div className="mb-6">
                        <Label className="text-white mb-2">Paste Your Requirements</Label>
                        <div className="relative">
                          <Textarea value={requirementsCode} onChange={e => setRequirementsCode(e.target.value)}
                            placeholder="Paste project requirements here..."
                            className="bg-black/30 border-[#00D4FF]/20 text-white font-mono text-sm h-[200px] max-h-[200px] resize-none overflow-y-auto mt-2" />
                          <div className="absolute top-4 right-4 flex gap-2">
                            <Button size="sm" variant="ghost" onClick={() => copyToClipboard(requirementsCode, 'Code')} className="text-[#00D4FF]"><Copy className="w-4 h-4" /></Button>
                            <Button size="sm" variant="ghost" onClick={() => clearCode(setRequirementsCode, 'Code')} className="text-red-400"><Trash2 className="w-4 h-4" /></Button>
                          </div>
                        </div>
                      </div>

                      <div className="mb-6">
                        <Label className="text-white mb-2">Or Upload File</Label>
                        <div className="border-2 border-dashed border-[#00D4FF]/30 rounded-lg p-6 text-center bg-white/5 mt-2">
                          <Upload className="w-10 h-10 text-[#00D4FF] mx-auto mb-3" />
                          <p className="text-white text-sm mb-1">Drop files here or click to upload</p>
                          <p className="text-xs text-gray-400 mb-3">Supported: <span className="text-[#00D4FF]">.pdf, .docx, .txt, .md</span></p>
                          <input type="file" ref={requirementsFileRef} className="hidden"
                            accept=".txt,.md,.csv,.json,.xml,.rtf,.doc,.docx,.pdf"
                            onChange={e => {
                              const file = e.target.files?.[0]; if (!file) return;
                              const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
                              if (['docx','doc','pdf'].includes(ext)) {
                                setRequirementsCode(`[File: ${file.name}]\n[${(file.size/1024).toFixed(1)} KB]\n\nAnalyze this ${ext.toUpperCase()} for security requirements.`);
                              } else {
                                const r = new FileReader();
                                r.onload = ev => { setRequirementsCode(ev.target?.result as string); };
                                r.readAsText(file);
                              }
                              if (currentProjectId) {
                                addHistory(currentProjectId, makeHistoryEntry('requirement_upload', `File "${file.name}" uploaded for requirement analysis`, user?.email ?? 'User'));
                              }
                              toast.success(`"${file.name}" loaded`);
                            }} />
                          <Button variant="outline" className="border-[#00D4FF]/50 text-[#00D4FF] mt-2" onClick={() => requirementsFileRef.current?.click()}>
                            Choose File
                          </Button>
                        </div>
                      </div>

                      <Button onClick={handleRequirementAnalysis} disabled={analyzingRequirements}
                        className="w-full bg-gradient-to-r from-[#00D4FF] to-[#00D4FF]/80 text-white">
                        <Brain className="w-4 h-4 mr-2" />
                        {analyzingRequirements ? 'Analyzing with AI...' : 'Analyze with AI'}
                      </Button>

                      {showRequirementAnalysis && (
                        <div className="mt-6" ref={requirementReportRef}>
                          <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/30 rounded-lg px-4 py-3 mb-4">
                            <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                            <span className="text-green-300 text-sm font-medium">Report Ready — Requirement Analysis Complete</span>
                          </div>
                          <div className="max-h-[600px] overflow-y-auto rounded-xl pr-1">
                            <RequirementAnalysisReport requirementsText={requirementsCode.trim() || requirementsText.trim()} prefetchedResult={requirementResult} />
                          </div>
                        </div>
                      )}
                    </Card>
                  </>)}

                  {/* ── Design ── */}
                  {activeWorkspace === 'design' && (<>
                    <PortalSection currentProject={currentProject} projectExtra={currentExtra}
                      onCreateProject={() => setShowCreateProject(true)} onGoOverview={() => setActiveView('overview')}
                      onNavigate={tab => setActiveWorkspace(tab as any)}
                      onMarkComplete={currentProjectId ? () => handleMarkComplete(currentProjectId) : undefined}
                      onFullReport={currentProjectId ? handleFullProjectPdf : undefined}
                      activeTab="design" />
                    <Card className="p-6 bg-white/5 border-[#00D4FF]/20">
                      <h2 className="text-xl font-semibold text-white mb-6">Design & Threat Modeling</h2>
                      <div className="mb-6">
                        <Label className="text-white mb-2">Upload Architecture Diagram</Label>
                        <div className="border-2 border-dashed border-[#00D4FF]/30 rounded-lg p-6 text-center bg-white/5 mt-2">
                          <Upload className="w-10 h-10 text-[#00D4FF] mx-auto mb-3" />
                          <p className="text-white text-sm mb-1">Upload architecture or design document</p>
                          <p className="text-xs text-gray-400 mb-3">Supported: <span className="text-[#00D4FF]">.png, .jpg, .svg, .pdf, .drawio, .xml</span></p>
                          <input type="file" ref={designFileRef} className="hidden" accept="*/*"
                            onChange={e => {
                              const file = e.target.files?.[0]; if (!file) return;
                              if (file.type.startsWith('image/')) {
                                setArchitectureUploaded(true);
                              } else {
                                const r = new FileReader();
                                r.onload = ev => { setDesignCode(ev.target?.result as string); setArchitectureUploaded(true); };
                                r.readAsText(file);
                              }
                              if (currentProjectId) addHistory(currentProjectId, makeHistoryEntry('code_upload', `Architecture file "${file.name}" uploaded`, user?.email ?? 'User'));
                              toast.success(`"${file.name}" uploaded`);
                            }} />
                          <Button onClick={() => designFileRef.current?.click()} variant="outline" className="border-[#00D4FF]/50 text-[#00D4FF]">
                            Choose File
                          </Button>
                        </div>
                      </div>

                      <Button onClick={handleThreatAnalysis} disabled={analyzingThreats}
                        className="w-full bg-gradient-to-r from-[#00D4FF] to-[#00D4FF]/80 text-white">
                        <Brain className="w-4 h-4 mr-2" />
                        {analyzingThreats ? 'Analyzing with AI...' : 'Analyze with AI'}
                      </Button>
                    </Card>

                    {showThreatAnalysis && threatResult && (
                      <div className="space-y-4" ref={threatReportRef}>
                        <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/30 rounded-lg px-4 py-3">
                          <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                          <span className="text-green-300 text-sm font-medium">Report Ready — STRIDE Threat Model Complete</span>
                        </div>
                        <Card className="p-6 bg-[#0A0E1A] border-[#00D4FF]/30">
                          <div className="flex items-center gap-3 mb-3">
                            <Shield className="w-7 h-7 text-[#00D4FF]" />
                            <div>
                              <h2 className="text-xl font-bold text-white">STRIDE Threat Analysis Report</h2>
                              <p className="text-xs text-gray-400">Generated: {new Date().toLocaleString()}</p>
                            </div>
                          </div>
                          <span className={`px-3 py-1 rounded-full text-sm font-bold border ${threatResult.riskScore >= 75 ? 'bg-red-500/20 text-red-400 border-red-500/40' : threatResult.riskScore >= 50 ? 'bg-orange-500/20 text-orange-400 border-orange-500/40' : 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40'}`}>
                            Risk: {threatResult.riskScore >= 75 ? 'CRITICAL' : threatResult.riskScore >= 50 ? 'HIGH' : 'MEDIUM'} ({threatResult.riskScore}/100)
                          </span>
                        </Card>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          {[
                            { label: 'Total', value: threatResult.threats?.length ?? 0, color: 'text-white', bg: 'bg-white/5 border-white/10' },
                            { label: 'Critical', value: threatResult.threats?.filter((t: any) => t.severity === 'Critical').length ?? 0, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
                            { label: 'High', value: threatResult.threats?.filter((t: any) => t.severity === 'High').length ?? 0, color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20' },
                            { label: 'Risk Score', value: `${threatResult.riskScore ?? 0}/100`, color: 'text-[#00D4FF]', bg: 'bg-[#00D4FF]/10 border-[#00D4FF]/20' },
                          ].map(s => (
                            <Card key={s.label} className={`p-4 border ${s.bg}`}>
                              <p className="text-gray-400 text-xs mb-1">{s.label}</p>
                              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                            </Card>
                          ))}
                        </div>
                        {threatResult.threats?.length > 0 && (
                          <Card className="p-6 bg-white/5 border-[#00D4FF]/20">
                            <h3 className="text-white font-semibold text-base mb-4 flex items-center gap-2">
                              <AlertTriangle className="w-4 h-4 text-red-400" />Threats Detected ({threatResult.threats.length})
                            </h3>
                            <div className="space-y-3">
                              {threatResult.threats.map((t: any, i: number) => (
                                <div key={i} className="border-l-4 border-red-500/50 pl-4 py-2">
                                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                                    {t.stride && <span className="px-1.5 py-0.5 rounded bg-[#00D4FF]/15 text-[#00D4FF] text-xs border border-[#00D4FF]/25">{t.stride}</span>}
                                    <span className={`px-1.5 py-0.5 rounded text-xs font-semibold border ${t.severity === 'Critical' ? 'bg-red-500/20 text-red-400 border-red-500/30' : t.severity === 'High' ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' : 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'}`}>{t.severity}</span>
                                    {t.cwe && <span className="px-1.5 py-0.5 rounded bg-white/10 text-gray-400 text-xs border border-white/15">{t.cwe}</span>}
                                  </div>
                                  <h4 className="text-white text-sm font-medium mb-1">{t.title || t.category}</h4>
                                  <p className="text-gray-400 text-xs mb-2">{t.description}</p>
                                  {t.mitigation && (
                                    <div className="flex items-start gap-2 bg-green-500/8 border border-green-500/15 rounded p-2">
                                      <CheckCircle2 className="w-3.5 h-3.5 text-green-400 mt-0.5 shrink-0" />
                                      <p className="text-green-300 text-xs">{t.mitigation}</p>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </Card>
                        )}
                        <Button
                          onClick={async () => {
                            try {
                              await generateThreatPDF(threatResult, currentProject?.name ?? 'Project');
                              toast.success('Threat model report downloaded');
                            } catch {
                              toast.error('PDF generation failed');
                            }
                          }}
                          className="bg-gradient-to-r from-[#00D4FF] to-[#00D4FF]/80 text-white"
                        >
                          <Download className="w-4 h-4 mr-2" />Download PDF Report
                        </Button>
                      </div>
                    )}

                  </>)}

                  {/* ── Code Review ── */}
                  {activeWorkspace === 'code-review' && (<>
                    <PortalSection currentProject={currentProject} projectExtra={currentExtra}
                      onCreateProject={() => setShowCreateProject(true)} onGoOverview={() => setActiveView('overview')}
                      onNavigate={tab => setActiveWorkspace(tab as any)}
                      onMarkComplete={currentProjectId ? () => handleMarkComplete(currentProjectId) : undefined}
                      onFullReport={currentProjectId ? handleFullProjectPdf : undefined}
                      activeTab="code-review" />
                    <Card className="p-6 bg-white/5 border-[#00D4FF]/20">
                      <h2 className="text-xl font-semibold text-white mb-6">Code Security Review</h2>
                      <div className="mb-6">
                        <Label className="text-white mb-2">Paste Source Code</Label>
                        <div className="relative">
                          <Textarea value={reviewCode} onChange={e => setReviewCode(e.target.value)}
                            placeholder="Paste your source code here..."
                            className="bg-black/30 border-[#00D4FF]/20 text-white font-mono text-sm h-[280px] max-h-[280px] resize-none overflow-y-auto mt-2" />
                          <div className="absolute top-4 right-4 flex gap-2">
                            <Button size="sm" variant="ghost" onClick={() => copyToClipboard(reviewCode, 'Code')} className="text-[#00D4FF]"><Copy className="w-4 h-4" /></Button>
                            <Button size="sm" variant="ghost" onClick={() => clearCode(setReviewCode, 'Code')} className="text-red-400"><Trash2 className="w-4 h-4" /></Button>
                          </div>
                        </div>
                      </div>
                      <div className="mb-6">
                        <Label className="text-white mb-2">Programming Language</Label>
                        <Select value={codeLanguage} onValueChange={setCodeLanguage}>
                          <SelectTrigger className="bg-white/5 border-[#00D4FF]/20 text-white mt-2"><SelectValue /></SelectTrigger>
                          <SelectContent className="bg-[#0A0E1A] border-[#00D4FF]/20">
                            <SelectItem value="javascript" className="text-white">JavaScript</SelectItem>
                            <SelectItem value="python" className="text-white">Python</SelectItem>
                            <SelectItem value="java" className="text-white">Java</SelectItem>
                            <SelectItem value="csharp" className="text-white">C#</SelectItem>
                            <SelectItem value="php" className="text-white">PHP</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="mb-6">
                        <Label className="text-white mb-2">Or Upload Source File</Label>
                        <div className="border-2 border-dashed border-[#00D4FF]/30 rounded-lg p-5 text-center bg-white/5 mt-2">
                          <Upload className="w-8 h-8 text-[#00D4FF] mx-auto mb-2" />
                          <p className="text-xs text-gray-400 mb-2">Supported: <span className="text-[#00D4FF]">.js .ts .py .java .cs .php .go</span></p>
                          <input type="file" ref={codeFileRef} className="hidden" accept="*/*"
                            onChange={e => {
                              const file = e.target.files?.[0]; if (!file) return;
                              const r = new FileReader();
                              r.onload = ev => setReviewCode(ev.target?.result as string);
                              r.readAsText(file);
                              if (currentProjectId) addHistory(currentProjectId, makeHistoryEntry('code_upload', `Source file "${file.name}" uploaded`, user?.email ?? 'User'));
                              toast.success(`"${file.name}" loaded`);
                            }} />
                          <Button variant="outline" className="border-[#00D4FF]/50 text-[#00D4FF]" onClick={() => codeFileRef.current?.click()}>Choose File</Button>
                        </div>
                      </div>
                      <Button onClick={handleCodeAnalysis} disabled={analyzingCode}
                        className="w-full bg-gradient-to-r from-[#00D4FF] to-[#00D4FF]/80 text-white">
                        <Brain className="w-4 h-4 mr-2" />{analyzingCode ? 'Analyzing...' : 'Analyze with AI'}
                      </Button>
                      {showCodeAnalysis && (
                        <div className="mt-6" ref={codeReportRef}>
                          <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/30 rounded-lg px-4 py-3 mb-4">
                            <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                            <span className="text-green-300 text-sm font-medium">Report Ready — Code Analysis Complete</span>
                          </div>
                          {/* FIX 4: isOrgProject + orgId passed so CodeReviewReport's
                               internal API call saves result to organizations/{orgId}/projects
                               instead of users/{uid}/projects when employee is working on org project */}
                          <CodeReviewReport
                            sourceCode={reviewCode.trim() || sourceCode.trim()}
                            language={codeLanguage}
                            onResult={handleCodeAnalysisResult}
                            isOrgProject={!!activeOrgProject}
                            orgId={activeOrgProject?.orgId}
                            projectId={activeOrgProject?.projectId ?? currentProjectId ?? undefined}
                          />
                        </div>
                      )}
                    </Card>
                  </>)}

                  {/* ── Dependencies / SCA ── */}
                  {activeWorkspace === 'dependencies' && (<>
                    <PortalSection currentProject={currentProject} projectExtra={currentExtra}
                      onCreateProject={() => setShowCreateProject(true)} onGoOverview={() => setActiveView('overview')}
                      onNavigate={tab => setActiveWorkspace(tab as any)}
                      onMarkComplete={currentProjectId ? () => handleMarkComplete(currentProjectId) : undefined}
                      onFullReport={currentProjectId ? handleFullProjectPdf : undefined}
                      activeTab="dependencies" />

                    {/* Input card */}
                    <Card className="p-6 bg-white/5 border-[#00D4FF]/20">
                      <div className="flex items-start justify-between gap-4 mb-5">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center shadow-lg shadow-orange-500/20">
                            <Package className="w-5 h-5 text-white" />
                          </div>
                          <div>
                            <h2 className="text-white font-bold text-lg">Dependency Vulnerability Scanner</h2>
                            <p className="text-gray-400 text-xs mt-0.5">Powered by Google OSV — checks npm, PyPI, Maven, Go against live CVE database</p>
                          </div>
                        </div>
                        <Button onClick={handleDepScan} disabled={scanningDeps || !depFileContent.trim()}
                          className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white border-0 shrink-0 shadow-lg shadow-orange-500/20">
                          {scanningDeps
                            ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Scanning CVE Database...</>
                            : <><Package className="w-4 h-4 mr-2" />Scan Dependencies</>}
                        </Button>
                      </div>

                      {/* How it works strip */}
                      <div className="flex items-center gap-6 p-3 rounded-lg bg-white/3 border border-white/8 mb-5 text-xs text-gray-400">
                        <span className="flex items-center gap-1.5"><span className="w-5 h-5 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center text-xs font-bold">1</span>Select file type</span>
                        <ChevronRight className="w-3 h-3 text-gray-600" />
                        <span className="flex items-center gap-1.5"><span className="w-5 h-5 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center text-xs font-bold">2</span>Paste file content</span>
                        <ChevronRight className="w-3 h-3 text-gray-600" />
                        <span className="flex items-center gap-1.5"><span className="w-5 h-5 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center text-xs font-bold">3</span>Click Scan</span>
                        <ChevronRight className="w-3 h-3 text-gray-600" />
                        <span className="flex items-center gap-1.5"><span className="w-5 h-5 rounded-full bg-green-500/20 text-green-400 flex items-center justify-center text-xs font-bold">4</span>Get CVE report + PDF</span>
                      </div>

                      {/* File type selector */}
                      <div className="mb-3">
                        <p className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wide">Step 1 — Select your dependency file type</p>
                        <div className="flex gap-2 flex-wrap">
                          {[
                            { name: 'package.json', eco: 'npm', color: 'text-green-400' },
                            { name: 'requirements.txt', eco: 'PyPI', color: 'text-blue-400' },
                            { name: 'pom.xml', eco: 'Maven', color: 'text-orange-400' },
                            { name: 'go.mod', eco: 'Go', color: 'text-cyan-400' },
                          ].map(f => (
                            <button key={f.name} onClick={() => setDepFileName(f.name)}
                              className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all flex items-center gap-1.5 ${
                                depFileName === f.name
                                  ? 'bg-[#00D4FF]/15 text-white border-[#00D4FF]/40'
                                  : 'bg-white/3 text-gray-400 border-white/8 hover:border-white/20 hover:text-white'
                              }`}>
                              <span className={`font-mono ${f.color}`}>{f.eco}</span>
                              <span className="text-gray-500">{f.name}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Textarea */}
                      <div>
                        <p className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wide">Step 2 — Paste your {depFileName} content</p>
                        <div className="relative">
                          <Textarea
                            value={depFileContent}
                            onChange={e => setDepFileContent(e.target.value)}
                            placeholder={depFileName === 'package.json'
                              ? `{\n  "dependencies": {\n    "express": "^4.18.2",\n    "lodash": "^4.17.19"\n  }\n}`
                              : `Paste your ${depFileName} content here...`}
                            className="bg-[#060a14] border-white/10 text-white text-xs font-mono h-[180px] max-h-[180px] resize-none overflow-y-auto focus:border-[#00D4FF]/30"
                            rows={7}
                          />
                          {depFileContent && (
                            <button onClick={() => setDepFileContent('')}
                              className="absolute top-2 right-2 text-gray-600 hover:text-gray-300 transition-colors">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Step 3 — Or upload file directly */}
                      <div className="mt-4">
                        <p className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wide">Step 3 — Or upload file directly</p>
                        <div className="border border-dashed border-white/15 rounded-lg p-4 flex items-center gap-4 bg-white/2">
                          <Upload className="w-5 h-5 text-[#00D4FF] shrink-0" />
                          <div className="flex-1">
                            <p className="text-white text-xs font-medium">Upload {depFileName}</p>
                            <p className="text-gray-500 text-xs">File content will be loaded automatically</p>
                          </div>
                          <input type="file" id="dep-file-input" className="hidden"
                            accept=".json,.txt,.xml,.mod,.lock,.toml"
                            onChange={e => {
                              const file = e.target.files?.[0]; if (!file) return;
                              const r = new FileReader();
                              r.onload = ev => setDepFileContent(ev.target?.result as string);
                              r.readAsText(file);
                              toast.success(`"${file.name}" loaded`);
                            }} />
                          <button onClick={() => document.getElementById('dep-file-input')?.click()}
                            className="px-3 py-1.5 rounded-lg border border-[#00D4FF]/30 text-[#00D4FF] text-xs hover:bg-[#00D4FF]/10 transition-colors shrink-0">
                            Choose File
                          </button>
                        </div>
                      </div>

                      {/* Scanning state */}
                      {scanningDeps && (
                        <div className="mt-4 flex items-center gap-3 p-4 rounded-xl bg-orange-500/5 border border-orange-500/20">
                          <Loader2 className="w-5 h-5 text-orange-400 animate-spin shrink-0" />
                          <div>
                            <p className="text-white text-sm font-medium">Querying OSV vulnerability database...</p>
                            <p className="text-gray-400 text-xs mt-0.5">Checking each dependency against known CVEs. This may take 5–15 seconds.</p>
                          </div>
                        </div>
                      )}
                    </Card>

                    {/* Results card — separate card, auto-scrolled to */}
                    {depScanResult && (
                      <div ref={depResultsRef}>
                        <Card className="p-6 bg-white/5 border-[#00D4FF]/20 max-h-[700px] overflow-y-auto">
                          {/* Results header */}
                          <div className="flex items-center justify-between mb-5">
                            <div>
                              <h3 className="text-white font-bold text-base">Scan Results</h3>
                              <p className="text-gray-400 text-xs mt-0.5">
                                {depScanResult.totalDeps} packages scanned · {depScanResult.ecosystems?.join(', ')} · {new Date().toLocaleDateString()}
                              </p>
                            </div>
                            <Button onClick={handleDepPdfDownload} size="sm" variant="outline"
                              className="border-[#00D4FF]/30 text-[#00D4FF] hover:bg-[#00D4FF]/10 gap-2">
                              <Download className="w-3.5 h-3.5" />Download PDF Report
                            </Button>
                          </div>

                          {/* Risk gauge */}
                          <div className={`p-4 rounded-xl border mb-5 ${
                            depScanResult.critical > 0 ? 'bg-red-500/8 border-red-500/25'
                            : depScanResult.high > 0 ? 'bg-orange-500/8 border-orange-500/20'
                            : depScanResult.vulnCount > 0 ? 'bg-yellow-500/8 border-yellow-500/20'
                            : 'bg-green-500/8 border-green-500/20'
                          }`}>
                            <div className="flex items-center gap-4">
                              <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                                depScanResult.critical > 0 ? 'bg-red-500/20'
                                : depScanResult.high > 0 ? 'bg-orange-500/20'
                                : depScanResult.vulnCount > 0 ? 'bg-yellow-500/20'
                                : 'bg-green-500/20'
                              }`}>
                                {depScanResult.vulnCount === 0
                                  ? <CheckCircle2 className="w-6 h-6 text-green-400" />
                                  : depScanResult.critical > 0
                                  ? <AlertTriangle className="w-6 h-6 text-red-400" />
                                  : <AlertTriangle className="w-6 h-6 text-yellow-400" />}
                              </div>
                              <div className="flex-1">
                                <p className={`font-bold text-base ${
                                  depScanResult.critical > 0 ? 'text-red-300'
                                  : depScanResult.high > 0 ? 'text-orange-300'
                                  : depScanResult.vulnCount > 0 ? 'text-yellow-300'
                                  : 'text-green-300'
                                }`}>
                                  {depScanResult.vulnCount === 0 ? '✅ No vulnerabilities found — all dependencies are clean'
                                    : depScanResult.critical > 0 ? `🔴 Critical risk — ${depScanResult.critical} critical vulnerabilities require immediate action`
                                    : depScanResult.high > 0 ? `🟠 High risk — ${depScanResult.high} high severity vulnerabilities found`
                                    : `🟡 Medium risk — ${depScanResult.medium} medium severity vulnerabilities found`}
                                </p>
                                <p className="text-gray-400 text-xs mt-1">
                                  {depScanResult.vulnCount === 0
                                    ? `All ${depScanResult.totalDeps} dependencies checked against Google OSV database`
                                    : `Update vulnerable packages to their fixed versions to resolve these issues`}
                                </p>
                              </div>
                            </div>
                          </div>

                          {/* Stats grid */}
                          <div className="grid grid-cols-5 gap-2 mb-5">
                            {[
                              { label: 'Scanned', value: depScanResult.totalDeps, color: 'text-gray-300', bg: 'bg-white/5 border-white/10' },
                              { label: 'Vulnerable', value: depScanResult.vulnCount, color: 'text-white', bg: depScanResult.vulnCount > 0 ? 'bg-red-500/10 border-red-500/20' : 'bg-green-500/10 border-green-500/20' },
                              { label: 'Critical', value: depScanResult.critical ?? 0, color: 'text-red-400', bg: 'bg-red-500/5 border-red-500/15' },
                              { label: 'High', value: depScanResult.high ?? 0, color: 'text-orange-400', bg: 'bg-orange-500/5 border-orange-500/15' },
                              { label: 'Medium', value: depScanResult.medium ?? 0, color: 'text-yellow-400', bg: 'bg-yellow-500/5 border-yellow-500/15' },
                            ].map(({ label, value, color, bg }) => (
                              <div key={label} className={`p-3 rounded-lg border text-center ${bg}`}>
                                <div className={`text-2xl font-black ${color}`}>{value}</div>
                                <div className="text-xs text-gray-500 mt-0.5">{label}</div>
                              </div>
                            ))}
                          </div>

                          {depScanResult.vulnCount > 0 && (
                            <>
                              <div className="flex items-center justify-between mb-3">
                                <p className="text-white text-sm font-semibold">Vulnerability Details</p>
                                <span className="text-xs text-gray-500">{depScanResult.vulnCount} unique CVEs found</span>
                              </div>
                              <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
                                {depScanResult.vulnerabilities.map((v: any, i: number) => (
                                  <div key={`${v.id}-${i}`} className={`rounded-xl border overflow-hidden ${
                                    v.severity === 'Critical' ? 'border-red-500/30'
                                    : v.severity === 'High' ? 'border-orange-500/25'
                                    : v.severity === 'Medium' ? 'border-yellow-500/20'
                                    : 'border-white/10'
                                  }`}>
                                    {/* Severity bar */}
                                    <div className={`h-1 w-full ${
                                      v.severity === 'Critical' ? 'bg-red-500'
                                      : v.severity === 'High' ? 'bg-orange-500'
                                      : v.severity === 'Medium' ? 'bg-yellow-500'
                                      : 'bg-gray-600'
                                    }`} />
                                    <div className="p-4">
                                      <div className="flex items-start justify-between gap-3 mb-2">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className="text-white font-bold text-sm">{v.package}</span>
                                          <span className="text-xs text-gray-400 font-mono bg-white/5 px-1.5 py-0.5 rounded">v{v.version}</span>
                                          <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                                            v.severity === 'Critical' ? 'text-red-300 bg-red-500/20'
                                            : v.severity === 'High' ? 'text-orange-300 bg-orange-500/20'
                                            : v.severity === 'Medium' ? 'text-yellow-300 bg-yellow-500/20'
                                            : 'text-gray-300 bg-white/10'
                                          }`}>{v.severity.toUpperCase()}</span>
                                          {v.cvssScore && (
                                            <span className="text-xs text-gray-500 bg-white/3 px-1.5 py-0.5 rounded border border-white/8">
                                              CVSS {v.cvssScore}
                                            </span>
                                          )}
                                          {v.source === 'ci' && (
                                            <span className="text-xs px-2 py-0.5 rounded-full font-bold font-mono bg-teal-500/15 text-teal-300 border border-teal-500/40">
                                              via CI{v.commitSha ? ` · commit ${String(v.commitSha).slice(0, 7)}` : ''}
                                            </span>
                                          )}
                                        </div>
                                        <a href={v.link} target="_blank" rel="noopener noreferrer"
                                          className="text-xs text-[#00D4FF] hover:underline shrink-0 flex items-center gap-1 font-mono">
                                          <ExternalLink className="w-3 h-3" />{v.id}
                                        </a>
                                      </div>

                                      {/* What is this vulnerability */}
                                      <div className="mb-3">
                                        <p className="text-gray-300 text-xs leading-relaxed">{v.summary}</p>
                                      </div>

                                      {/* What to do */}
                                      <div className="flex items-center gap-3 flex-wrap">
                                        {v.fixedIn ? (
                                          <div className="flex items-center gap-1.5 text-xs bg-green-500/10 border border-green-500/20 text-green-300 px-3 py-1.5 rounded-lg">
                                            <CheckCircle2 className="w-3.5 h-3.5" />
                                            <span className="font-medium">Fix:</span> Upgrade to <span className="font-mono font-bold">v{v.fixedIn}</span>
                                          </div>
                                        ) : (
                                          <div className="flex items-center gap-1.5 text-xs bg-gray-500/10 border border-gray-500/20 text-gray-400 px-3 py-1.5 rounded-lg">
                                            <Info className="w-3.5 h-3.5" />No fix version available — check advisory
                                          </div>
                                        )}
                                        {v.aliases?.length > 0 && (
                                          <span className="text-xs text-gray-500">Also known as: {v.aliases.slice(0, 2).join(', ')}</span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>

                              {/* Bottom action */}
                              <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between">
                                <p className="text-xs text-gray-500">
                                  {depScanResult.vulnerabilities.filter((v: any) => v.fixedIn).length} of {depScanResult.vulnCount} have known fixes available
                                </p>
                                <Button onClick={handleDepPdfDownload} size="sm"
                                  className="bg-[#00D4FF] hover:bg-[#00D4FF]/90 text-white gap-2">
                                  <Download className="w-3.5 h-3.5" />Download Full PDF Report
                                </Button>
                              </div>
                            </>
                          )}
                        </Card>
                      </div>
                    )}

                    {!depScanResult && !scanningDeps && (
                      <Card className="p-8 bg-white/3 border-dashed border-white/10">
                        <div className="text-center">
                          <div className="w-16 h-16 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mx-auto mb-4">
                            <Package className="w-7 h-7 text-orange-400" />
                          </div>
                          <p className="text-white font-semibold mb-1">Ready to scan</p>
                          <p className="text-gray-400 text-sm max-w-sm mx-auto">
                            Paste your dependency file above and click Scan. We'll check every package against the Google OSV database for known CVEs instantly.
                          </p>
                        </div>
                      </Card>
                    )}
                  </>)}

                  {/* ── Pipeline Security ── */}
                  {activeWorkspace === 'pipeline' && (<>
                    <PortalSection currentProject={currentProject} projectExtra={currentExtra}
                      onCreateProject={() => setShowCreateProject(true)} onGoOverview={() => setActiveView('overview')}
                      onNavigate={tab => setActiveWorkspace(tab as any)}
                      onMarkComplete={currentProjectId ? () => handleMarkComplete(currentProjectId) : undefined}
                      onFullReport={currentProjectId ? handleFullProjectPdf : undefined}
                      activeTab="pipeline" />

                    {/* Input card */}
                    <Card className="p-6 bg-white/5 border-[#00D4FF]/20">
                      <div className="flex items-start justify-between gap-4 mb-5">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-teal-500/20">
                            <Shield className="w-5 h-5 text-white" />
                          </div>
                          <div>
                            <h2 className="text-white font-bold text-lg">Pipeline Security Scan</h2>
                            <p className="text-gray-400 text-xs mt-0.5">Scan CI/CD configuration files for security misconfigurations</p>
                          </div>
                        </div>
                        <Button onClick={handlePipelineScan} disabled={pipelineScanning || !pipelineContent.trim()}
                          className="bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white border-0 shrink-0 shadow-lg shadow-teal-500/20">
                          {pipelineScanning
                            ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Scanning Pipeline Config...</>
                            : <><Shield className="w-4 h-4 mr-2" />Scan Pipeline Config</>}
                        </Button>
                      </div>

                      {/* How it works strip */}
                      <div className="flex items-center gap-6 p-3 rounded-lg bg-white/3 border border-white/8 mb-5 text-xs text-gray-400">
                        <span className="flex items-center gap-1.5"><span className="w-5 h-5 rounded-full bg-teal-500/20 text-teal-400 flex items-center justify-center text-xs font-bold">1</span>Select file type</span>
                        <ChevronRight className="w-3 h-3 text-gray-600" />
                        <span className="flex items-center gap-1.5"><span className="w-5 h-5 rounded-full bg-teal-500/20 text-teal-400 flex items-center justify-center text-xs font-bold">2</span>Paste config content</span>
                        <ChevronRight className="w-3 h-3 text-gray-600" />
                        <span className="flex items-center gap-1.5"><span className="w-5 h-5 rounded-full bg-teal-500/20 text-teal-400 flex items-center justify-center text-xs font-bold">3</span>Click Scan</span>
                        <ChevronRight className="w-3 h-3 text-gray-600" />
                        <span className="flex items-center gap-1.5"><span className="w-5 h-5 rounded-full bg-green-500/20 text-green-400 flex items-center justify-center text-xs font-bold">4</span>Get findings report</span>
                      </div>

                      {/* File type selector */}
                      <div className="mb-3">
                        <p className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wide">Step 1 — Select your CI/CD config file type</p>
                        <div className="flex gap-2 flex-wrap">
                          {[
                            { name: '.github/workflows/ci.yml', eco: 'GitHub Actions', color: 'text-teal-400' },
                            { name: '.gitlab-ci.yml', eco: 'GitLab CI', color: 'text-orange-400' },
                            { name: 'Dockerfile', eco: 'Docker', color: 'text-blue-400' },
                            { name: 'docker-compose.yml', eco: 'Compose', color: 'text-cyan-400' },
                          ].map(f => (
                            <button key={f.name} onClick={() => setPipelineFilename(f.name)}
                              className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all flex items-center gap-1.5 ${
                                pipelineFilename === f.name
                                  ? 'bg-[#00D4FF]/15 text-white border-[#00D4FF]/40'
                                  : 'bg-white/3 text-gray-400 border-white/8 hover:border-white/20 hover:text-white'
                              }`}>
                              <span className={`font-medium ${f.color}`}>{f.eco}</span>
                              <span className="text-gray-500 font-mono">{f.name}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Custom filename */}
                      <div className="mb-3">
                        <p className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wide">Filename — pick a preset above or type a custom path</p>
                        <Input
                          value={pipelineFilename}
                          onChange={e => setPipelineFilename(e.target.value)}
                          placeholder="e.g. .github/workflows/deploy.yml"
                          className="bg-[#060a14] border-white/10 text-white text-xs font-mono h-9 focus:border-[#00D4FF]/30"
                        />
                      </div>

                      {/* Textarea */}
                      <div>
                        <p className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wide">Step 2 — Paste your CI/CD config file content</p>
                        <div className="relative">
                          <Textarea
                            value={pipelineContent}
                            onChange={e => setPipelineContent(e.target.value)}
                            placeholder={`Paste your ${pipelineFilename} content here...`}
                            className="bg-[#060a14] border-white/10 text-white text-xs font-mono h-[180px] max-h-[180px] resize-none overflow-y-auto focus:border-[#00D4FF]/30"
                            rows={7}
                          />
                          {pipelineContent && (
                            <button onClick={() => setPipelineContent('')}
                              className="absolute top-2 right-2 text-gray-600 hover:text-gray-300 transition-colors">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Step 3 — Or upload file directly */}
                      <div className="mt-4">
                        <p className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wide">Step 3 — Or upload file directly</p>
                        <div className="border border-dashed border-white/15 rounded-lg p-4 flex items-center gap-4 bg-white/2">
                          <Upload className="w-5 h-5 text-[#00D4FF] shrink-0" />
                          <div className="flex-1">
                            <p className="text-white text-xs font-medium">Upload CI/CD config file</p>
                            <p className="text-gray-500 text-xs">Supported: .yml / .yaml workflows, Dockerfile, docker-compose</p>
                          </div>
                          <input type="file" id="pipeline-file-input" className="hidden"
                            accept=".yml,.yaml,.txt"
                            onChange={e => {
                              const file = e.target.files?.[0]; if (!file) return;
                              const r = new FileReader();
                              r.onload = ev => setPipelineContent(ev.target?.result as string);
                              r.readAsText(file);
                              setPipelineFilename(file.name);
                              toast.success(`"${file.name}" loaded`);
                            }} />
                          <button onClick={() => document.getElementById('pipeline-file-input')?.click()}
                            className="px-3 py-1.5 rounded-lg border border-[#00D4FF]/30 text-[#00D4FF] text-xs hover:bg-[#00D4FF]/10 transition-colors shrink-0">
                            Choose File
                          </button>
                        </div>
                      </div>

                      {/* Scanning state */}
                      {pipelineScanning && (
                        <div className="mt-4 flex items-center gap-3 p-4 rounded-xl bg-teal-500/5 border border-teal-500/20">
                          <Loader2 className="w-5 h-5 text-teal-400 animate-spin shrink-0" />
                          <div>
                            <p className="text-white text-sm font-medium">Scanning pipeline configuration...</p>
                            <p className="text-gray-400 text-xs mt-0.5">Checking {pipelineFilename} against CI/CD security rules for misconfigurations.</p>
                          </div>
                        </div>
                      )}
                    </Card>

                    {/* Results card — separate card, auto-scrolled to */}
                    {pipelineResults && (
                      <div ref={pipelineResultsRef}>
                        <Card className="p-6 bg-white/5 border-[#00D4FF]/20 max-h-[700px] overflow-y-auto">
                          {/* Results header */}
                          <div className="flex items-center justify-between mb-5">
                            <div>
                              <h3 className="text-white font-bold text-base">Scan Results</h3>
                              <p className="text-gray-400 text-xs mt-0.5">
                                {pipelineFilename} · {pipelineResults.totalFindings} finding{pipelineResults.totalFindings !== 1 ? 's' : ''} · {pipelineResults.rulesChecked} rules checked · {new Date().toLocaleDateString()}
                              </p>
                            </div>
                            <Button onClick={handleFullProjectPdf} size="sm" variant="outline"
                              className="border-[#00D4FF]/30 text-[#00D4FF] hover:bg-[#00D4FF]/10 gap-2">
                              <Download className="w-3.5 h-3.5" />Download PDF Report
                            </Button>
                          </div>

                          {/* Risk gauge */}
                          <div className={`p-4 rounded-xl border mb-5 ${
                            pipelineResults.critical > 0 ? 'bg-red-500/8 border-red-500/25'
                            : pipelineResults.high > 0 ? 'bg-orange-500/8 border-orange-500/20'
                            : pipelineResults.totalFindings > 0 ? 'bg-yellow-500/8 border-yellow-500/20'
                            : 'bg-green-500/8 border-green-500/20'
                          }`}>
                            <div className="flex items-center gap-4">
                              <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                                pipelineResults.critical > 0 ? 'bg-red-500/20'
                                : pipelineResults.high > 0 ? 'bg-orange-500/20'
                                : pipelineResults.totalFindings > 0 ? 'bg-yellow-500/20'
                                : 'bg-green-500/20'
                              }`}>
                                {pipelineResults.totalFindings === 0
                                  ? <CheckCircle2 className="w-6 h-6 text-green-400" />
                                  : pipelineResults.critical > 0
                                  ? <AlertTriangle className="w-6 h-6 text-red-400" />
                                  : <AlertTriangle className="w-6 h-6 text-yellow-400" />}
                              </div>
                              <div className="flex-1">
                                <p className={`font-bold text-base ${
                                  pipelineResults.critical > 0 ? 'text-red-300'
                                  : pipelineResults.high > 0 ? 'text-orange-300'
                                  : pipelineResults.totalFindings > 0 ? 'text-yellow-300'
                                  : 'text-green-300'
                                }`}>
                                  {pipelineResults.totalFindings === 0 ? '✅ No misconfigurations found — pipeline config is clean'
                                    : pipelineResults.critical > 0 ? `🔴 Critical risk — ${pipelineResults.critical} critical misconfigurations require immediate action`
                                    : pipelineResults.high > 0 ? `🟠 High risk — ${pipelineResults.high} high severity misconfigurations found`
                                    : `🟡 Medium risk — ${pipelineResults.totalFindings} misconfigurations found`}
                                </p>
                                <p className="text-gray-400 text-xs mt-1">
                                  Risk score {pipelineResults.riskScore}/100 ({pipelineResults.riskLevel} risk)
                                </p>
                              </div>
                            </div>
                          </div>

                          {/* Stats grid */}
                          <div className="grid grid-cols-5 gap-2 mb-5">
                            {[
                              { label: 'Findings', value: pipelineResults.totalFindings, color: 'text-white', bg: pipelineResults.totalFindings > 0 ? 'bg-red-500/10 border-red-500/20' : 'bg-green-500/10 border-green-500/20' },
                              { label: 'Critical', value: pipelineResults.critical ?? 0, color: 'text-red-400', bg: 'bg-red-500/5 border-red-500/15' },
                              { label: 'High', value: pipelineResults.high ?? 0, color: 'text-orange-400', bg: 'bg-orange-500/5 border-orange-500/15' },
                              { label: 'Medium', value: pipelineResults.medium ?? 0, color: 'text-yellow-400', bg: 'bg-yellow-500/5 border-yellow-500/15' },
                              { label: 'Low', value: pipelineResults.low ?? 0, color: 'text-blue-400', bg: 'bg-blue-500/5 border-blue-500/15' },
                            ].map(({ label, value, color, bg }) => (
                              <div key={label} className={`p-3 rounded-lg border text-center ${bg}`}>
                                <div className={`text-2xl font-black ${color}`}>{value}</div>
                                <div className="text-xs text-gray-500 mt-0.5">{label}</div>
                              </div>
                            ))}
                          </div>

                          {pipelineResults.totalFindings > 0 && (
                            <>
                              <div className="flex items-center justify-between mb-3">
                                <p className="text-white text-sm font-semibold">Misconfiguration Details</p>
                                <span className="text-xs text-gray-500">{pipelineResults.totalFindings} finding{pipelineResults.totalFindings !== 1 ? 's' : ''} detected</span>
                              </div>
                              <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
                                {pipelineResults.findings.map((f: any, i: number) => (
                                  <div key={`${f.id}-${i}`} className={`rounded-xl border overflow-hidden ${
                                    f.severity === 'Critical' ? 'border-red-500/30'
                                    : f.severity === 'High' ? 'border-orange-500/25'
                                    : f.severity === 'Medium' ? 'border-yellow-500/20'
                                    : 'border-white/10'
                                  }`}>
                                    {/* Severity bar */}
                                    <div className={`h-1 w-full ${
                                      f.severity === 'Critical' ? 'bg-red-500'
                                      : f.severity === 'High' ? 'bg-orange-500'
                                      : f.severity === 'Medium' ? 'bg-yellow-500'
                                      : 'bg-gray-600'
                                    }`} />
                                    <div className="p-4">
                                      <div className="flex items-start justify-between gap-3 mb-2">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className="text-white font-bold text-sm">{f.rule}</span>
                                          <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                                            f.severity === 'Critical' ? 'text-red-300 bg-red-500/20'
                                            : f.severity === 'High' ? 'text-orange-300 bg-orange-500/20'
                                            : f.severity === 'Medium' ? 'text-yellow-300 bg-yellow-500/20'
                                            : 'text-gray-300 bg-white/10'
                                          }`}>{f.severity.toUpperCase()}</span>
                                          {f.line != null && (
                                            <span className="text-xs text-gray-400 font-mono bg-white/5 px-1.5 py-0.5 rounded border border-white/8">Line {f.line}</span>
                                          )}
                                          {f.category && (
                                            <span className="text-xs text-teal-300 bg-teal-500/10 px-1.5 py-0.5 rounded border border-teal-500/20">{f.category}</span>
                                          )}
                                        </div>
                                        <span className="text-xs text-gray-500 font-mono shrink-0">{f.id}</span>
                                      </div>

                                      {/* Offending code */}
                                      {f.code && (
                                        <div className="mb-2 bg-black/30 rounded-lg px-3 py-2 border border-white/5">
                                          <code className="text-xs text-gray-400 font-mono whitespace-pre-wrap break-all">{f.code}</code>
                                        </div>
                                      )}

                                      {/* What is this misconfiguration */}
                                      <div className="mb-3">
                                        <p className="text-gray-300 text-xs leading-relaxed">{f.description}</p>
                                      </div>

                                      {/* What to do */}
                                      {f.recommendation && (
                                        <div className="flex items-start gap-1.5 text-xs bg-green-500/10 border border-green-500/20 text-green-300 px-3 py-1.5 rounded-lg">
                                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                          <span><span className="font-medium">Fix:</span> {f.recommendation}</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>

                              {/* Bottom action */}
                              <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between">
                                <p className="text-xs text-gray-500">
                                  Risk score {pipelineResults.riskScore}/100 — {pipelineResults.riskLevel} risk level
                                </p>
                                <Button onClick={handleFullProjectPdf} size="sm"
                                  className="bg-[#00D4FF] hover:bg-[#00D4FF]/90 text-white gap-2">
                                  <Download className="w-3.5 h-3.5" />Download Full PDF Report
                                </Button>
                              </div>
                            </>
                          )}
                        </Card>
                      </div>
                    )}

                    {!pipelineResults && !pipelineScanning && (
                      <Card className="p-8 bg-white/3 border-dashed border-white/10">
                        <div className="text-center">
                          <div className="w-16 h-16 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center mx-auto mb-4">
                            <Shield className="w-7 h-7 text-teal-400" />
                          </div>
                          <p className="text-white font-semibold mb-1">Ready to scan</p>
                          <p className="text-gray-400 text-sm max-w-sm mx-auto">
                            Paste your CI/CD configuration above and click Scan. We'll check it for security misconfigurations like leaked secrets, overly permissive pipeline permissions, and unpinned build images.
                          </p>
                        </div>
                      </Card>
                    )}
                  </>)}

                  {/* ── Cross-Phase Consistency ── */}
                  {activeWorkspace === 'cross-phase' && (<>
                    <PortalSection currentProject={currentProject} projectExtra={currentExtra}
                      onCreateProject={() => setShowCreateProject(true)} onGoOverview={() => setActiveView('overview')}
                      onNavigate={tab => setActiveWorkspace(tab as any)}
                      onMarkComplete={currentProjectId ? () => handleMarkComplete(currentProjectId) : undefined}
                      onFullReport={currentProjectId ? handleFullProjectPdf : undefined}
                      activeTab="cross-phase" />

                    <Card className="p-6 bg-white/5 border-[#00D4FF]/20">
                      {/* Header */}
                      <div className="flex items-start justify-between gap-4 mb-6">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-[#00D4FF] flex items-center justify-center">
                            <Activity className="w-5 h-5 text-white" />
                          </div>
                          <div>
                            <h2 className="text-white font-bold text-lg">Cross-Phase Consistency Checker</h2>
                            <p className="text-gray-400 text-xs mt-0.5">AI cross-references Requirements → Design → Code to find gaps and conflicts</p>
                          </div>
                        </div>
                        <Button
                          onClick={handlePhaseMapping}
                          disabled={analyzingPhaseMapping || phaseMappingCooldown > 0 || (!requirementResult && !threatResult && !codeAnalysisResult)}
                          className="bg-gradient-to-r from-purple-500 to-[#00D4FF] text-white border-0 shrink-0"
                        >
                          {analyzingPhaseMapping
                            ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Analyzing...</>
                            : phaseMappingCooldown > 0
                            ? <><Clock className="w-4 h-4 mr-2" />Wait {phaseMappingCooldown}s</>
                            : <><Activity className="w-4 h-4 mr-2" />Run Cross-Phase Check</>
                          }
                        </Button>
                      </div>

                      {/* Phase coverage status */}
                      <div className="grid grid-cols-3 gap-3 mb-6">
                        {[
                          { label: 'Requirements', done: !!requirementResult, icon: FileText, color: 'blue', desc: requirementResult ? `Score: ${requirementResult.securityScore ?? requirementResult.riskScore ?? '—'}/100` : 'Not run yet' },
                          { label: 'Design / Threats', done: !!threatResult, icon: Target, color: 'purple', desc: threatResult ? `${threatResult.threats?.length ?? 0} threats found` : 'Not run yet' },
                          { label: 'Code Review', done: !!codeAnalysisResult, icon: Code, color: 'green', desc: codeAnalysisResult ? `${codeAnalysisResult.vulnerabilities?.length ?? 0} issues found` : 'Not run yet' },
                        ].map(({ label, done, icon: Icon, color, desc }) => (
                          <div key={label} className={`p-4 rounded-xl border ${done
                            ? color === 'blue' ? 'bg-blue-500/10 border-blue-500/25 text-blue-300'
                            : color === 'purple' ? 'bg-purple-500/10 border-purple-500/25 text-purple-300'
                            : 'bg-green-500/10 border-green-500/25 text-green-300'
                            : 'bg-white/3 border-white/8 text-gray-500'}`}>
                            <div className="flex items-center gap-2 mb-2">
                              {done
                                ? <CheckCircle2 className="w-4 h-4" />
                                : <div className="w-4 h-4 rounded-full border-2 border-current opacity-40" />
                              }
                              <span className="text-xs font-semibold">{label}</span>
                            </div>
                            <Icon className="w-5 h-5 mb-1.5 opacity-70" />
                            <p className="text-xs opacity-70">{desc}</p>
                          </div>
                        ))}
                      </div>

                      {!phaseMappingResult && !analyzingPhaseMapping && (
                        <div className="text-center py-12 border border-dashed border-white/10 rounded-xl">
                          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500/20 to-[#00D4FF]/20 border border-purple-500/20 flex items-center justify-center mx-auto mb-4">
                            <Activity className="w-6 h-6 text-purple-400" />
                          </div>
                          <p className="text-white font-medium mb-1">No cross-phase analysis yet</p>
                          <p className="text-gray-400 text-sm max-w-sm mx-auto">
                            Run at least one phase analysis (Requirements, Design, or Code), then click "Run Cross-Phase Check" to find consistency gaps and conflicts.
                          </p>
                        </div>
                      )}

                      {analyzingPhaseMapping && (
                        <div className="text-center py-12">
                          <Loader2 className="w-10 h-10 text-purple-400 mx-auto mb-3 animate-spin" />
                          <p className="text-white font-medium">AI is cross-referencing all phases...</p>
                          <p className="text-gray-400 text-sm mt-1">Comparing requirements, design, and code findings</p>
                        </div>
                      )}

                      {phaseMappingResult && !analyzingPhaseMapping && (
                        <div className="space-y-6">
                          {/* AI fallback warning */}
                          {phaseMappingResult.aiPowered === false && (
                            <div className="flex items-center gap-3 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/25">
                              <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0" />
                              <span className="text-yellow-300 text-xs">AI unavailable — showing keyword-based analysis. Results may be limited. Try again when AI service is restored.</span>
                            </div>
                          )}

                          {/* Download PDF */}
                          <div className="flex justify-end">
                            <Button onClick={handleCrossPhasePdf} size="sm" variant="outline"
                              className="border-[#00D4FF]/30 text-[#00D4FF] hover:bg-[#00D4FF]/10 gap-2">
                              <Download className="w-3.5 h-3.5" />Download PDF Report
                            </Button>
                          </div>

                          {/* Overall score */}
                          <div className="flex items-center gap-6 p-5 rounded-xl bg-gradient-to-r from-white/5 to-white/3 border border-white/10">
                            <div className="text-center shrink-0">
                              <div className={`text-5xl font-black ${
                                phaseMappingResult.overallScore >= 75 ? 'text-green-400'
                                : phaseMappingResult.overallScore >= 50 ? 'text-yellow-400'
                                : 'text-red-400'
                              }`}>{phaseMappingResult.overallScore}</div>
                              <div className="text-xs text-gray-400 mt-1">Consistency Score</div>
                            </div>
                            <div className="flex-1">
                              <p className="text-gray-200 text-sm leading-relaxed">{phaseMappingResult.summary}</p>
                              <div className="flex gap-4 mt-3">
                                <span className="text-xs text-green-400 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" />{phaseMappingResult.consistent?.length ?? 0} consistent</span>
                                <span className="text-xs text-yellow-400 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" />{phaseMappingResult.warnings?.length ?? 0} warnings</span>
                                <span className="text-xs text-red-400 flex items-center gap-1"><X className="w-3.5 h-3.5" />{phaseMappingResult.conflicts?.length ?? 0} conflicts</span>
                              </div>
                            </div>
                          </div>

                          {/* Top Actions */}
                          {phaseMappingResult.topActions?.length > 0 && (
                            <div className="p-4 rounded-xl bg-[#00D4FF]/5 border border-[#00D4FF]/20">
                              <div className="flex items-center gap-2 mb-3">
                                <Zap className="w-4 h-4 text-[#00D4FF]" />
                                <span className="text-[#00D4FF] text-sm font-semibold">Top Priority Actions</span>
                              </div>
                              <div className="space-y-2">
                                {phaseMappingResult.topActions.map((action: string, i: number) => (
                                  <div key={i} className="flex items-start gap-2 text-sm text-gray-300">
                                    <span className="text-[#00D4FF] font-bold shrink-0">{i + 1}.</span>
                                    {action}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Compliance Drift */}
                          {phaseMappingResult.complianceDrift?.length > 0 && (
                            <div>
                              <div className="flex items-center gap-2 mb-3">
                                <ShieldAlert className="w-4 h-4 text-red-400" />
                                <span className="text-red-400 font-semibold text-sm">Compliance Drift ({phaseMappingResult.complianceDrift.length})</span>
                                <span className="text-xs text-gray-500">— Framework violations found</span>
                              </div>
                              <div className="space-y-3">
                                {phaseMappingResult.complianceDrift.map((cd: any) => (
                                  <div key={cd.id} className="p-4 rounded-xl border border-red-500/30 bg-red-500/8">
                                    <div className="flex items-start justify-between gap-3 mb-2">
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/30 font-bold">{cd.framework}</span>
                                        <span className={`text-xs px-1.5 py-0.5 rounded border ${
                                          cd.severity === 'critical' ? 'text-red-300 bg-red-500/15 border-red-500/25'
                                          : cd.severity === 'high' ? 'text-orange-300 bg-orange-500/15 border-orange-500/25'
                                          : 'text-yellow-300 bg-yellow-500/15 border-yellow-500/25'
                                        }`}>{cd.severity}</span>
                                      </div>
                                      <span className="text-xs text-gray-500 shrink-0">Found in: {cd.foundIn}</span>
                                    </div>
                                    <div className="space-y-1 text-xs">
                                      <div className="flex gap-2"><span className="text-gray-500 shrink-0 w-20">Required:</span><span className="text-gray-300">{cd.requirement}</span></div>
                                      <div className="flex gap-2"><span className="text-gray-500 shrink-0 w-20">Violation:</span><span className="text-red-300">{cd.violation}</span></div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Conflicts */}
                          {phaseMappingResult.conflicts?.length > 0 && (
                            <div>
                              <div className="flex items-center gap-2 mb-3">
                                <X className="w-4 h-4 text-red-400" />
                                <span className="text-red-400 font-semibold text-sm">Conflicts ({phaseMappingResult.conflicts.length})</span>
                                <span className="text-xs text-gray-500">— Requirement vs implementation contradiction</span>
                              </div>
                              <div className="space-y-3">
                                {phaseMappingResult.conflicts.map((c: any) => (
                                  <div key={c.id} className="p-4 rounded-xl border border-red-500/25 bg-red-500/5">
                                    <div className="flex items-start justify-between gap-3 mb-2">
                                      <span className="text-white font-semibold text-sm">{c.control}</span>
                                      <span className={`text-xs px-2 py-0.5 rounded-full border shrink-0 ${
                                        c.severity === 'critical' ? 'bg-red-500/20 text-red-300 border-red-500/30'
                                        : c.severity === 'high' ? 'bg-orange-500/20 text-orange-300 border-orange-500/30'
                                        : 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30'
                                      }`}>{c.severity}</span>
                                    </div>
                                    <div className="space-y-1.5 text-xs">
                                      <div className="flex gap-2"><span className="text-gray-500 shrink-0 w-24">Requirement:</span><span className="text-gray-300">{c.requirement}</span></div>
                                      <div className="flex gap-2"><span className="text-gray-500 shrink-0 w-24">Violation:</span><span className="text-red-300">{c.violation}</span></div>
                                      <div className="flex gap-2"><span className="text-gray-500 shrink-0 w-24">Between:</span><span className="text-gray-400">{c.conflictBetween?.join(' ↔ ')}</span></div>
                                    </div>
                                    {c.recommendation && (
                                      <div className="mt-3 pt-3 border-t border-red-500/15 text-xs text-green-300 flex gap-2">
                                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />{c.recommendation}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Warnings */}
                          {phaseMappingResult.warnings?.length > 0 && (
                            <div>
                              <div className="flex items-center gap-2 mb-3">
                                <AlertTriangle className="w-4 h-4 text-yellow-400" />
                                <span className="text-yellow-400 font-semibold text-sm">Warnings ({phaseMappingResult.warnings.length})</span>
                                <span className="text-xs text-gray-500">— Requirements not fully implemented</span>
                              </div>
                              <div className="space-y-3">
                                {phaseMappingResult.warnings.map((w: any) => (
                                  <div key={w.id} className="p-4 rounded-xl border border-yellow-500/20 bg-yellow-500/5">
                                    <div className="flex items-start justify-between gap-3 mb-2">
                                      <span className="text-white font-semibold text-sm">{w.control}</span>
                                      <span className={`text-xs px-2 py-0.5 rounded-full border shrink-0 ${
                                        w.severity === 'high' ? 'bg-orange-500/20 text-orange-300 border-orange-500/30'
                                        : w.severity === 'medium' ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30'
                                        : 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                                      }`}>{w.severity}</span>
                                    </div>
                                    <div className="space-y-1.5 text-xs">
                                      <div className="flex gap-2"><span className="text-gray-500 shrink-0 w-24">Required:</span><span className="text-gray-300">{w.requirement}</span></div>
                                      <div className="flex gap-2"><span className="text-gray-500 shrink-0 w-24">Gap:</span><span className="text-yellow-300">{w.gap}</span></div>
                                      <div className="flex gap-2"><span className="text-gray-500 shrink-0 w-24">Missing in:</span><span className="text-gray-400">{w.missingIn?.join(', ')}</span></div>
                                    </div>
                                    {w.recommendation && (
                                      <div className="mt-3 pt-3 border-t border-yellow-500/15 text-xs text-green-300 flex gap-2">
                                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />{w.recommendation}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Consistent */}
                          {phaseMappingResult.consistent?.length > 0 && (
                            <div>
                              <div className="flex items-center gap-2 mb-3">
                                <CheckCircle2 className="w-4 h-4 text-green-400" />
                                <span className="text-green-400 font-semibold text-sm">Consistent ({phaseMappingResult.consistent.length})</span>
                                <span className="text-xs text-gray-500">— Controls implemented across all phases</span>
                              </div>
                              <div className="space-y-2">
                                {phaseMappingResult.consistent.map((c: any) => (
                                  <div key={c.id} className="flex items-start gap-3 p-3 rounded-lg border border-green-500/15 bg-green-500/5">
                                    <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-white text-sm font-medium">{c.control}</span>
                                        <span className={`text-xs px-1.5 py-0.5 rounded border ${
                                          c.confidence === 'high' ? 'text-green-400 bg-green-500/10 border-green-500/20'
                                          : 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20'
                                        }`}>{c.confidence} confidence</span>
                                        {c.phases?.map((p: string) => (
                                          <span key={p} className="text-xs px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-gray-400 capitalize">{p}</span>
                                        ))}
                                      </div>
                                      <p className="text-xs text-gray-400 mt-1">{c.description}</p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Cross-Phase PDF Download Button */}
                          <div className="flex justify-end pt-2">
                            <Button
                              onClick={async () => {
                                try {
                                  await generateCrossPhasePDF(phaseMappingResult, currentProject?.name ?? 'Project');
                                  toast.success('Cross-phase report sent to printer/PDF');
                                } catch {
                                  toast.error('PDF generation failed');
                                }
                              }}
                              variant="outline"
                              className="border-purple-500/40 text-purple-300 hover:bg-purple-500/10"
                            >
                              <Download className="w-4 h-4 mr-2" />Download Cross-Phase Report (PDF)
                            </Button>
                          </div>

                        </div>
                      )}
                    </Card>
                  </>)}

                  {/* ── History ── */}
                  {activeWorkspace === 'history' && (<>
                    {currentProjectId && currentProject ? (
                      <>
                        <PortalSection currentProject={currentProject} projectExtra={currentExtra}
                          onCreateProject={() => setShowCreateProject(true)} onGoOverview={() => setActiveView('overview')}
                          onNavigate={tab => setActiveWorkspace(tab as any)}
                          onMarkComplete={currentProjectId ? () => handleMarkComplete(currentProjectId) : undefined}
                      onFullReport={currentProjectId ? handleFullProjectPdf : undefined}
                          activeTab="history" />
                        <ProjectHistoryPanel
                          history={getExtra(currentProjectId).history}
                          projectName={currentProject.name}
                        />
                      </>
                    ) : (
                      <Card className="p-8 bg-white/5 border-[#00D4FF]/20 text-center">
                        <History className="w-10 h-10 text-gray-400 mx-auto mb-3" />
                        <p className="text-gray-400 text-sm">Select a project to view its history.</p>
                      </Card>
                    )}
                  </>)}

                  {/* ── Versions ── */}
                  {activeWorkspace === 'versions' && (<>
                    {currentProjectId ? (
                      <>
                        <PortalSection currentProject={currentProject} projectExtra={currentExtra}
                          onCreateProject={() => setShowCreateProject(true)} onGoOverview={() => setActiveView('overview')}
                          onNavigate={tab => setActiveWorkspace(tab as any)}
                          onMarkComplete={currentProjectId ? () => handleMarkComplete(currentProjectId) : undefined}
                      onFullReport={currentProjectId ? handleFullProjectPdf : undefined}
                          activeTab="versions" />

                        {/* Risk Trend Chart */}
                        {(() => {
                          const _vers = activeOrgProject
                            ? (projectExtras[activeOrgProject.projectId]?.versions ?? [])
                            : getExtra(currentProjectId).versions;
                          if (_vers.length <= 1) return null;
                          return null; // chart only for personal projects
                        })()}
                        {!activeOrgProject && getExtra(currentProjectId).versions.length > 1 && (() => {
                          const trendData = getExtra(currentProjectId).versions.map((v: any) => ({
                            name: `v${v.versionNumber}`,
                            risk: v.snapshot?.threatRiskScore ?? v.snapshot?.requirementScore ?? 0,
                            progress: v.snapshot?.progress ?? 0,
                          }));
                          return (
                            <Card className="p-5 bg-white/5 border-[#00D4FF]/20">
                              <div className="flex items-center gap-2 mb-4">
                                <BarChart2 className="w-4 h-4 text-[#00D4FF]" />
                                <span className="text-white font-semibold text-sm">Risk Score Trend Across Versions</span>
                              </div>
                              <ResponsiveContainer width="100%" height={120}>
                                <ReLineChart data={trendData}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                  <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#6b7280' }} />
                                  <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: '#6b7280' }} width={24} />
                                  <Tooltip contentStyle={{ background: '#0a0e1a', border: '1px solid rgba(0,212,255,0.2)', borderRadius: 8, fontSize: 11 }} labelStyle={{ color: '#fff' }} />
                                  <Line type="monotone" dataKey="risk" stroke="#ef4444" strokeWidth={2} dot={{ r: 4, fill: '#ef4444' }} name="Risk Score" />
                                  <Line type="monotone" dataKey="progress" stroke="#00D4FF" strokeWidth={2} dot={{ r: 4, fill: '#00D4FF' }} name="Progress %" />
                                </ReLineChart>
                              </ResponsiveContainer>
                              <div className="flex items-center gap-4 mt-2 justify-center">
                                <span className="flex items-center gap-1.5 text-xs text-gray-400"><span className="w-3 h-0.5 bg-red-400 inline-block" />Risk Score</span>
                                <span className="flex items-center gap-1.5 text-xs text-gray-400"><span className="w-3 h-0.5 bg-[#00D4FF] inline-block" />Progress %</span>
                              </div>
                            </Card>
                          );
                        })()}

                        <VersionControlPanel
                          versions={activeOrgProject
                            ? (projectExtras[activeOrgProject.projectId]?.versions ?? [])
                            : getExtra(currentProjectId).versions}
                          onRestore={handleRestoreVersion}
                          onAddNote={handleAddVersionNote}
                          onDownloadPdf={handleDownloadVersionPdf}
                        />
                      </>
                    ) : (
                      <Card className="p-8 bg-white/5 border-[#00D4FF]/20 text-center">
                        <GitBranch className="w-10 h-10 text-gray-400 mx-auto mb-3" />
                        <p className="text-gray-400 text-sm">Select a project to view version history.</p>
                      </Card>
                    )}
                  </>)}
                    </motion.div>
                  </AnimatePresence>

                </Tabs>
              </>
            )}
          </motion.div>
        )}

        {/* ── Edit Project Dialog ─────────────────────────────────────────── */}
        <Dialog open={!!editingProject} onOpenChange={v => { if (!v) setEditingProject(null); }}>
          <DialogContent className="bg-[#0A0E1A] border-[#00D4FF]/20 max-w-md">
            <DialogHeader>
              <DialogTitle className="text-white">Edit Project</DialogTitle>
              <DialogDescription className="text-gray-400">Update project name and description</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <Label className="text-white text-sm mb-2 block">Project Name *</Label>
                <Input value={editName} onChange={e => setEditName(e.target.value)}
                  className="bg-white/5 border-white/10 text-white" placeholder="Project name" />
              </div>
              <div>
                <Label className="text-white text-sm mb-2 block">Description</Label>
                <Textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} rows={3}
                  className="bg-white/5 border-white/10 text-white resize-none" placeholder="Project description..." />
              </div>
              <div className="flex gap-3 pt-1">
                <Button onClick={handleEditProject} disabled={!editName.trim() || editSaving}
                  className="flex-1 bg-[#00D4FF] text-white">
                  {editSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Pencil className="w-4 h-4 mr-2" />}
                  Save Changes
                </Button>
                <Button onClick={() => setEditingProject(null)} variant="outline"
                  className="flex-1 border-white/20 text-gray-400">Cancel</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        </>)}
      </div>
    </motion.div>
  );
}
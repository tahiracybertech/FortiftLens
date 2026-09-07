// ============================================================
// ProjectVersionHistory.tsx
// Shows all analysis versions for a project.
// Each version = one analyze run. Click to expand phase reports.
//
// Usage in UserDashboard.tsx:
//   import ProjectVersionHistory from '../components/ProjectVersionHistory'
//   <ProjectVersionHistory projectId={currentProjectId} orgId={user.orgId} />
// ============================================================

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import {
  History, ChevronDown, ChevronRight, FileText,
  Shield, Code, AlertTriangle, CheckCircle2,
  Clock, User, RefreshCw, PackageSearch, GitCompareArrows
} from 'lucide-react'
import { Card } from './ui/card'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { getProjectVersions, getVersionDetail, ProjectVersion, VersionPhaseData } from '../../lib/firebaseService'

// ─── Types ───────────────────────────────────────────────────

interface Props {
  projectId: string
  orgId: string
}

interface VersionWithPhases extends ProjectVersion {
  phases?: Record<string, VersionPhaseData>
  expanded: boolean
  loading: boolean
}

// ─── Helpers ─────────────────────────────────────────────────

const PHASE_CONFIG = {
  requirement: {
    label: 'Requirements Analysis',
    icon: FileText,
    color: 'from-blue-500 to-blue-600',
    badge: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  },
  design: {
    label: 'Threat Modeling (STRIDE)',
    icon: Shield,
    color: 'from-purple-500 to-purple-600',
    badge: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  },
  development: {
    label: 'Code Analysis (SAST)',
    icon: Code,
    color: 'from-green-500 to-green-600',
    badge: 'bg-green-500/20 text-green-300 border-green-500/30',
  },
  // FIX: 'sca' and 'crossphase' versions were never rendered here because they
  // were missing from this map — PhaseReportCard and the version badge both
  // silently bail out (`if (!config) return null`) when a phase key has no entry.
  sca: {
    label: 'Dependency Scanning (SCA)',
    icon: PackageSearch,
    color: 'from-orange-500 to-orange-600',
    badge: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  },
  pipeline: {
    label: 'Pipeline Security',
    icon: Shield,
    color: 'from-teal-500 to-teal-600',
    badge: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
  },
  crossphase: {
    label: 'Cross-Phase Consistency',
    icon: GitCompareArrows,
    color: 'from-yellow-500 to-yellow-600',
    badge: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  },
}

function getRiskColor(score: number) {
  if (score >= 70) return 'text-red-400'
  if (score >= 40) return 'text-yellow-400'
  return 'text-green-400'
}

function formatDate(ts: any): string {
  if (!ts) return '—'
  const date = ts.toDate ? ts.toDate() : new Date(ts)
  return date.toLocaleString('en-US', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ─── Phase Report Card ────────────────────────────────────────

function PhaseReportCard({ phaseKey, phaseData }: { phaseKey: string; phaseData: VersionPhaseData }) {
  const config = PHASE_CONFIG[phaseKey as keyof typeof PHASE_CONFIG]
  if (!config) return null

  const Icon = config.icon
  const result = phaseData.analysisData?.result
  const riskScore = result?.riskScore ?? phaseData.analysisData?.riskScore ?? null
  const threats = phaseData.analysisData?.result?.threats ?? []
  // Pipeline phases store findings flat on analysisData (no .result wrapper)
  const findings = phaseData.analysisData?.result?.findings ?? phaseData.analysisData?.findings ?? []
  const vulns = phaseData.analysisData?.vulnerabilities ?? []
  // Cross-phase results use conflicts/warnings instead of threats/findings/vulns
  const conflicts = phaseData.analysisData?.result?.conflicts ?? []
  const warnings = phaseData.analysisData?.result?.warnings ?? []

  const findingsCount = threats.length || findings.length || vulns.length || (conflicts.length + warnings.length)

  return (
    <div className="bg-white/5 rounded-xl border border-white/10 p-5 space-y-4">
      {/* Phase Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${config.color} flex items-center justify-center`}>
            <Icon className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="text-white font-semibold text-sm">{config.label}</div>
            <div className="text-xs text-gray-400 mt-0.5">
              Completion: {phaseData.completion ?? 0}%
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {riskScore !== null && (
            <span className={`text-sm font-bold ${getRiskColor(riskScore)}`}>
              Risk: {riskScore}/100
            </span>
          )}
          <Badge className={`text-xs ${config.badge} border`}>
            {phaseData.status}
          </Badge>
        </div>
      </div>

      {/* Findings Summary */}
      {findingsCount > 0 && (
        <div className="bg-black/20 rounded-lg p-3">
          <div className="text-xs text-gray-400 mb-2 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            {findingsCount} finding{findingsCount !== 1 ? 's' : ''} detected
          </div>

          {/* Requirements findings */}
          {findings.slice(0, 5).map((f: any, i: number) => (
            <div key={i} className="flex items-start gap-2 py-1.5 border-b border-white/5 last:border-0">
              <span className={`text-xs font-medium px-1.5 py-0.5 rounded shrink-0 ${
                f.severity === 'Critical' ? 'bg-red-500/20 text-red-300' :
                f.severity === 'High' ? 'bg-orange-500/20 text-orange-300' :
                f.severity === 'Medium' ? 'bg-yellow-500/20 text-yellow-300' :
                'bg-blue-500/20 text-blue-300'
              }`}>{f.severity}</span>
              <span className="text-xs text-gray-300">{f.issue || f.title || f.name || f.rule}</span>
            </div>
          ))}

          {/* STRIDE threats */}
          {threats.slice(0, 5).map((t: any, i: number) => (
            <div key={i} className="flex items-start gap-2 py-1.5 border-b border-white/5 last:border-0">
              <span className={`text-xs font-medium px-1.5 py-0.5 rounded shrink-0 ${
                t.severity === 'Critical' ? 'bg-red-500/20 text-red-300' :
                t.severity === 'High' ? 'bg-orange-500/20 text-orange-300' :
                'bg-yellow-500/20 text-yellow-300'
              }`}>{t.category}</span>
              <span className="text-xs text-gray-300">{t.description?.slice(0, 80)}...</span>
            </div>
          ))}

          {/* Code vulns (development) / dependency CVEs (sca) */}
          {vulns.slice(0, 5).map((v: any, i: number) => (
            <div key={i} className="flex items-start gap-2 py-1.5 border-b border-white/5 last:border-0">
              <span className={`text-xs font-medium px-1.5 py-0.5 rounded shrink-0 ${
                v.severity === 'Critical' ? 'bg-red-500/20 text-red-300' :
                v.severity === 'High' ? 'bg-orange-500/20 text-orange-300' :
                'bg-yellow-500/20 text-yellow-300'
              }`}>{v.severity}</span>
              <span className="text-xs text-gray-300">
                {v.package ? `${v.package} v${v.version}: ${v.summary?.slice(0, 60) ?? v.id ?? ''}` : `Line ${v.lineNumber}: ${v.name}`}
              </span>
              {v.source === 'ci' && (
                <span className="text-xs font-medium px-1.5 py-0.5 rounded shrink-0 bg-teal-500/20 text-teal-300 font-mono">
                  via CI{v.commitSha ? ` · ${String(v.commitSha).slice(0, 7)}` : ''}
                </span>
              )}
            </div>
          ))}

          {/* Cross-phase conflicts + warnings */}
          {conflicts.slice(0, 5).map((c: any, i: number) => (
            <div key={`c-${i}`} className="flex items-start gap-2 py-1.5 border-b border-white/5 last:border-0">
              <span className="text-xs font-medium px-1.5 py-0.5 rounded shrink-0 bg-red-500/20 text-red-300">{c.severity ?? 'High'}</span>
              <span className="text-xs text-gray-300">{c.control}: {c.violation?.slice(0, 80)}</span>
            </div>
          ))}
          {warnings.slice(0, 5).map((w: any, i: number) => (
            <div key={`w-${i}`} className="flex items-start gap-2 py-1.5 border-b border-white/5 last:border-0">
              <span className="text-xs font-medium px-1.5 py-0.5 rounded shrink-0 bg-yellow-500/20 text-yellow-300">{w.severity ?? 'Medium'}</span>
              <span className="text-xs text-gray-300">{w.control}: {w.gap?.slice(0, 80)}</span>
            </div>
          ))}

          {findingsCount > 5 && (
            <div className="text-xs text-[#00D4FF] mt-2">+{findingsCount - 5} more findings</div>
          )}
        </div>
      )}

      {findingsCount === 0 && (
        <div className="flex items-center gap-2 text-green-400 text-xs">
          <CheckCircle2 className="w-4 h-4" />
          No critical findings detected
        </div>
      )}
    </div>
  )
}

// ─── Version Row ──────────────────────────────────────────────

function VersionRow({
  version,
  onToggle,
}: {
  version: VersionWithPhases
  onToggle: (id: string) => void
}) {
  const phaseConfig = PHASE_CONFIG[version.analyzedPhase as keyof typeof PHASE_CONFIG]

  return (
    <div className="border border-[#00D4FF]/15 rounded-xl overflow-hidden">
      {/* Version Header — clickable */}
      <button
        onClick={() => onToggle(version.id)}
        className="w-full flex items-center gap-4 p-4 bg-white/5 hover:bg-white/8 transition-colors text-left"
      >
        <div className="flex items-center gap-2 shrink-0">
          {version.expanded
            ? <ChevronDown className="w-4 h-4 text-[#00D4FF]" />
            : <ChevronRight className="w-4 h-4 text-gray-400" />
          }
          <span className="text-[#00D4FF] font-bold text-sm w-8">{version.versionId}</span>
        </div>

        {/* Phase badge */}
        {phaseConfig && (
          <Badge className={`text-xs border ${phaseConfig.badge}`}>
            {phaseConfig.label}
          </Badge>
        )}

        {/* Meta */}
        <div className="flex items-center gap-4 ml-auto text-xs text-gray-400 shrink-0">
          <span className="flex items-center gap-1">
            <User className="w-3 h-3" />
            {version.analyzedBy}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatDate(version.createdAt)}
          </span>
        </div>

        {version.loading && (
          <RefreshCw className="w-4 h-4 text-[#00D4FF] animate-spin ml-2 shrink-0" />
        )}
      </button>

      {/* Expanded Phase Reports */}
      <AnimatePresence>
        {version.expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="p-4 pt-0 space-y-3 bg-black/20">
              {version.loading && (
                <div className="text-center py-6 text-gray-400 text-sm">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
                  Loading report...
                </div>
              )}
              {!version.loading && version.phases && Object.keys(version.phases).length > 0 && (
                Object.entries(version.phases).map(([phaseKey, phaseData]) => (
                  <PhaseReportCard key={phaseKey} phaseKey={phaseKey} phaseData={phaseData} />
                ))
              )}
              {!version.loading && (!version.phases || Object.keys(version.phases || {}).length === 0) && (
                <div className="text-center py-6 text-gray-400 text-sm">
                  No report data found for this version.
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────

export default function ProjectVersionHistory({ projectId, orgId }: Props) {
  const [versions, setVersions] = useState<VersionWithPhases[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!projectId || !orgId) return
    loadVersions()
  }, [projectId, orgId])

  async function loadVersions() {
    setLoading(true)
    setError(null)
    try {
      const raw = await getProjectVersions(orgId, projectId)
      setVersions(raw.map(v => ({ ...v, expanded: false, loading: false })))
    } catch (err) {
      console.error('Failed to load versions:', err)
      setError('Could not load version history.')
    } finally {
      setLoading(false)
    }
  }

  async function handleToggle(versionId: string) {
    setVersions(prev => prev.map(v => {
      if (v.id !== versionId) return v
      // If already expanded, just collapse
      if (v.expanded) return { ...v, expanded: false }
      // If phases already loaded, just expand
      if (v.phases) return { ...v, expanded: true }
      // Need to fetch
      return { ...v, expanded: true, loading: true }
    }))

    // Fetch phase details if not loaded yet
    const version = versions.find(v => v.id === versionId)
    if (!version || version.phases) return

    try {
      const detail = await getVersionDetail(orgId, projectId, versionId)
      setVersions(prev => prev.map(v =>
        v.id === versionId
          ? { ...v, phases: detail?.phases ?? {}, loading: false }
          : v
      ))
    } catch {
      setVersions(prev => prev.map(v =>
        v.id === versionId ? { ...v, loading: false } : v
      ))
    }
  }

  // ── Render ─────────────────────────────────────────────────

  return (
    <Card className="bg-white/5 border-[#00D4FF]/20 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#00D4FF] to-[#00D4FF]/60 flex items-center justify-center">
            <History className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-white font-semibold text-lg">Analysis History</h3>
            <p className="text-gray-400 text-sm">
              {versions.length} version{versions.length !== 1 ? 's' : ''} — click to view report
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={loadVersions}
          className="border-[#00D4FF]/30 text-[#00D4FF] hover:bg-[#00D4FF]/10"
        >
          <RefreshCw className="w-4 h-4 mr-1" />
          Refresh
        </Button>
      </div>

      {/* Content */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-12 text-gray-400">
          <RefreshCw className="w-8 h-8 animate-spin mb-3" />
          <p className="text-sm">Loading versions...</p>
        </div>
      )}

      {error && (
        <div className="text-center py-8 text-red-400 text-sm">{error}</div>
      )}

      {!loading && !error && versions.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <History className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No analysis history yet.</p>
          <p className="text-xs mt-1">Run an analysis from the Workspace tab to create your first version.</p>
        </div>
      )}

      {!loading && !error && versions.length > 0 && (
        <div className="space-y-3">
          {versions.map(version => (
            <VersionRow
              key={version.id}
              version={version}
              onToggle={handleToggle}
            />
          ))}
        </div>
      )}
    </Card>
  )
}
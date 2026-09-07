// ============================================================
// FortifyLens — Firebase Service Layer
// ============================================================

import {
  doc, collection, getDocs, getDoc, addDoc, setDoc,
  updateDoc, deleteDoc, query, where, orderBy,
  serverTimestamp, Timestamp, onSnapshot, type Unsubscribe
} from 'firebase/firestore'
import { db } from './firebase'

// ─── SANITIZE UTILITY ────────────────────────────────────────
// Converts ALL Firestore Timestamp objects → ISO string recursively
// Prevents "Objects are not valid as React child" error everywhere
export function sanitizeDoc(obj: any): any {
  if (obj === null || obj === undefined) return obj
  // Firestore Timestamp → ISO string
  if (typeof obj === 'object' && !Array.isArray(obj) && 'seconds' in obj && 'nanoseconds' in obj) {
    try { return new Date((obj as any).seconds * 1000).toISOString() } catch { return null }
  }
  // Firestore Timestamp class (toDate method)
  if (typeof obj?.toDate === 'function') {
    try { return obj.toDate().toISOString() } catch { return null }
  }
  if (Array.isArray(obj)) return obj.map(sanitizeDoc)
  if (typeof obj === 'object') {
    const result: any = {}
    for (const key of Object.keys(obj)) result[key] = sanitizeDoc((obj as any)[key])
    return result
  }
  return obj
}
// ─────────────────────────────────────────────────────────────

// ─── TYPES ───────────────────────────────────────────────────

export type UserRole = 'superadmin' | 'org_admin' | 'user' | 'employee'
export type PlanName = 'Starter' | 'Business' | 'Enterprise'
export type ProjectPhase = 'requirement' | 'design' | 'development'
export type ProjectStatus = 'in-progress' | 'completed' | 'critical' | 'on-hold'
export type EmployeeStatus = 'active' | 'offline' | 'suspended'
export type SeverityLevel = 'Critical' | 'High' | 'Medium' | 'Low'

export interface UserProfile {
  uid: string
  email: string
  fullName: string
  role: UserRole
  orgId?: string
  avatarUrl?: string
  phoneNumber?: string
  createdAt: Timestamp
}

export interface Organization {
  id: string
  name: string
  industry: string
  orgSize: string
  phoneNumber?: string
  adminUid: string
  status: 'active' | 'suspended'
  currentPlan: PlanName
  createdAt: Timestamp
}

export interface SubscriptionPlan {
  id: string
  name: PlanName
  priceMonthly: number | null
  description: string
  isEnabled: boolean
  maxUsers: number | null
  maxProjects: number | null
  features: string[]
  isPopular: boolean
}

export interface OrgMember {
  id: string
  userId: string
  email: string
  fullName: string
  jobTitle: string
  department: string
  status: EmployeeStatus
  joinedAt: Timestamp
}

export interface Team {
  id: string
  name: string
  leadUserId: string
  leadName: string
  status: 'active' | 'inactive'
  memberCount: number
  projectId?: string
  projectName?: string
}

export interface Project {
  id: string
  orgId: string
  teamId?: string
  createdBy: string
  name: string
  description: string
  domain: string
  currentPhase: ProjectPhase
  status: ProjectStatus
  progress: number
  riskScore: number
  lastScanAt?: Timestamp
  createdAt: Timestamp
}

export interface Vulnerability {
  id: string
  title: string
  severity: SeverityLevel
  description: string
  recommendation: string
  isResolved: boolean
  createdAt: Timestamp
}

export interface ActivityLog {
  id: string
  orgId: string
  userId: string
  userName: string
  action: string
  type: 'success' | 'warning' | 'info' | 'error'
  createdAt: Timestamp
}

// ─── USER-PROJECT TYPES ───────────────────────────────────────

export type HistoryAction =
  | 'project_created' | 'requirement_upload' | 'requirement_analysis'
  | 'threat_analysis' | 'code_upload' | 'code_review' | 'report_generated'
  | 'project_completed' | 'project_reopened' | 'version_created' | 'project_edited'

export interface UserHistoryEntry {
  id: string
  date: string
  time: string
  user: string
  action: HistoryAction
  version?: string
  description: string
  category: 'analysis' | 'reports' | 'versions' | 'status'
  createdAt: Timestamp
}

export interface UserProjectVersion {
  id: string
  versionNumber: number
  label: string
  description: string
  createdAt: string
  createdBy: string
  notes?: string
  snapshot: {
    requirementResult?: any
    threatResult?: any
    codeAnalyzed?: boolean
    progress?: number
    status?: string
  }
  firestoreCreatedAt: Timestamp
}

export interface UserProject {
  id: string
  uid: string
  name: string
  description: string
  currentPhase: 'requirement' | 'design' | 'development'
  domain: string
  assignedTo: string
  status: 'in-progress' | 'completed'
  progress: number
  riskScore: number
  completedAt?: string
  reopenedAt?: string
  createdAt: Timestamp
}

// ─── USER FUNCTIONS ──────────────────────────────────────────

export async function createUserProfile(uid: string, data: Omit<UserProfile, 'uid' | 'createdAt'>) {
  // NOTE: Firestore rules require orgId == uid and role == 'user' on create
  // (see firestore.rules). Default orgId to the personal workspace value
  // here so every existing call site (which never passed orgId) keeps
  // working. Any org_admin/employee promotion happens server-side via
  // POST /api/orgs or /api/invitations/accept, which use the Admin SDK
  // and are not subject to these client rules.
  await setDoc(doc(db, 'users', uid), {
    orgId: uid,
    ...data,
    createdAt: serverTimestamp(),
  })
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, 'users', uid))
  if (!snap.exists()) return null
  return sanitizeDoc({ uid: snap.id, ...snap.data() }) as UserProfile
}

export async function updateUserProfile(uid: string, data: Partial<UserProfile>) {
  await updateDoc(doc(db, 'users', uid), data)
}

// ─── USER PROJECTS ────────────────────────────────────────────

export async function createUserProject(
  uid: string,
  data: Omit<UserProject, 'id' | 'uid' | 'createdAt'>
): Promise<string> {
  const ref = await addDoc(collection(db, 'users', uid, 'projects'), {
    ...data, uid, createdAt: serverTimestamp(),
  })
  return ref.id
}

export async function getUserProjects(uid: string): Promise<UserProject[]> {
  const snap = await getDocs(
    query(collection(db, 'users', uid, 'projects'), orderBy('createdAt', 'desc'))
  )
  return snap.docs.map(d => sanitizeDoc({ id: d.id, ...d.data() }) as UserProject)
}

export function subscribeUserProjects(
  uid: string,
  onUpdate: (projects: UserProject[]) => void
): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'users', uid, 'projects'), orderBy('createdAt', 'desc')),
    snap => onUpdate(snap.docs.map(d => sanitizeDoc({ id: d.id, ...d.data() }) as UserProject))
  )
}

export async function updateUserProject(
  uid: string,
  projectId: string,
  data: Partial<Omit<UserProject, 'id' | 'uid' | 'createdAt'>>
): Promise<void> {
  await updateDoc(doc(db, 'users', uid, 'projects', projectId), data)
}

export async function deleteUserProject(uid: string, projectId: string): Promise<void> {
  const subcollections = ['history', 'versions', 'analysisCache', 'remediations']
  await Promise.all(
    subcollections.map(async sub => {
      const snap = await getDocs(collection(db, 'users', uid, 'projects', projectId, sub))
      return Promise.all(snap.docs.map(d => deleteDoc(d.ref)))
    })
  )
  await deleteDoc(doc(db, 'users', uid, 'projects', projectId))
}

// ─── USER PROJECT HISTORY ─────────────────────────────────────

export async function addUserHistoryEntry(
  uid: string,
  projectId: string,
  entry: Omit<UserHistoryEntry, 'id' | 'createdAt'>
): Promise<string> {
  const ref = await addDoc(
    collection(db, 'users', uid, 'projects', projectId, 'history'),
    { ...entry, createdAt: serverTimestamp() }
  )
  return ref.id
}

export async function getUserProjectHistory(
  uid: string,
  projectId: string
): Promise<UserHistoryEntry[]> {
  const snap = await getDocs(
    query(collection(db, 'users', uid, 'projects', projectId, 'history'), orderBy('createdAt', 'asc'))
  )
  return snap.docs.map(d => sanitizeDoc({ id: d.id, ...d.data() }) as UserHistoryEntry)
}

export function subscribeUserProjectHistory(
  uid: string,
  projectId: string,
  onUpdate: (history: UserHistoryEntry[]) => void
): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'users', uid, 'projects', projectId, 'history'), orderBy('createdAt', 'asc')),
    snap => onUpdate(snap.docs.map(d => sanitizeDoc({ id: d.id, ...d.data() }) as UserHistoryEntry))
  )
}

// ─── USER PROJECT VERSIONS ────────────────────────────────────

export async function addUserProjectVersion(
  uid: string,
  projectId: string,
  version: Omit<UserProjectVersion, 'id' | 'firestoreCreatedAt'>
): Promise<string> {
  const ref = await addDoc(
    collection(db, 'users', uid, 'projects', projectId, 'versions'),
    { ...version, firestoreCreatedAt: serverTimestamp() }
  )
  return ref.id
}

export async function getUserProjectVersions(
  uid: string,
  projectId: string
): Promise<UserProjectVersion[]> {
  const snap = await getDocs(
    query(collection(db, 'users', uid, 'projects', projectId, 'versions'), orderBy('firestoreCreatedAt', 'asc'))
  )
  return snap.docs.map(d => sanitizeDoc({ id: d.id, ...d.data() }) as UserProjectVersion)
}

export function subscribeUserProjectVersions(
  uid: string,
  projectId: string,
  onUpdate: (versions: UserProjectVersion[]) => void
): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'users', uid, 'projects', projectId, 'versions'), orderBy('firestoreCreatedAt', 'asc')),
    snap => onUpdate(snap.docs.map(d => sanitizeDoc({ id: d.id, ...d.data() }) as UserProjectVersion))
  )
}

export async function updateUserProjectVersionNote(
  uid: string, projectId: string, versionId: string, notes: string
): Promise<void> {
  await updateDoc(doc(db, 'users', uid, 'projects', projectId, 'versions', versionId), { notes })
}

// ─── USER STATS ───────────────────────────────────────────────

export interface UserStats {
  threatsAnalyzed: number
  lastRiskScore: number
  reportsGenerated: number
  updatedAt: Timestamp
}

export async function getUserStats(uid: string): Promise<UserStats | null> {
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'meta', 'stats'))
    if (!snap.exists()) return null
    return sanitizeDoc(snap.data()) as UserStats
  } catch { return null }
}

export async function updateUserStats(uid: string, stats: Partial<Omit<UserStats, 'updatedAt'>>): Promise<void> {
  await setDoc(doc(db, 'users', uid, 'meta', 'stats'), { ...stats, updatedAt: serverTimestamp() }, { merge: true })
}

// ─── ORGANIZATION FUNCTIONS ───────────────────────────────────

export async function createOrganization(data: Omit<Organization, 'id' | 'createdAt'>) {
  const ref = await addDoc(collection(db, 'organizations'), { ...data, createdAt: serverTimestamp() })
  return ref.id
}

export async function getOrganization(orgId: string): Promise<Organization | null> {
  const snap = await getDoc(doc(db, 'organizations', orgId))
  if (!snap.exists()) return null
  return sanitizeDoc({ id: snap.id, ...snap.data() }) as Organization
}

export async function getAllOrganizations(): Promise<Organization[]> {
  const snap = await getDocs(query(collection(db, 'organizations'), orderBy('createdAt', 'desc')))
  return snap.docs.map(d => sanitizeDoc({ id: d.id, ...d.data() }) as Organization)
}

export async function updateOrganization(orgId: string, data: Partial<Organization>) {
  await updateDoc(doc(db, 'organizations', orgId), data)
}

export async function suspendOrganization(orgId: string) {
  await updateDoc(doc(db, 'organizations', orgId), { status: 'suspended' })
}

export async function activateOrganization(orgId: string) {
  await updateDoc(doc(db, 'organizations', orgId), { status: 'active' })
}

// ─── SUBSCRIPTION PLANS ───────────────────────────────────────

export async function getSubscriptionPlans(): Promise<SubscriptionPlan[]> {
  const snap = await getDocs(collection(db, 'subscriptionPlans'))
  return snap.docs.map(d => sanitizeDoc({ id: d.id, ...d.data() }) as SubscriptionPlan)
}

export async function togglePlanEnabled(planId: string, isEnabled: boolean) {
  await updateDoc(doc(db, 'subscriptionPlans', planId), { isEnabled })
}

export async function updatePlan(planId: string, data: Partial<SubscriptionPlan>) {
  await updateDoc(doc(db, 'subscriptionPlans', planId), data)
}

// ─── ORG MEMBERS ─────────────────────────────────────────────

export async function getOrgMembers(orgId: string): Promise<OrgMember[]> {
  const snap = await getDocs(collection(db, 'organizations', orgId, 'members'))
  const members = snap.docs.map(d => {
    const data = d.data()
    const resolvedUserId: string = data.userId || data.uid || d.id
    return sanitizeDoc({
      id: d.id,
      userId: resolvedUserId,
      email: data.email || '',
      fullName: data.fullName || '',
      jobTitle: data.jobTitle || '',
      department: data.department || '',
      status: data.status || 'active',
      joinedAt: data.joinedAt,
    }) as OrgMember
  })

  const enriched = await Promise.all(members.map(async m => {
    if (m.fullName) return m
    try {
      const userSnap = await getDoc(doc(db, 'users', m.userId))
      if (userSnap.exists()) {
        const profile = userSnap.data()
        return { ...m, fullName: profile.fullName || m.email }
      }
    } catch (_) {}
    return { ...m, fullName: m.email }
  }))

  return enriched
}

export async function addOrgMember(orgId: string, member: Omit<OrgMember, 'id' | 'joinedAt'>) {
  await addDoc(collection(db, 'organizations', orgId, 'members'), {
    ...member, joinedAt: serverTimestamp()
  })
}

export async function updateMemberStatus(orgId: string, memberId: string, status: EmployeeStatus) {
  await updateDoc(doc(db, 'organizations', orgId, 'members', memberId), { status })
}

export async function suspendMember(orgId: string, memberId: string) {
  await updateMemberStatus(orgId, memberId, 'suspended')
}

// ─── TEAMS ────────────────────────────────────────────────────

export async function getTeams(orgId: string): Promise<Team[]> {
  const snap = await getDocs(collection(db, 'organizations', orgId, 'teams'))
  return snap.docs.map(d => sanitizeDoc({ id: d.id, ...d.data() }) as Team)
}

export async function createTeam(orgId: string, data: Omit<Team, 'id'>) {
  const ref = await addDoc(collection(db, 'organizations', orgId, 'teams'), data)
  return ref.id
}

export async function updateTeam(orgId: string, teamId: string, data: Partial<Team>) {
  await updateDoc(doc(db, 'organizations', orgId, 'teams', teamId), data)
}

// ─── PROJECTS (org-level) ─────────────────────────────────────

export async function getProjects(orgId: string): Promise<Project[]> {
  const snap = await getDocs(
    query(collection(db, 'organizations', orgId, 'projects'), orderBy('createdAt', 'desc'))
  )
  return snap.docs.map(d => sanitizeDoc({ id: d.id, ...d.data() }) as Project)
}

export async function createProject(orgId: string, data: Omit<Project, 'id' | 'createdAt'>) {
  const ref = await addDoc(collection(db, 'organizations', orgId, 'projects'), {
    ...data, createdAt: serverTimestamp()
  })
  const phases = ['requirement', 'design', 'development']
  for (const phase of phases) {
    await addDoc(collection(db, 'organizations', orgId, 'projects', ref.id, 'phases'), {
      phase, completion: 0,
      status: phase === 'requirement' ? 'in-progress' : 'pending',
      vulnerabilityCount: 0, createdAt: serverTimestamp()
    })
  }
  return ref.id
}

export async function updateProject(orgId: string, projectId: string, data: Partial<Project>) {
  await updateDoc(doc(db, 'organizations', orgId, 'projects', projectId), data)
}

// ─── VULNERABILITIES ──────────────────────────────────────────

export async function getVulnerabilities(orgId: string, projectId: string): Promise<Vulnerability[]> {
  const snap = await getDocs(
    query(collection(db, 'organizations', orgId, 'projects', projectId, 'vulnerabilities'), orderBy('createdAt', 'desc'))
  )
  return snap.docs.map(d => sanitizeDoc({ id: d.id, ...d.data() }) as Vulnerability)
}

export async function addVulnerability(orgId: string, projectId: string, data: Omit<Vulnerability, 'id' | 'createdAt'>) {
  await addDoc(collection(db, 'organizations', orgId, 'projects', projectId, 'vulnerabilities'), {
    ...data, createdAt: serverTimestamp()
  })
}

export async function resolveVulnerability(orgId: string, projectId: string, vulnId: string) {
  await updateDoc(doc(db, 'organizations', orgId, 'projects', projectId, 'vulnerabilities', vulnId), { isResolved: true })
}

// ─── PAYMENT METHODS ──────────────────────────────────────────

export async function savePaymentMethod(orgId: string, data: {
  cardholderName: string; cardLastFour: string; cardBrand: string
  expiryMonth: number; expiryYear: number
}) {
  await addDoc(collection(db, 'organizations', orgId, 'paymentMethods'), {
    ...data, isDefault: true, isActive: true, createdAt: serverTimestamp()
  })
}

// ─── ACTIVITY LOGS ────────────────────────────────────────────

export async function logActivity(data: Omit<ActivityLog, 'id' | 'createdAt'>) {
  await addDoc(collection(db, 'activityLogs'), { ...data, createdAt: serverTimestamp() })
}

export async function getOrgActivity(orgId: string, limitCount = 20): Promise<ActivityLog[]> {
  const snap = await getDocs(
    query(collection(db, 'activityLogs'), where('orgId', '==', orgId), orderBy('createdAt', 'desc'))
  )
  return snap.docs.slice(0, limitCount).map(d => sanitizeDoc({ id: d.id, ...d.data() }) as ActivityLog)
}

export async function getAllActivity(limitCount = 50): Promise<ActivityLog[]> {
  const snap = await getDocs(query(collection(db, 'activityLogs'), orderBy('createdAt', 'desc')))
  return snap.docs.slice(0, limitCount).map(d => sanitizeDoc({ id: d.id, ...d.data() }) as ActivityLog)
}

// ─── INVITATIONS ──────────────────────────────────────────────

export async function createInvitation(orgId: string, data: {
  email: string; inviteCode: string; role: string; department: string
}) {
  await addDoc(collection(db, 'organizations', orgId, 'invitations'), {
    ...data, status: 'pending',
    expiresAt: Timestamp.fromDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)),
    createdAt: serverTimestamp()
  })
}

export async function verifyInviteCode(inviteCode: string): Promise<{ valid: boolean; orgId?: string; orgName?: string }> {
  const orgsSnap = await getDocs(collection(db, 'organizations'))
  for (const orgDoc of orgsSnap.docs) {
    const invitesSnap = await getDocs(
      query(collection(db, 'organizations', orgDoc.id, 'invitations'),
        where('inviteCode', '==', inviteCode.toUpperCase()), where('status', '==', 'pending'))
    )
    if (!invitesSnap.empty) return { valid: true, orgId: orgDoc.id, orgName: orgDoc.data().name }
  }
  return { valid: false }
}

// ─── SUPERADMIN STATS ─────────────────────────────────────────

export async function getSuperadminStats() {
  const orgsSnap = await getDocs(collection(db, 'organizations'))
  const usersSnap = await getDocs(collection(db, 'users'))
  return {
    totalOrgs: orgsSnap.size,
    totalUsers: usersSnap.size,
    activeOrgs: orgsSnap.docs.filter(d => d.data().status === 'active').length
  }
}

// ─── ANALYSIS CACHE ───────────────────────────────────────────

export type AnalysisCachePhase = 'requirement' | 'threat' | 'code' | 'dependency' | 'crossphase'

export interface AnalysisCacheEntry {
  phase: AnalysisCachePhase
  result: any
  inputHash: string
  inputText?: string
  savedAt: Timestamp
}

export async function saveAnalysisCache(
  uid: string, projectId: string, phase: AnalysisCachePhase,
  result: any, inputSnippet: string, inputText?: string
): Promise<void> {
  const MAX_INPUT = 20000
  const safeInput = inputText ? inputText.slice(0, MAX_INPUT) : inputSnippet.slice(0, MAX_INPUT)
  const safeResult = JSON.parse(JSON.stringify(result ?? {}))
  await setDoc(doc(db, 'users', uid, 'projects', projectId, 'analysisCache', phase), {
    phase, result: safeResult,
    inputHash: inputSnippet.slice(0, 100),
    inputText: safeInput, savedAt: serverTimestamp(),
  })
}

export async function loadAnalysisCache(
  uid: string, projectId: string
): Promise<Record<AnalysisCachePhase, { result: any; inputText?: string } | null>> {
  const snap = await getDocs(collection(db, 'users', uid, 'projects', projectId, 'analysisCache'))
  const cache: Record<string, any> = {
    requirement: null, threat: null, code: null, dependency: null, crossphase: null,
  }
  snap.docs.forEach(d => {
    const data = sanitizeDoc(d.data()) as AnalysisCacheEntry & { inputText?: string }
    cache[d.id] = { result: data.result ?? null, inputText: data.inputText ?? '' }
  })
  return cache as Record<AnalysisCachePhase, { result: any; inputText?: string } | null>
}

export async function clearAnalysisCache(uid: string, projectId: string, phase?: AnalysisCachePhase): Promise<void> {
  if (phase) {
    await deleteDoc(doc(db, 'users', uid, 'projects', projectId, 'analysisCache', phase))
    return
  }
  const snap = await getDocs(collection(db, 'users', uid, 'projects', projectId, 'analysisCache'))
  await Promise.all(snap.docs.map(d => deleteDoc(d.ref)))
}

// ─── REMEDIATIONS ─────────────────────────────────────────────

export type RemediationStatus = 'fixed' | 'in_progress' | 'wont_fix'

export interface RemediationEntry {
  findingId: string
  status: RemediationStatus
  note?: string
  updatedAt: Timestamp
}

export async function saveRemediation(
  uid: string, projectId: string, findingId: string,
  status: RemediationStatus | 'none' | null, note?: string
): Promise<void> {
  const ref = doc(db, 'users', uid, 'projects', projectId, 'remediations', findingId)
  if (!status || status === 'none') { await deleteDoc(ref).catch(() => {}); return }
  await setDoc(ref, { findingId, status, note: note ?? '', updatedAt: serverTimestamp() })
}

export async function loadRemediations(
  uid: string, projectId: string
): Promise<Record<string, { status: RemediationStatus; type?: string; note?: string }>> {
  const snap = await getDocs(collection(db, 'users', uid, 'projects', projectId, 'remediations'))
  const result: Record<string, { status: RemediationStatus; type?: string; note?: string }> = {}
  snap.docs.forEach(d => {
    const data = sanitizeDoc(d.data()) as RemediationEntry & { type?: string }
    result[d.id] = { status: data.status, type: data.type ?? undefined, note: data.note ?? undefined }
  })
  return result
}

export function subscribeRemediations(
  uid: string, projectId: string,
  onUpdate: (remediations: Record<string, RemediationStatus>) => void
): () => void {
  return onSnapshot(
    collection(db, 'users', uid, 'projects', projectId, 'remediations'),
    snap => {
      const result: Record<string, RemediationStatus> = {}
      snap.docs.forEach(d => {
        const data = sanitizeDoc(d.data()) as RemediationEntry
        result[data.findingId] = data.status
      })
      onUpdate(result)
    }
  )
}

// ─── BASELINE SCORE ───────────────────────────────────────────

export async function saveBaselineScore(uid: string, projectId: string, score: number): Promise<void> {
  await setDoc(
    doc(db, 'users', uid, 'projects', projectId),
    { baselineScore: score, baselineSetAt: serverTimestamp() },
    { merge: true }
  )
}

// ─── EMPLOYEE → ORG CONNECTION ────────────────────────────────

export interface OrgProjectForEmployee {
  projectId: string
  projectName: string
  description: string
  domain: string
  currentPhase: string
  status: string
  progress: number
  riskScore: number
  teamId: string
  teamName: string
  orgId: string
  lastScanAt?: Timestamp
}

export async function getEmployeeOrgProjects(uid: string, orgId: string): Promise<OrgProjectForEmployee[]> {
  try {
    const teamsSnap = await getDocs(collection(db, 'organizations', orgId, 'teams'))
    const myTeams = teamsSnap.docs
      .map(d => ({ id: d.id, ...d.data() } as Team & { memberIds?: string[] }))
      .filter(t => {
        const memberIds: string[] = ((t as any).memberIds ?? []).filter((id: string) => !!id && id !== 'none')
        return memberIds.includes(uid) || (t.leadUserId && t.leadUserId !== 'none' && t.leadUserId === uid)
      })

    if (myTeams.length === 0) return []
    const projectIds = [...new Set(myTeams.map(t => t.projectId).filter(Boolean))] as string[]
    if (projectIds.length === 0) return []

    const results: OrgProjectForEmployee[] = []
    for (const projectId of projectIds) {
      const pSnap = await getDoc(doc(db, 'organizations', orgId, 'projects', projectId))
      if (!pSnap.exists()) continue
      const p = sanitizeDoc(pSnap.data()) as Project
      const team = myTeams.find(t => t.projectId === projectId)!
      results.push({
        projectId, projectName: p.name, description: p.description,
        domain: p.domain, currentPhase: p.currentPhase, status: p.status,
        progress: p.progress ?? 0, riskScore: p.riskScore ?? 0,
        teamId: team.id, teamName: team.name, orgId,
        lastScanAt: p.lastScanAt,
      })
    }
    return results
  } catch (err) {
    console.error('[getEmployeeOrgProjects] error:', err)
    return []
  }
}
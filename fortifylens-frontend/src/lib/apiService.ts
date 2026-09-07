// ============================================================
// FortifyLens — Frontend API Service
// All HTTP calls to the Node.js backend
//
// SETUP: Add to your frontend .env:
//   VITE_BACKEND_URL=http://localhost:5000
//
// USAGE: import { api } from '../lib/apiService'
// ============================================================

import { auth } from './firebase'

const BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000'

// ─── HTTP Helper ──────────────────────────────────────────────

async function request(method: string, path: string, body?: object) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  // Attach Firebase ID token if user is logged in
  const currentUser = auth.currentUser
  if (currentUser) {
    try {
      const token = await currentUser.getIdToken()
      headers['Authorization'] = `Bearer ${token}`
    } catch {
      // Token fetch failed — continue without auth header
    }
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    ...(body && { body: JSON.stringify(body) }),
  })

  const data = await res.json()

  if (!res.ok) {
    throw new Error(data.error || `Request failed: ${res.status}`)
  }

  return data
}

const get  = (path: string)              => request('GET',    path)
const post = (path: string, body: object) => request('POST',   path, body)
const put  = (path: string, body: object) => request('PUT',    path, body)
const del  = (path: string)              => request('DELETE', path)
const patch = (path: string, body: object) => request('PATCH', path, body)

// ─── AUTH ─────────────────────────────────────────────────────

export const authApi = {
  /** Call after signup to save/update Firestore profile */
  saveProfile: (data: { uid: string; email: string; fullName: string; role?: string; orgId?: string }) =>
    post('/api/auth/profile', data),

  /** Fetch current user profile */
  getMe: () => get('/api/auth/me'),

  /** Update current user profile */
  updateMe: (data: { fullName?: string; phoneNumber?: string; avatarUrl?: string }) =>
    put('/api/auth/me', data),

  /** Verify token validity */
  verifyToken: () => post('/api/auth/verify-token', {}),
}

// ─── PROJECTS ─────────────────────────────────────────────────

export const projectsApi = {
  /** Get all projects for the current user's org */
  getAll: () => get('/api/projects'),

  /** Get single project with phases and vuln count */
  getById: (projectId: string) => get(`/api/projects/${projectId}`),

  /** Create a new project */
  create: (data: {
    name: string
    description?: string
    domain?: string
    currentPhase?: string
    teamId?: string
  }) => post('/api/projects', data),

  /** Update project */
  update: (projectId: string, data: object) => put(`/api/projects/${projectId}`, data),

  /** Delete project */
  delete: (projectId: string) => del(`/api/projects/${projectId}`),

  /** Get vulnerabilities for a project */
  getVulnerabilities: (projectId: string) => get(`/api/projects/${projectId}/vulnerabilities`),

  /** Add a vulnerability */
  addVulnerability: (projectId: string, data: {
    title: string
    severity: string
    description: string
    recommendation?: string
  }) => post(`/api/projects/${projectId}/vulnerabilities`, data),

  /** Mark vulnerability as resolved */
  resolveVulnerability: (projectId: string, vulnId: string) =>
    patch(`/api/projects/${projectId}/vulnerabilities/${vulnId}/resolve`, {}),
}

// ─── ANALYSIS ─────────────────────────────────────────────────

export const analysisApi = {
  /**
   * Requirement Security Analysis
   * Analyzes security controls and freetext requirements
   */
  analyzeRequirements: (data: {
    projectId?: string
    authentication: boolean
    sensitiveData: boolean
    encryption: boolean
    dataStorage: boolean
    thirdPartyAPIs: boolean
    compliance: string[]
    requirementsText?: string
    codeSnippet?: string
  }) => post('/api/analysis/requirements', data),

  /**
   * STRIDE Threat Modeling
   * Analyzes architectural components for threats
   */
  analyzeThreats: (data: {
    projectId?: string
    components: Array<{ name: string; type: 'API' | 'Database' | 'Client' | 'Server' }>
    designCode?: string
  }) => post('/api/analysis/threats', data),

  /**
   * SAST Code Review
   * Scans source code for OWASP vulnerabilities
   */
  analyzeCode: (data: {
    projectId?: string
    sourceCode: string
    language?: string
  }) => post('/api/analysis/code', data),

  /**
   * SCA Dependency Scanning
   * Scans package manifests against OSV vulnerability database
   */
  scanDependencies: (data: {
    content: string
    filename: string
    projectId?: string
    isOrgProject?: boolean
    orgId?: string
  }) => post('/api/analysis/dependencies', data),

  /**
   * Pipeline Security Scanning
   * Scans CI/CD configuration files for security misconfigurations
   */
  analyzePipelineConfig: (content: string, filename: string, projectId?: string, isOrgProject?: boolean) =>
    post('/api/analysis/pipeline-config', { content, filename, projectId, isOrgProject }),
}

// ─── ORGANIZATIONS ─────────────────────────────────────────────

export const orgsApi = {
  /** Get all orgs (superadmin only) */
  getAll: () => get('/api/orgs'),

  /** Get org by ID */
  getById: (orgId: string) => get(`/api/orgs/${orgId}`),

  /** Create organization (called during org_admin signup) */
  create: (data: {
    name: string
    industry: string
    orgSize: string
    phoneNumber?: string
    adminUid?: string
  }) => post('/api/orgs', data),

  /** Update organization */
  update: (orgId: string, data: object) => put(`/api/orgs/${orgId}`, data),

  /** Suspend or activate org */
  setStatus: (orgId: string, status: 'active' | 'suspended') =>
    patch(`/api/orgs/${orgId}/status`, { status }),

  /** Get org members */
  getMembers: (orgId: string) => get(`/api/orgs/${orgId}/members`),

  /** Add member */
  addMember: (orgId: string, data: object) =>
    post(`/api/orgs/${orgId}/members`, data),

  /** Update member status */
  setMemberStatus: (orgId: string, memberId: string, status: string) =>
    patch(`/api/orgs/${orgId}/members/${memberId}/status`, { status }),

  /** Get subscription plans */
  getPlans: () => get('/api/orgs/plans/all'),

  /** Update a plan (superadmin only) */
  updatePlan: (planId: string, data: object) => put(`/api/orgs/plans/${planId}`, data),
}

// ─── TEAMS ─────────────────────────────────────────────────────

export const teamsApi = {
  getAll: () => get('/api/teams'),

  create: (data: {
    name: string
    leadUserId?: string
    leadName?: string
    projectId?: string
    projectName?: string
  }) => post('/api/teams', data),

  update: (teamId: string, data: object) => put(`/api/teams/${teamId}`, data),
  delete: (teamId: string) => del(`/api/teams/${teamId}`),
}

// ─── INVITATIONS ───────────────────────────────────────────────

export const invitationsApi = {
  /** Create invitation (org admin only) */
  create: (data: { email: string; role?: string; department?: string }) =>
    post('/api/invitations', data),

  /** Verify invite code before signup */
  verify: (inviteCode: string) =>
    post('/api/invitations/verify', { inviteCode }),

  /** Accept invitation after signup */
  accept: (inviteCode: string) =>
    post('/api/invitations/accept', { inviteCode }),

  /** Get all invitations for org */
  getAll: () => get('/api/invitations'),
}

// ─── ACTIVITY ──────────────────────────────────────────────────

export const activityApi = {
  getAll: () => get('/api/activity'),
  log: (action: string, type = 'info') => post('/api/activity', { action, type }),
}

// ─── SUPERADMIN ────────────────────────────────────────────────

export const superadminApi = {
  getStats:        () => get('/api/superadmin/stats'),
  getRevenue:      () => get('/api/superadmin/revenue'),
  getSystemHealth: () => get('/api/superadmin/system-health'),
}

// ─── USERS ─────────────────────────────────────────────────────

export const usersApi = {
  getAll:  () => get('/api/users'),
  getById: (uid: string) => get(`/api/users/${uid}`),
  update:  (uid: string, data: object) => put(`/api/users/${uid}`, data),
  delete:  (uid: string) => del(`/api/users/${uid}`),
}

// Default export for convenience
export const api = {
  auth:        authApi,
  projects:    projectsApi,
  analysis:    analysisApi,
  orgs:        orgsApi,
  teams:       teamsApi,
  invitations: invitationsApi,
  activity:    activityApi,
  superadmin:  superadminApi,
  users:       usersApi,
}

export default api
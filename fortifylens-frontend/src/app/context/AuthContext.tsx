import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithPopup,
  type User as FirebaseUser
} from 'firebase/auth'
import { auth } from '../../lib/firebase'
import { getUserProfile, createUserProfile } from '../../lib/firebaseService'

// ── SESSION TIME LIMIT ───────────────────────────────────────
// How long a login stays valid before the user is auto-logged-out.
// Change this single value to adjust the session length app-wide.
const SESSION_DURATION_MS = 1 * 60 * 60 * 1000 // 1 hours
const SESSION_STORAGE_KEY = 'fl_session_start'

function startSessionTimer() {
  localStorage.setItem(SESSION_STORAGE_KEY, Date.now().toString())
}

function clearSessionTimer() {
  localStorage.removeItem(SESSION_STORAGE_KEY)
}

function isSessionExpired(): boolean {
  const start = localStorage.getItem(SESSION_STORAGE_KEY)
  if (!start) return false // no recorded start yet — treated as fresh below
  return Date.now() - parseInt(start, 10) > SESSION_DURATION_MS
}
// ──────────────────────────────────────────────────────────────

export type UserRole = 'superadmin' | 'org_admin' | 'user' | 'employee' | null

function normalizeRole(rawRole: string | null | undefined, hasOrgId: boolean): UserRole {
  if (!rawRole) return 'user'
  const known: UserRole[] = ['superadmin', 'org_admin', 'user', 'employee']
  if (known.includes(rawRole as UserRole)) return rawRole as UserRole
  return hasOrgId ? 'employee' : 'user'
}

interface User {
  uid: string
  email: string
  fullName: string
  role: UserRole
  orgId?: string
  avatarUrl?: string | null
  // ── PAYMENT: only these 2 fields added ──────────────────
  planStatus?: 'active' | 'inactive' | 'cancelled' | null
  currentPlan?: string | null
  // ────────────────────────────────────────────────────────
}

interface AuthContextType {
  user: User | null
  isAuthenticated: boolean
  loading: boolean
  login: (email: string, password: string) => Promise<{ success: boolean; role?: UserRole; message?: string }>
  loginWithGoogle: () => Promise<{ success: boolean; role?: UserRole; message?: string }>
  signup: (email: string, password: string, fullName: string, role?: UserRole) => Promise<{ success: boolean; uid?: string; message?: string }>
  logout: () => Promise<void>
  resetPassword: (email: string) => Promise<{ success: boolean; message?: string }>
  updateAvatar: (file: File) => Promise<{ success: boolean; url?: string; message?: string }>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      if (!firebaseUser) {
        setUser(null)
        setLoading(false)
        clearSessionTimer()
        return
      }

      // Session time-limit check — if this login has been active longer
      // than SESSION_DURATION_MS, force logout instead of restoring the user.
      if (isSessionExpired()) {
        clearSessionTimer()
        await signOut(auth)
        setUser(null)
        setLoading(false)
        return
      }
      // If there's no recorded start (fresh login, or a pre-existing
      // Firebase session from before this feature existed), start counting now.
      if (!localStorage.getItem(SESSION_STORAGE_KEY)) {
        startSessionTimer()
      }

      try {
        const profile = await getUserProfile(firebaseUser.uid)
        let orgId = profile?.orgId || undefined

        if ((profile?.role === 'org_admin') && !orgId) {
          try {
            const { getDocs, collection, query, where } = await import('firebase/firestore')
            const { db: firestoreDb } = await import('../../lib/firebase')
            const orgsSnap = await getDocs(
              query(collection(firestoreDb, 'organizations'), where('adminUid', '==', firebaseUser.uid))
            )
            if (!orgsSnap.empty) {
              orgId = orgsSnap.docs[0].id
              const { updateDoc, doc } = await import('firebase/firestore')
              await updateDoc(doc(firestoreDb, 'users', firebaseUser.uid), { orgId })
            }
          } catch (lookupErr) {
            console.warn('[AuthContext] Could not look up orgId from organizations:', lookupErr)
          }
        }

        const rawRole = profile?.role
        const normalizedRole = normalizeRole(rawRole, !!orgId)

        if (rawRole && rawRole !== normalizedRole) {
          try {
            const { updateDoc, doc: fbDoc } = await import('firebase/firestore')
            const { db: firestoreDb } = await import('../../lib/firebase')
            await updateDoc(fbDoc(firestoreDb, 'users', firebaseUser.uid), { role: normalizedRole })
          } catch (_) { /* non-critical */ }
        }

        // ── PAYMENT: fetch planStatus (read-only, no side effects) ──
        let planStatus: User['planStatus'] = null
        let currentPlan: string | null = null
        try {
          if (normalizedRole === 'superadmin') {
            // superadmin always active — no Firestore read needed
            planStatus = 'active'
          } else if ((normalizedRole === 'org_admin' || normalizedRole === 'employee') && orgId) {
            // org users: check the org document
            const { getDoc, doc: gDoc } = await import('firebase/firestore')
            const { db: fDb } = await import('../../lib/firebase')
            const orgSnap = await getDoc(gDoc(fDb, 'organizations', orgId))
            if (orgSnap.exists()) {
              const od = orgSnap.data()
              planStatus  = od.planStatus  ?? null
              currentPlan = od.currentPlan ?? null
            }
          } else {
            // individual user: check user document
            planStatus  = (profile as any)?.planStatus  ?? null
            currentPlan = (profile as any)?.currentPlan ?? null
          }
        } catch (_) {
          // planStatus fetch failure is non-critical — user still logs in
        }
        // ──────────────────────────────────────────────────────────

        setUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email || '',
          fullName: profile?.fullName || firebaseUser.displayName || '',
          role: normalizedRole,
          orgId,
          avatarUrl: profile?.avatarUrl || firebaseUser.photoURL || null,
          planStatus,   // ← payment field
          currentPlan,  // ← payment field
        })
      } catch {
        setUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email || '',
          fullName: firebaseUser.displayName || '',
          role: 'user'
        })
      }

      setLoading(false)
    })

    return () => unsub()
  }, [])

  // While the app is open, check every minute whether the session has
  // timed out — so a long-idle open tab gets logged out too, not just on reload.
  useEffect(() => {
    const interval = setInterval(() => {
      if (user && isSessionExpired()) {
        clearSessionTimer()
        signOut(auth)
        setUser(null)
      }
    }, 60 * 1000)
    return () => clearInterval(interval)
  }, [user])

  const login = async (email: string, password: string) => {
    try {
      const result = await signInWithEmailAndPassword(auth, email, password)
      const user = result.user
      startSessionTimer()
      let role: UserRole = 'user'
      try {
        const profile = await getUserProfile(user.uid)
        const orgId = profile?.orgId || null
        role = normalizeRole(profile?.role, !!orgId)
      } catch {
        role = 'user'
      }
      return { success: true, role }
    } catch (err: any) {
      let msg = "Login failed"
      if (err.code === "auth/user-not-found") msg = "User not found"
      if (err.code === "auth/wrong-password") msg = "Wrong password"
      if (err.code === "auth/invalid-credential") msg = "Invalid email or password"
      if (err.code === "auth/too-many-requests") msg = "Too many attempts. Try again later."
      return { success: false, message: msg }
    }
  }

  const loginWithGoogle = async () => {
    try {
      const provider = new GoogleAuthProvider()
      const result = await signInWithPopup(auth, provider)
      startSessionTimer()
      let profile = await getUserProfile(result.user.uid)
      if (!profile) {
        await createUserProfile(result.user.uid, {
          email: result.user.email || '',
          fullName: result.user.displayName || '',
          role: 'user'
        })
        profile = await getUserProfile(result.user.uid)
      }
      return { success: true, role: normalizeRole(profile?.role, !!profile?.orgId) }
    } catch (err: any) {
      return { success: false, message: err.message }
    }
  }

  const signup = async (email: string, password: string, fullName: string, role: UserRole = 'user') => {
    try {
      const result = await createUserWithEmailAndPassword(auth, email, password)
      try {
        await createUserProfile(result.user.uid, { email, fullName, role })
      } catch (firestoreErr: any) {
        console.error("Firestore profile save failed:", firestoreErr.code, firestoreErr.message)
      }
      await signOut(auth)
      return { success: true, uid: result.user.uid }
    } catch (err: any) {
      let msg = "Signup failed"
      if (err.code === "auth/email-already-in-use") msg = "Email already in use"
      if (err.code === "auth/weak-password") msg = "Password too weak (min 6 characters)"
      if (err.code === "auth/invalid-email") msg = "Invalid email address"
      if (err.code === "auth/operation-not-allowed") msg = "Email/password signup is not enabled"
      return { success: false, message: msg }
    }
  }

  const logout = async () => {
    await signOut(auth)
    setUser(null)
    clearSessionTimer()
  }

  const updateAvatar = async (file: File) => {
    if (!user) return { success: false, message: 'Not logged in' }
    try {
      const { ref, uploadBytes, getDownloadURL } = await import('firebase/storage')
      const { storage } = await import('../../lib/firebase')
      const { updateUserProfile } = await import('../../lib/firebaseService')
      const fileRef = ref(storage, `avatars/${user.uid}`)
      await uploadBytes(fileRef, file)
      const url = await getDownloadURL(fileRef)
      await updateUserProfile(user.uid, { avatarUrl: url })
      setUser(prev => (prev ? { ...prev, avatarUrl: url } : prev))
      return { success: true, url }
    } catch (err: any) {
      return { success: false, message: err.message || 'Upload failed' }
    }
  }

  const resetPassword = async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email)
      return { success: true }
    } catch (err: any) {
      return { success: false, message: err.message }
    }
  }

  return (
    <AuthContext.Provider value={{
      user, isAuthenticated: !!user, loading,
      login, loginWithGoogle, signup, logout, resetPassword, updateAvatar
    }}>
      {children}
    </AuthContext.Provider>
  )
}
import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import {
  createUserProject,
  subscribeUserProjects,
  updateUserProject,
  type UserProject,
} from '../../lib/firebaseService';

export type ProjectPhase = 'requirement' | 'design' | 'development' | 'sca' | 'crossphase' | 'completed';

export interface Project {
  id: string;
  name: string;
  description: string;
  currentPhase: ProjectPhase;
  domain?: string;
  assignedTo?: string;
  createdAt: string;
  requirementData?: {
    authentication: boolean;
    sensitiveData: boolean;
    encryption: boolean;
    compliance: string[];
    aiAnalysis?: {
      riskScore: number;
      missingRequirements: string[];
      securityChecklist: string[];
    };
  };
  designData?: {
    architectureUploaded: boolean;
    components: Array<{ name: string; type: 'API' | 'Database' | 'Client' | 'Server' }>;
    threats?: Array<{
      id: string;
      category: string;
      description: string;
      severity: 'High' | 'Medium' | 'Low';
      mitigation: string;
    }>;
    riskScore?: number;
  };
}

interface AppContextType {
  projects: Project[];
  addProject: (project: Project) => Promise<string | undefined>;
  updateProject: (id: string, updates: Partial<Project>) => void;
  getProjectById: (id: string) => Project | undefined;
  currentProjectId: string | null;
  setCurrentProjectId: (id: string | null) => void;
  loadingProjects: boolean;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
};

function tsToString(ts: any): string {
  if (!ts) return '';
  try {
    if (typeof ts.toDate === 'function') {
      return ts.toDate().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
    }
    const secs = ts._seconds ?? ts.seconds;
    if (typeof secs === 'number') {
      return new Date(secs * 1000).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
    }
  } catch {}
  return String(ts);
}

function toProject(up: UserProject): Project {
  return {
    id:           up.id,
    name:         up.name,
    description:  up.description,
    currentPhase: up.currentPhase as ProjectPhase,
    domain:       up.domain,
    assignedTo:   up.assignedTo,
    createdAt:    tsToString(up.createdAt),
    // ✅ Map Firestore fields so overview shows correct status/progress/risk
    ...((up as any).status      !== undefined && { status:      (up as any).status }),
    ...((up as any).progress    !== undefined && { progress:    (up as any).progress }),
    ...((up as any).riskScore   !== undefined && { riskScore:   (up as any).riskScore }),
    ...((up as any).completedAt !== undefined && { completedAt: (up as any).completedAt }),
    ...((up as any).reopenedAt  !== undefined && { reopenedAt:  (up as any).reopenedAt }),
  };
}

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [currentUid, setCurrentUid] = useState<string | null>(null);

  useEffect(() => {
    const auth = getAuth();
    let unsubProjects: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, (firebaseUser) => {
      if (unsubProjects) { unsubProjects(); unsubProjects = null; }

      if (!firebaseUser) {
        setCurrentUid(null);
        setProjects([]);
        setLoadingProjects(false);
        return;
      }

      setCurrentUid(firebaseUser.uid);
      setLoadingProjects(true);

      unsubProjects = subscribeUserProjects(firebaseUser.uid, (firestoreProjects) => {
        setProjects(firestoreProjects.map(toProject));
        setLoadingProjects(false);
      });
    });

    return () => {
      unsubAuth();
      if (unsubProjects) unsubProjects();
    };
  }, []);

  const addProject = useCallback(async (project: Project): Promise<string | undefined> => {
    if (!currentUid) { console.error('addProject: no authenticated user'); return undefined; }
    try {
      const firestoreId = await createUserProject(currentUid, {
        name: project.name,
        description: project.description || 'Security assessment project',
        currentPhase: (project.currentPhase as any) || 'requirement',
        domain: (project as any).domain || 'web-application',
        assignedTo: project.assignedTo || '',
        status: 'in-progress',
        progress: 0,
        riskScore: 0,
      });
      return firestoreId;
    } catch (err) {
      console.error('Failed to create project in Firestore:', err);
      return undefined;
    }
  }, [currentUid]);

  const updateProject = useCallback((id: string, updates: Partial<Project>) => {
    setProjects(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
    if (currentUid) {
      const firestoreUpdates: Record<string, any> = {};
      if (updates.name !== undefined) firestoreUpdates.name = updates.name;
      if (updates.description !== undefined) firestoreUpdates.description = updates.description;
      if (updates.currentPhase !== undefined) firestoreUpdates.currentPhase = updates.currentPhase;
      if ((updates as any).domain !== undefined) firestoreUpdates.domain = (updates as any).domain;
      // ✅ Also sync status/progress/riskScore to Firestore
      if ((updates as any).status      !== undefined) firestoreUpdates.status      = (updates as any).status;
      if ((updates as any).progress    !== undefined) firestoreUpdates.progress    = (updates as any).progress;
      if ((updates as any).riskScore   !== undefined) firestoreUpdates.riskScore   = (updates as any).riskScore;
      if ((updates as any).completedAt !== undefined) firestoreUpdates.completedAt = (updates as any).completedAt;
      if ((updates as any).reopenedAt  !== undefined) firestoreUpdates.reopenedAt  = (updates as any).reopenedAt;
      if (Object.keys(firestoreUpdates).length > 0) {
        updateUserProject(currentUid, id, firestoreUpdates).catch(console.error);
      }
    }
  }, [currentUid]);

  const getProjectById = useCallback((id: string) => {
    return projects.find(p => p.id === id);
  }, [projects]);

  return (
    <AppContext.Provider value={{
      projects,
      addProject,
      updateProject,
      getProjectById,
      currentProjectId,
      setCurrentProjectId,
      loadingProjects,
    }}>
      {children}
    </AppContext.Provider>
  );
};
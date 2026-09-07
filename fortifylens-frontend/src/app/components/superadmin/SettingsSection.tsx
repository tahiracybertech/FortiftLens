import React, { useEffect, useState } from 'react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Switch } from '../ui/switch';
import { Badge } from '../ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import {
  Settings as SettingsIcon, Shield, Mail, Users, Key, FileText,
  Save, Plus, Trash2, Eye, EyeOff, Copy, CheckCircle, Loader2,
} from 'lucide-react';
import {
  collection, doc, onSnapshot, query, orderBy, setDoc,
  addDoc, deleteDoc, Timestamp, where,
} from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { toast } from 'sonner';

interface PlatformConfig {
  appName: string; supportEmail: string; companyName: string;
  website: string; welcomeEmailTemplate: string;
}
interface ApiKey {
  id: string; name: string; key: string; created: string;
  lastUsed: string; status: string;
}
interface AuditEntry {
  id: string; admin: string; action: string;
  details: string; timestamp: string;
}

const DEFAULT_CONFIG: PlatformConfig = {
  appName: 'FortifyLens',
  supportEmail: 'support@fortifylens.com',
  companyName: 'FortifyLens',
  website: 'https://fortifylens.com',
  welcomeEmailTemplate: `Hello {{name}},\n\nWelcome to FortifyLens!\n\nYour account has been successfully created.\n\nBest regards,\nThe FortifyLens Team`,
};

const DEFAULT_FEATURES = {
  Starter:    { sastScanning: true,  dastScanning: false, apiTesting: false, prioritySupport: false },
  Business:   { sastScanning: true,  dastScanning: true,  apiTesting: true,  prioritySupport: false },
  Enterprise: { sastScanning: true,  dastScanning: true,  apiTesting: true,  prioritySupport: true  },
};

const logAudit = (action: string, details: string) =>
  addDoc(collection(db, 'activityLogs'), {
    action, type: 'info', details,
    userName: 'SuperAdmin',
    createdAt: Timestamp.now(),
  }).catch(() => {});

const SettingsSection: React.FC = () => {
  const [activeTab, setActiveTab] = useState('platform');
  const [showApiKey, setShowApiKey] = useState<Record<string, boolean>>({});

  // Platform config
  const [platformConfig, setPlatformConfig] = useState<PlatformConfig>(DEFAULT_CONFIG);
  const [configLoading, setConfigLoading] = useState(true);
  const [configSaving, setConfigSaving] = useState(false);

  // Feature flags
  const [features, setFeatures] = useState(DEFAULT_FEATURES);

  // Super admins — read from users collection where role = 'superadmin'
  const [superAdmins, setSuperAdmins] = useState<any[]>([]);

  // API keys
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);

  // Audit — reads from activityLogs (existing collection)
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);

  // Dialog states — replacing all window.prompt / window.confirm
  const [showAddAdminDialog, setShowAddAdminDialog] = useState(false);
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminName, setNewAdminName]   = useState('');
  const [addingAdmin, setAddingAdmin]     = useState(false);

  const [showRemoveAdminDialog, setShowRemoveAdminDialog] = useState(false);
  const [adminToRemove, setAdminToRemove] = useState<any>(null);

  const [showGenKeyDialog, setShowGenKeyDialog]   = useState(false);
  const [newKeyName, setNewKeyName]               = useState('');
  const [generatingKey, setGeneratingKey]         = useState(false);

  const [showRevokeKeyDialog, setShowRevokeKeyDialog] = useState(false);
  const [keyToRevoke, setKeyToRevoke]                 = useState<ApiKey | null>(null);

  /* ── Firestore listeners ─────────────────────────────────────────────── */
  useEffect(() => {
    // Platform config
    const unsub1 = onSnapshot(doc(db, 'settings', 'platformConfig'), snap => {
      if (snap.exists()) {
        const d = snap.data();
        setPlatformConfig({
          appName:              d.appName              ?? DEFAULT_CONFIG.appName,
          supportEmail:         d.supportEmail         ?? DEFAULT_CONFIG.supportEmail,
          companyName:          d.companyName          ?? DEFAULT_CONFIG.companyName,
          website:              d.website              ?? DEFAULT_CONFIG.website,
          welcomeEmailTemplate: d.welcomeEmailTemplate ?? DEFAULT_CONFIG.welcomeEmailTemplate,
        });
      }
      setConfigLoading(false);
    }, () => setConfigLoading(false));

    // Feature flags
    const unsub2 = onSnapshot(doc(db, 'settings', 'featureFlags'), snap => {
      if (snap.exists()) setFeatures(snap.data() as typeof DEFAULT_FEATURES);
    });

    // Super admins — from users collection, role = 'superadmin'
    const unsub3 = onSnapshot(
      query(collection(db, 'users'), where('role', '==', 'superadmin')),
      snap => {
        setSuperAdmins(snap.docs.map(d => {
          const data = d.data();
          return {
            id: d.id,
            name:      data.fullName ?? data.displayName ?? data.email ?? '—',
            email:     data.email ?? '—',
            role:      'Super Admin',
            createdAt: data.createdAt?.toDate?.()?.toLocaleDateString() ?? '—',
          };
        }));
      }
    );

    // API keys
    const unsub4 = onSnapshot(
      query(collection(db, 'apiKeys'), orderBy('createdAt', 'desc')),
      snap => {
        setApiKeys(snap.docs.map(d => {
          const data = d.data();
          return {
            id:       d.id,
            name:     data.name ?? '—',
            key:      data.key  ?? '—',
            created:  data.createdAt?.toDate?.()?.toLocaleDateString() ?? '—',
            lastUsed: data.lastUsedAt?.toDate?.()?.toLocaleString() ?? 'Never',
            status:   data.status ?? 'Active',
          } as ApiKey;
        }));
      }
    );

    // Audit log — reads from activityLogs (existing collection)
    const unsub5 = onSnapshot(
      query(collection(db, 'activityLogs'), orderBy('createdAt', 'desc')),
      snap => {
        setAuditLog(snap.docs.slice(0, 50).map(d => {
          const data = d.data();
          const ts = data.createdAt;
          return {
            id:        d.id,
            admin:     data.userName ?? data.userId ?? '—',
            action:    data.action   ?? data.type   ?? '—',
            details:   data.details  ?? '',
            timestamp: ts?.toDate?.()?.toLocaleString() ?? (ts ? new Date(ts._seconds * 1000).toLocaleString() : '—'),
          } as AuditEntry;
        }));
      }
    );

    return () => { unsub1(); unsub2(); unsub3(); unsub4(); unsub5(); };
  }, []);

  /* ── Handlers ───────────────────────────────────────────────────────── */
  const handleSavePlatformConfig = async () => {
    setConfigSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'platformConfig'), { ...platformConfig, updatedAt: Timestamp.now() });
      await logAudit('Updated platform configuration', 'Platform config saved via Settings panel');
      toast.success('Platform configuration saved!');
    } catch { toast.error('Failed to save configuration'); }
    setConfigSaving(false);
  };

  const handleToggleFeature = async (plan: string, feature: string, current: boolean) => {
    const updated = { ...features, [plan]: { ...(features as any)[plan], [feature]: !current } };
    setFeatures(updated as typeof DEFAULT_FEATURES);
    try {
      await setDoc(doc(db, 'settings', 'featureFlags'), updated);
      await logAudit('Updated feature flag', `${current ? 'Disabled' : 'Enabled'} "${feature}" for ${plan} plan`);
      toast.success('Feature flag updated');
    } catch { setFeatures(features); toast.error('Failed to update feature flag'); }
  };

  const handleAddSuperAdmin = async () => {
    if (!newAdminEmail.trim()) { toast.error('Email is required'); return; }
    setAddingAdmin(true);
    try {
      // Record in superAdmins collection (note: actual role change needs manual Firestore edit)
      await addDoc(collection(db, 'superAdmins'), {
        name: newAdminName || newAdminEmail,
        email: newAdminEmail.trim().toLowerCase(),
        role: 'Super Admin',
        addedAt: Timestamp.now(),
      });
      await logAudit('Added super admin', `Invited ${newAdminEmail} as Super Admin`);
      toast.success(`${newAdminEmail} added — update their role in Firestore to activate`);
      setShowAddAdminDialog(false);
      setNewAdminEmail(''); setNewAdminName('');
    } catch { toast.error('Failed to add super admin'); }
    setAddingAdmin(false);
  };

  const handleRemoveAdmin = async () => {
    if (!adminToRemove) return;
    try {
      await deleteDoc(doc(db, 'superAdmins', adminToRemove.id));
      await logAudit('Removed super admin', `Removed ${adminToRemove.email}`);
      toast.success(`${adminToRemove.name} removed`);
      setShowRemoveAdminDialog(false); setAdminToRemove(null);
    } catch { toast.error('Failed to remove admin'); }
  };

  const handleGenerateApiKey = async () => {
    if (!newKeyName.trim()) { toast.error('Key name is required'); return; }
    setGeneratingKey(true);
    try {
      const rawKey = `fl_live_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
      await addDoc(collection(db, 'apiKeys'), {
        name: newKeyName.trim(), key: rawKey,
        status: 'Active', createdAt: Timestamp.now(), lastUsedAt: null,
      });
      await logAudit('Generated API key', newKeyName);
      toast.success('API key generated');
      setShowGenKeyDialog(false); setNewKeyName('');
    } catch { toast.error('Failed to generate API key'); }
    setGeneratingKey(false);
  };

  const handleRevokeKey = async () => {
    if (!keyToRevoke) return;
    try {
      await deleteDoc(doc(db, 'apiKeys', keyToRevoke.id));
      await logAudit('Revoked API key', keyToRevoke.name);
      toast.success(`"${keyToRevoke.name}" revoked`);
      setShowRevokeKeyDialog(false); setKeyToRevoke(null);
    } catch { toast.error('Failed to revoke API key'); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Settings</h1>
        <p className="text-gray-400">Configure platform settings and manage administrators</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-white/5 border border-white/10 flex-wrap">
          {[
            { id: 'platform', label: 'Platform Config', icon: SettingsIcon },
            { id: 'features', label: 'Feature Flags',   icon: Shield },
            { id: 'admins',   label: 'Admins',          icon: Users },
            { id: 'api',      label: 'API Keys',        icon: Key },
            { id: 'audit',    label: 'Audit Log',       icon: FileText },
          ].map(({ id, label, icon: Icon }) => (
            <TabsTrigger key={id} value={id}
              className="data-[state=active]:bg-[#00D4FF]/20 data-[state=active]:text-[#00D4FF]">
              <Icon className="w-4 h-4 mr-2" />{label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* ── Platform Config ─────────────────────────────────────────── */}
        <TabsContent value="platform" className="mt-6">
          <Card className="bg-white/5 backdrop-blur-xl border-[#00D4FF]/20 p-6">
            {configLoading ? <p className="text-gray-400">Loading…</p> : (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {[
                    { label: 'App Name',      key: 'appName',      type: 'text' },
                    { label: 'Support Email', key: 'supportEmail', type: 'email' },
                    { label: 'Company Name',  key: 'companyName',  type: 'text' },
                    { label: 'Website',       key: 'website',      type: 'url' },
                  ].map(({ label, key, type }) => (
                    <div key={key}>
                      <Label className="text-gray-300 mb-2 block">{label}</Label>
                      <Input type={type} value={(platformConfig as any)[key]}
                        onChange={e => setPlatformConfig({ ...platformConfig, [key]: e.target.value })}
                        className="bg-white/5 border-white/10 text-white" />
                    </div>
                  ))}
                </div>
                <div>
                  <Label className="text-gray-300 mb-2 block">Welcome Email Template</Label>
                  <Textarea rows={6} value={platformConfig.welcomeEmailTemplate}
                    onChange={e => setPlatformConfig({ ...platformConfig, welcomeEmailTemplate: e.target.value })}
                    className="bg-white/5 border-white/10 text-white font-mono text-sm" />
                  <p className="text-xs text-gray-500 mt-1">Available variables: {'{{name}}'}, {'{{plan}}'}, {'{{email}}'}</p>
                </div>
                <Button onClick={handleSavePlatformConfig} disabled={configSaving}
                  className="bg-[#00D4FF] hover:bg-[#00D4FF]/80 text-white">
                  {configSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                  {configSaving ? 'Saving…' : 'Save Configuration'}
                </Button>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* ── Feature Flags ────────────────────────────────────────────── */}
        <TabsContent value="features" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {Object.entries(features).map(([plan, flags]) => (
              <Card key={plan} className="bg-white/5 backdrop-blur-xl border-[#00D4FF]/20 p-6">
                <h3 className="text-xl font-semibold text-white mb-4">{plan} Plan</h3>
                <div className="space-y-4">
                  {Object.entries(flags).map(([feature, enabled]) => (
                    <div key={feature} className="flex items-center justify-between">
                      <Label className="text-gray-300 text-sm">
                        {feature.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}
                      </Label>
                      <Switch checked={enabled}
                        onCheckedChange={() => handleToggleFeature(plan, feature, enabled)}
                        className="data-[state=checked]:bg-[#00D4FF]" />
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ── Admins ──────────────────────────────────────────────────── */}
        <TabsContent value="admins" className="mt-6">
          <Card className="bg-white/5 backdrop-blur-xl border-[#00D4FF]/20 p-6">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-xl font-semibold text-white">Super Administrators</h3>
                <p className="text-xs text-gray-500 mt-1">Loaded from users collection where role = "superadmin"</p>
              </div>
              <Button onClick={() => setShowAddAdminDialog(true)}
                className="bg-[#00D4FF] hover:bg-[#00D4FF]/80 text-white">
                <Plus className="w-4 h-4 mr-2" />Add Super Admin
              </Button>
            </div>
            {superAdmins.length === 0 && (
              <p className="text-gray-500 text-sm">No super admins found. Current superadmin exists in Firebase Auth.</p>
            )}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-white/10 hover:bg-transparent">
                    {['Name','Email','Role','Member Since','Actions'].map(h => (
                      <TableHead key={h} className="text-gray-400">{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {superAdmins.map(admin => (
                    <TableRow key={admin.id} className="border-b border-white/10 hover:bg-white/5">
                      <TableCell className="font-medium text-white">{admin.name}</TableCell>
                      <TableCell className="text-gray-300">{admin.email}</TableCell>
                      <TableCell>
                        <Badge className="bg-[#00D4FF]/20 text-[#00D4FF] border border-[#00D4FF]/30">{admin.role}</Badge>
                      </TableCell>
                      <TableCell className="text-gray-300">{admin.createdAt}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost"
                          onClick={() => { setAdminToRemove(admin); setShowRemoveAdminDialog(true); }}
                          className="text-red-400 hover:bg-red-500/10">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        {/* ── API Keys ────────────────────────────────────────────────── */}
        <TabsContent value="api" className="mt-6">
          <Card className="bg-white/5 backdrop-blur-xl border-[#00D4FF]/20 p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-semibold text-white">API Key Management</h3>
              <Button onClick={() => setShowGenKeyDialog(true)}
                className="bg-[#00D4FF] hover:bg-[#00D4FF]/80 text-white">
                <Plus className="w-4 h-4 mr-2" />Generate New Key
              </Button>
            </div>
            {apiKeys.length === 0 && <p className="text-gray-500 text-sm">No API keys found.</p>}
            <div className="space-y-4">
              {apiKeys.map(apiKey => (
                <div key={apiKey.id} className="p-4 rounded-lg bg-white/5 border border-white/10">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h4 className="font-semibold text-white mb-1">{apiKey.name}</h4>
                      <p className="text-sm text-gray-400">Created: {apiKey.created} • Last used: {apiKey.lastUsed}</p>
                    </div>
                    <Badge className="bg-green-500/20 text-green-300 border border-green-500/30">
                      <CheckCircle className="w-3 h-3 mr-1" />{apiKey.status}
                    </Badge>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="flex-1 px-4 py-2 rounded bg-black/30 border border-white/10 font-mono text-sm text-gray-300 overflow-hidden text-ellipsis whitespace-nowrap">
                      {showApiKey[apiKey.id] ? apiKey.key : '••••••••••••••••••••••••••••••••'}
                    </div>
                    <Button size="sm" variant="ghost"
                      onClick={() => setShowApiKey(p => ({ ...p, [apiKey.id]: !p[apiKey.id] }))}
                      className="text-gray-400 hover:text-white">
                      {showApiKey[apiKey.id] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                    <Button size="sm" variant="ghost"
                      onClick={() => { navigator.clipboard.writeText(apiKey.key); toast.success('Copied!'); }}
                      className="text-[#00D4FF]">
                      <Copy className="w-4 h-4" />
                    </Button>
                    <Button size="sm" variant="ghost"
                      onClick={() => { setKeyToRevoke(apiKey); setShowRevokeKeyDialog(true); }}
                      className="text-red-400 hover:bg-red-500/10">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>

        {/* ── Audit Log ───────────────────────────────────────────────── */}
        <TabsContent value="audit" className="mt-6">
          <Card className="bg-white/5 backdrop-blur-xl border-[#00D4FF]/20 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold text-white">Audit Log</h3>
              <p className="text-xs text-gray-500">Reads from activityLogs collection (last 50 entries)</p>
            </div>
            {auditLog.length === 0 && <p className="text-gray-500 text-sm">No audit entries yet.</p>}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-white/10 hover:bg-transparent">
                    {['Admin','Action','Details','Timestamp'].map(h => (
                      <TableHead key={h} className="text-gray-400">{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditLog.map(log => (
                    <TableRow key={log.id} className="border-b border-white/10 hover:bg-white/5">
                      <TableCell className="font-medium text-white text-sm">{log.admin}</TableCell>
                      <TableCell className="text-gray-300 text-sm">{log.action}</TableCell>
                      <TableCell className="text-gray-400 text-xs max-w-[200px] truncate">{log.details}</TableCell>
                      <TableCell className="text-gray-300 text-xs">{log.timestamp}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Add Admin Dialog ─────────────────────────────────────────── */}
      <Dialog open={showAddAdminDialog} onOpenChange={setShowAddAdminDialog}>
        <DialogContent className="bg-[#0F1629] border-[#00D4FF]/20 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-white">Add Super Admin</DialogTitle>
            <DialogDescription className="text-gray-400">
              Add a user as super administrator. They must already have an account.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label className="text-gray-300 mb-1 block">Name</Label>
              <Input value={newAdminName} onChange={e => setNewAdminName(e.target.value)}
                placeholder="Full name" className="bg-white/5 border-white/10 text-white" />
            </div>
            <div>
              <Label className="text-gray-300 mb-1 block">Email</Label>
              <Input value={newAdminEmail} onChange={e => setNewAdminEmail(e.target.value)}
                placeholder="admin@example.com" type="email" className="bg-white/5 border-white/10 text-white" />
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setShowAddAdminDialog(false)}
                className="flex-1 border-white/10 text-gray-400">Cancel</Button>
              <Button onClick={handleAddSuperAdmin} disabled={addingAdmin}
                className="flex-1 bg-[#00D4FF] hover:bg-[#00D4FF]/80 text-white">
                {addingAdmin ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}Add
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Remove Admin Dialog ──────────────────────────────────────── */}
      <Dialog open={showRemoveAdminDialog} onOpenChange={setShowRemoveAdminDialog}>
        <DialogContent className="bg-[#0F1629] border-red-500/20 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-white">Remove Super Admin?</DialogTitle>
            <DialogDescription className="text-gray-400">
              Remove <strong className="text-white">{adminToRemove?.name}</strong> from super admin access?
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 pt-4">
            <Button variant="outline" onClick={() => setShowRemoveAdminDialog(false)}
              className="flex-1 border-white/10 text-gray-400">Cancel</Button>
            <Button onClick={handleRemoveAdmin}
              className="flex-1 bg-red-500 hover:bg-red-600 text-white">Remove</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Generate Key Dialog ──────────────────────────────────────── */}
      <Dialog open={showGenKeyDialog} onOpenChange={setShowGenKeyDialog}>
        <DialogContent className="bg-[#0F1629] border-[#00D4FF]/20 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-white">Generate API Key</DialogTitle>
            <DialogDescription className="text-gray-400">Create a new API key for external integrations.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label className="text-gray-300 mb-1 block">Key Name</Label>
              <Input value={newKeyName} onChange={e => setNewKeyName(e.target.value)}
                placeholder="e.g. Production API Key" className="bg-white/5 border-white/10 text-white" />
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setShowGenKeyDialog(false)}
                className="flex-1 border-white/10 text-gray-400">Cancel</Button>
              <Button onClick={handleGenerateApiKey} disabled={generatingKey}
                className="flex-1 bg-[#00D4FF] hover:bg-[#00D4FF]/80 text-white">
                {generatingKey ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}Generate
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Revoke Key Dialog ────────────────────────────────────────── */}
      <Dialog open={showRevokeKeyDialog} onOpenChange={setShowRevokeKeyDialog}>
        <DialogContent className="bg-[#0F1629] border-red-500/20 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-white">Revoke API Key?</DialogTitle>
            <DialogDescription className="text-gray-400">
              Revoke <strong className="text-white">"{keyToRevoke?.name}"</strong>? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 pt-4">
            <Button variant="outline" onClick={() => setShowRevokeKeyDialog(false)}
              className="flex-1 border-white/10 text-gray-400">Cancel</Button>
            <Button onClick={handleRevokeKey}
              className="flex-1 bg-red-500 hover:bg-red-600 text-white">Revoke</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SettingsSection;
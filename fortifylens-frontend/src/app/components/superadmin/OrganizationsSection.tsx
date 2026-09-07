import React, { useEffect, useState } from 'react';
import { Card } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Search, Filter, Eye, Ban, Trash2, Edit, Users, FolderKanban, Activity, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { auth } from '../../../lib/firebase';

const BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
async function saFetch(path: string, opts?: RequestInit) {
  const token = await auth.currentUser?.getIdToken() ?? '';
  const r = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    ...opts,
  });
  return r.json();
}

interface Org {
  id: string; name: string; adminEmail: string; plan: string;
  employeeCount: number; projectCount: number; status: string;
  mrr: number; createdAt: string | null;
}

const getPlanBadge = (plan: string) => ({
  Starter: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
  Business: 'bg-[#00D4FF]/20 text-[#00D4FF] border-[#00D4FF]/30',
  Enterprise: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
}[plan] ?? 'bg-gray-500/20 text-gray-300 border-gray-500/30');

const getStatusBadge = (status: string) =>
  (status === 'active' || status === 'Active')
    ? 'bg-green-500/20 text-green-300 border-green-500/30'
    : 'bg-red-500/20 text-red-300 border-red-500/30';

const OrganizationsSection: React.FC = () => {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPlan, setFilterPlan] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedOrg, setSelectedOrg] = useState<Org | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [orgToDelete, setOrgToDelete] = useState<Org | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const loadOrgs = () => {
    setLoading(true);
    saFetch('/api/superadmin/orgs')
      .then(d => setOrgs(d.orgs ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadOrgs(); }, []);

  const filtered = orgs.filter(o => {
    const q = searchQuery.toLowerCase();
    const matchSearch = o.name.toLowerCase().includes(q) || o.adminEmail.toLowerCase().includes(q);
    const matchPlan = filterPlan === 'all' || o.plan === filterPlan;
    const matchStatus = filterStatus === 'all' ||
      (filterStatus === 'Active' && (o.status === 'active' || o.status === 'Active')) ||
      (filterStatus === 'Suspended' && (o.status === 'suspended' || o.status === 'Suspended'));
    return matchSearch && matchPlan && matchStatus;
  });

  const handleSuspend = async (org: Org) => {
    setActionLoading(true);
    const newStatus = (org.status === 'active' || org.status === 'Active') ? 'suspended' : 'active';
    try {
      await saFetch(`/api/superadmin/orgs/${org.id}/status`, {
        method: 'PATCH', body: JSON.stringify({ status: newStatus }),
      });
      toast.success(`${org.name} ${newStatus === 'suspended' ? 'suspended' : 'reactivated'}`);
      loadOrgs();
      if (selectedOrg?.id === org.id) setSelectedOrg(prev => prev ? { ...prev, status: newStatus } : null);
    } catch { toast.error('Failed to update status'); }
    setActionLoading(false);
  };

  const handleDelete = async () => {
    if (!orgToDelete) return;
    setActionLoading(true);
    try {
      await saFetch(`/api/superadmin/orgs/${orgToDelete.id}`, { method: 'DELETE' });
      toast.success(`${orgToDelete.name} deleted`);
      setShowDeleteDialog(false);
      setShowDetailModal(false);
      setOrgToDelete(null);
      loadOrgs();
    } catch { toast.error('Failed to delete organization'); }
    setActionLoading(false);
  };

  const handleChangePlan = async (org: Org, newPlan: string) => {
    try {
      await saFetch(`/api/superadmin/orgs/${org.id}/plan`, {
        method: 'PATCH', body: JSON.stringify({ plan: newPlan }),
      });
      toast.success(`Plan updated to ${newPlan}`);
      loadOrgs();
      if (selectedOrg?.id === org.id) setSelectedOrg(prev => prev ? { ...prev, plan: newPlan } : null);
    } catch { toast.error('Failed to update plan'); }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-gray-400">
      <Loader2 className="w-6 h-6 animate-spin mr-2" />Loading organizations…
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Organizations</h1>
        <p className="text-gray-400">Manage all organizations on the platform</p>
      </div>

      <Card className="bg-white/5 backdrop-blur-xl border-[#00D4FF]/20 p-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <Input placeholder="Search organizations or admin email…" value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-gray-500" />
          </div>
          <Select value={filterPlan} onValueChange={setFilterPlan}>
            <SelectTrigger className="w-[180px] bg-white/5 border-white/10 text-white">
              <Filter className="w-4 h-4 mr-2" /><SelectValue placeholder="Filter by plan" />
            </SelectTrigger>
            <SelectContent className="bg-[#151D35] border-[#00D4FF]/20">
              <SelectItem value="all" className="text-white">All Plans</SelectItem>
              <SelectItem value="Starter" className="text-white">Starter</SelectItem>
              <SelectItem value="Business" className="text-white">Business</SelectItem>
              <SelectItem value="Enterprise" className="text-white">Enterprise</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[180px] bg-white/5 border-white/10 text-white">
              <Filter className="w-4 h-4 mr-2" /><SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent className="bg-[#151D35] border-[#00D4FF]/20">
              <SelectItem value="all" className="text-white">All Status</SelectItem>
              <SelectItem value="Active" className="text-white">Active</SelectItem>
              <SelectItem value="Suspended" className="text-white">Suspended</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="bg-white/5 backdrop-blur-xl border-[#00D4FF]/20">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-white/10 hover:bg-transparent">
                <TableHead className="text-gray-400">Organization</TableHead>
                <TableHead className="text-gray-400">Admin Email</TableHead>
                <TableHead className="text-gray-400">Plan</TableHead>
                <TableHead className="text-gray-400">Employees</TableHead>
                <TableHead className="text-gray-400">Projects</TableHead>
                <TableHead className="text-gray-400">Join Date</TableHead>
                <TableHead className="text-gray-400">Status</TableHead>
                <TableHead className="text-gray-400">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-gray-500 py-8">No organizations found.</TableCell></TableRow>
              )}
              {filtered.map(org => (
                <TableRow key={org.id} className="border-b border-white/10 hover:bg-white/5 transition-colors">
                  <TableCell className="font-medium text-white">{org.name}</TableCell>
                  <TableCell className="text-gray-300">{org.adminEmail}</TableCell>
                  <TableCell><Badge className={`${getPlanBadge(org.plan)} border`}>{org.plan}</Badge></TableCell>
                  <TableCell className="text-gray-300">{org.employeeCount}</TableCell>
                  <TableCell className="text-gray-300">{org.projectCount}</TableCell>
                  <TableCell className="text-gray-300">{org.createdAt ? new Date(org.createdAt).toLocaleDateString() : '—'}</TableCell>
                  <TableCell><Badge className={`${getStatusBadge(org.status)} border`}>{org.status}</Badge></TableCell>
                  <TableCell>
                    <Button size="sm" variant="ghost" onClick={() => { setSelectedOrg(org); setShowDetailModal(true); }}
                      className="text-[#00D4FF] hover:text-[#00D4FF] hover:bg-[#00D4FF]/10">
                      <Eye className="w-4 h-4 mr-1" />View
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
        <DialogContent className="bg-[#0A0E1A] border-[#00D4FF]/30 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">{selectedOrg?.name}</DialogTitle>
            <DialogDescription className="text-gray-400">Organization details and management</DialogDescription>
          </DialogHeader>
          {selectedOrg && (
            <div className="space-y-5 mt-2">
              <div className="grid grid-cols-2 gap-4">
                {[
                  ['Admin Email', selectedOrg.adminEmail],
                  ['Plan', selectedOrg.plan],
                  ['Status', selectedOrg.status],
                  ['MRR', `$${selectedOrg.mrr}/mo`],
                ].map(([label, val]) => (
                  <div key={label} className="p-3 rounded-lg bg-white/5 border border-white/10">
                    <p className="text-xs text-gray-400 mb-1">{label}</p>
                    <p className="text-white font-medium">{val}</p>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center gap-3">
                  <Users className="w-8 h-8 text-blue-400" />
                  <div><p className="text-2xl font-bold text-white">{selectedOrg.employeeCount}</p><p className="text-sm text-gray-400">Employees</p></div>
                </div>
                <div className="p-4 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center gap-3">
                  <FolderKanban className="w-8 h-8 text-purple-400" />
                  <div><p className="text-2xl font-bold text-white">{selectedOrg.projectCount}</p><p className="text-sm text-gray-400">Projects</p></div>
                </div>
              </div>
              <div className="flex flex-wrap gap-3 pt-2 border-t border-white/10">
                <Select onValueChange={v => handleChangePlan(selectedOrg, v)}>
                  <SelectTrigger className="w-auto bg-[#00D4FF] text-white border-0 hover:bg-[#00D4FF]/80">
                    <Edit className="w-4 h-4 mr-2" /><SelectValue placeholder="Change Plan" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#151D35] border-[#00D4FF]/20">
                    <SelectItem value="Starter" className="text-white">Starter</SelectItem>
                    <SelectItem value="Business" className="text-white">Business</SelectItem>
                    <SelectItem value="Enterprise" className="text-white">Enterprise</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" disabled={actionLoading} onClick={() => handleSuspend(selectedOrg)}
                  className={(selectedOrg.status === 'active' || selectedOrg.status === 'Active')
                    ? 'border-orange-500/30 text-orange-400 hover:bg-orange-500/10'
                    : 'border-green-500/30 text-green-400 hover:bg-green-500/10'}>
                  <Ban className="w-4 h-4 mr-2" />
                  {(selectedOrg.status === 'active' || selectedOrg.status === 'Active') ? 'Suspend' : 'Reactivate'}
                </Button>
                <Button variant="outline" onClick={() => { setOrgToDelete(selectedOrg); setShowDeleteDialog(true); }}
                  className="border-red-500/30 text-red-400 hover:bg-red-500/10">
                  <Trash2 className="w-4 h-4 mr-2" />Delete
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog — no window.confirm */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="bg-[#0F1629] border-red-500/20 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-white">Delete Organization?</DialogTitle>
            <DialogDescription className="text-gray-400">
              This will permanently delete <strong className="text-white">{orgToDelete?.name}</strong>. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 pt-4">
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}
              className="flex-1 border-white/10 text-gray-400">Cancel</Button>
            <Button onClick={handleDelete} disabled={actionLoading}
              className="flex-1 bg-red-500 hover:bg-red-600 text-white">
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OrganizationsSection;
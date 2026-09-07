import React, { useEffect, useState } from 'react';
import { Card } from '../ui/card';
import { Badge } from '../ui/badge';
import { Activity, Zap, CheckCircle, Database, Loader2 } from 'lucide-react';
import { auth } from '../../../lib/firebase';

const BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
async function saFetch(path: string) {
  const token = await auth.currentUser?.getIdToken() ?? '';
  const r = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
  });
  return r.json();
}

const getHeatmapColor = (v: number) => {
  if (v === 0) return 'bg-white/5';
  if (v < 3)   return 'bg-blue-900/40';
  if (v < 6)   return 'bg-blue-600/50';
  if (v < 10)  return 'bg-[#00D4FF]/50';
  return 'bg-green-500/70';
};

const SystemAnalyticsSection: React.FC = () => {
  const [health, setHealth] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [orgs, setOrgs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      saFetch('/api/superadmin/system-health'),
      saFetch('/api/superadmin/stats'),
      saFetch('/api/superadmin/orgs'),
    ]).then(([h, s, o]) => {
      setHealth(h);
      setStats(s.stats);
      setOrgs((o.orgs ?? []).slice(0, 10));
    }).catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-gray-400">
      <Loader2 className="w-6 h-6 animate-spin mr-2" />Loading system analytics…
    </div>
  );

  const memPct = health?.memory?.pct ?? 0;
  const uptimeDays = health?.uptime ? Math.floor(health.uptime / 86400) : 0;
  const uptimeHrs  = health?.uptime ? Math.floor((health.uptime % 86400) / 3600) : 0;

  const healthCards = [
    {
      label: 'DB Response Time',
      value: health?.dbLatencyMs != null ? `${health.dbLatencyMs}ms` : '—',
      status: (health?.dbLatencyMs ?? 0) < 300 ? 'good' : 'degraded',
      statusColor: (health?.dbLatencyMs ?? 0) < 300 ? 'bg-green-500/20 text-green-300 border-green-500/30' : 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
      icon: Zap, color: 'from-green-500 to-green-600',
    },
    {
      label: 'Server Uptime',
      value: `${uptimeDays}d ${uptimeHrs}h`,
      status: 'healthy',
      statusColor: 'bg-green-500/20 text-green-300 border-green-500/30',
      icon: CheckCircle, color: 'from-blue-500 to-blue-600',
    },
    {
      label: 'Memory Usage',
      value: `${memPct}%`,
      status: memPct < 80 ? 'normal' : 'high',
      statusColor: memPct < 80 ? 'bg-green-500/20 text-green-300 border-green-500/30' : 'bg-red-500/20 text-red-300 border-red-500/30',
      icon: Database, color: 'from-purple-500 to-purple-600',
    },
    {
      label: 'Total Scans',
      value: (stats?.totalScans ?? 0).toLocaleString(),
      status: 'platform-wide',
      statusColor: 'bg-[#00D4FF]/20 text-[#00D4FF] border-[#00D4FF]/30',
      icon: Activity, color: 'from-[#00D4FF] to-[#00D4FF]/80',
    },
  ];

  // Simple activity heatmap by org project count (visual indicator)
  const heatmapDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const heatmapHours = ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00'];
  // Deterministic placeholder based on org count
  const total = stats?.totalScans ?? 0;
  const displayGrid = Array.from({ length: 6 }, (_, r) =>
    Array.from({ length: 7 }, (_, c) =>
      total > 0 ? Math.floor(Math.random() * Math.min(total / 4, 15)) : 0
    )
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">System Analytics</h1>
        <p className="text-gray-400">Monitor platform health and usage patterns</p>
      </div>

      {/* Health Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {healthCards.map(m => {
          const Icon = m.icon;
          return (
            <Card key={m.label} className="bg-white/5 backdrop-blur-xl border-[#00D4FF]/20 p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-gray-400 text-sm mb-1">{m.label}</p>
                  <p className="text-3xl font-bold text-white mb-2">{m.value}</p>
                  <Badge className={`${m.statusColor} border text-xs`}>{m.status}</Badge>
                </div>
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${m.color} flex items-center justify-center`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Top Organizations */}
      <Card className="bg-white/5 backdrop-blur-xl border-[#00D4FF]/20 p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Top 10 Organizations by Projects</h3>
        {orgs.length === 0 && <p className="text-gray-500 text-sm">No data available.</p>}
        <div className="space-y-3">
          {orgs.sort((a, b) => (b.projectCount ?? 0) - (a.projectCount ?? 0)).map((org, idx) => (
            <div key={org.id} className="flex items-center justify-between p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
              <div className="flex items-center space-x-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                  idx < 3 ? 'bg-gradient-to-br from-[#00D4FF] to-purple-600 text-white' : 'bg-gray-600/30 text-gray-400'
                }`}>{idx + 1}</div>
                <div>
                  <p className="font-medium text-white">{org.name}</p>
                  <p className="text-xs text-gray-400">{org.employeeCount} employees • {org.plan} plan</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-[#00D4FF]">{org.projectCount}</p>
                <p className="text-xs text-gray-400">projects</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Platform Stats summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          ['Total Orgs', stats?.totalOrgs ?? 0, 'bg-blue-500/10 border-blue-500/20'],
          ['Active Orgs', stats?.activeOrgs ?? 0, 'bg-green-500/10 border-green-500/20'],
          ['Total Projects', stats?.totalProjects ?? 0, 'bg-purple-500/10 border-purple-500/20'],
          ['Open Vulns', stats?.totalVulnerabilities ?? 0, 'bg-red-500/10 border-red-500/20'],
        ].map(([label, value, cls]) => (
          <Card key={label as string} className={`${cls} border p-4 text-center`}>
            <p className="text-2xl font-bold text-white">{(value as number).toLocaleString()}</p>
            <p className="text-sm text-gray-400 mt-1">{label}</p>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default SystemAnalyticsSection;
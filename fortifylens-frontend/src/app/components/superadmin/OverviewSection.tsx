import React, { useEffect, useState } from 'react';
import { Card } from '../ui/card';
import {
  Building2, Users, DollarSign, CheckCircle,
  Activity, AlertTriangle,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { auth } from '../../../lib/firebase';

const BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

async function superadminFetch(path: string) {
  const token = await auth.currentUser?.getIdToken() ?? '';
  const r = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
  });
  return r.json();
}

const fmtTimestamp = (ts: any): string => {
  if (!ts) return '—';
  if (typeof ts === 'string') return new Date(ts).toLocaleString();
  if (ts.toDate) return ts.toDate().toLocaleString();
  if (ts._seconds) return new Date(ts._seconds * 1000).toLocaleString();
  if (ts.seconds) return new Date(ts.seconds * 1000).toLocaleString();
  return String(ts);
};

const fmtNum = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
  : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K`
  : String(n);

const PLAN_COLOR: Record<string, string> = {
  Starter: '#6B7280', Business: '#00D4FF', Enterprise: '#8B5CF6',
};

const OverviewSection: React.FC = () => {
  const [stats, setStats] = useState<any>(null);
  const [signupTrend, setSignupTrend] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    superadminFetch('/api/superadmin/stats')
      .then(data => {
        setStats(data.stats);
        setSignupTrend(data.signupTrend ?? []);
        setActivities(data.recentActivity ?? []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-gray-400">Loading platform overview…</div>
  );

  const s = stats ?? {};
  const planDist = Object.entries(s.planDistribution ?? {}).map(([name, value]) => ({
    name, value: value as number, color: PLAN_COLOR[name] ?? '#6B7280',
  }));

  const kpiCards = [
    { title: 'Total Organizations',  value: fmtNum(s.totalOrgs ?? 0),        sub: `${s.activeOrgs ?? 0} active`,        icon: Building2,     color: 'from-blue-500 to-blue-600' },
    { title: 'Total Users',          value: fmtNum(s.totalUsers ?? 0),        sub: 'across all roles',                    icon: Users,         color: 'from-[#00D4FF] to-[#00D4FF]/80' },
    { title: 'Monthly Revenue',      value: `$${(s.mrr ?? 0).toLocaleString()}`, sub: `ARR: $${((s.mrr ?? 0) * 12).toLocaleString()}`, icon: DollarSign, color: 'from-green-500 to-green-600' },
    { title: 'Active Subscriptions', value: fmtNum(s.activeSubscriptions ?? (s.planDistribution?.Starter ?? 0) + (s.planDistribution?.Business ?? 0) + (s.planDistribution?.Enterprise ?? 0) + (s.planDistribution?.Individual ?? 0)), sub: `Orgs: ${s.activeOrgSubscriptions ?? 0} · Individuals: ${s.activeIndividualUsers ?? 0}`, icon: CheckCircle, color: 'from-purple-500 to-purple-600' },
    { title: 'Total Projects',       value: fmtNum(s.totalProjects ?? 0),     sub: `${s.orgProjects ?? 0} org · ${s.personalProjects ?? 0} personal`, icon: Activity, color: 'from-indigo-500 to-indigo-600' },
    { title: 'Total Scans Run',      value: fmtNum(s.totalScans ?? 0),        sub: `${s.orgScans ?? 0} org · ${s.personalScans ?? 0} personal`, icon: AlertTriangle, color: 'from-red-500 to-red-600' },
  ];

  const scanData = signupTrend.slice(-6).map(({ month }) => ({
    month: month.split(' ')[0],
    scans: Math.floor(Math.random() * 20 + 5), // placeholder — replace with real scan trend when available
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Platform Overview</h1>
        <p className="text-gray-400">Monitor platform-wide metrics and activity</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {kpiCards.map(kpi => {
          const Icon = kpi.icon;
          return (
            <Card key={kpi.title} className="bg-white/5 backdrop-blur-xl border-[#00D4FF]/20 p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-gray-400 text-sm mb-1">{kpi.title}</p>
                  <p className="text-3xl font-bold text-white mb-1">{kpi.value}</p>
                  <p className="text-xs text-gray-500">{kpi.sub}</p>
                </div>
                <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${kpi.color} flex items-center justify-center`}>
                  <Icon className="w-7 h-7 text-white" />
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-white/5 backdrop-blur-xl border-[#00D4FF]/20 p-6">
          <h3 className="text-lg font-semibold text-white mb-4">New Organization Signups (Last 12 Months)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={signupTrend}>
              <defs>
                <linearGradient id="colorSignups" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00D4FF" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#00D4FF" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="month" stroke="#9CA3AF" style={{ fontSize: '11px' }} />
              <YAxis stroke="#9CA3AF" style={{ fontSize: '11px' }} allowDecimals={false} />
              <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #00D4FF', borderRadius: '8px', color: '#fff' }} />
              <Area type="monotone" dataKey="signups" stroke="#00D4FF" fillOpacity={1} fill="url(#colorSignups)" />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        <Card className="bg-white/5 backdrop-blur-xl border-[#00D4FF]/20 p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Plan Distribution</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={planDist} cx="50%" cy="50%" labelLine={false}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                outerRadius={100} dataKey="value">
                {planDist.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #00D4FF', borderRadius: '8px', color: '#fff' }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex justify-center space-x-6 mt-2">
            {planDist.map(p => (
              <div key={p.name} className="flex items-center space-x-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: p.color }} />
                <span className="text-sm text-gray-400">{p.name}: {p.value}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="bg-white/5 backdrop-blur-xl border-[#00D4FF]/20 p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Live Activity Feed</h3>
        <div className="space-y-3 max-h-[300px] overflow-y-auto">
          {activities.length === 0 && <p className="text-gray-500 text-sm">No recent activity.</p>}
          {activities.map((act: any) => (
            <div key={act.id} className="flex items-start space-x-3 p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
              <div className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 mt-2 ${
                act.type === 'warning' ? 'bg-yellow-400' : act.type === 'error' ? 'bg-red-400' : 'bg-green-400'
              }`} />
              <div className="flex-1 min-w-0">
                {/* Fix: activityLogs uses 'action' field not 'message' */}
                <p className="text-sm text-white">{act.action ?? act.message ?? act.type}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {act.userName ?? act.userId ?? '—'} • {fmtTimestamp(act.createdAt)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};

export default OverviewSection;
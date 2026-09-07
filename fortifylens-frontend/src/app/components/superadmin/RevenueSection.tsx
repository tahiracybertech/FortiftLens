import React, { useEffect, useState } from 'react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Switch } from '../ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Banknote, TrendingUp, Calendar, CheckCircle, XCircle, Edit, Plus, Tag, Loader2 } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { collection, onSnapshot, addDoc, deleteDoc, doc, updateDoc, Timestamp } from 'firebase/firestore';
import { db, auth } from '../../../lib/firebase';
import { toast } from 'sonner';

const BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
async function saFetch(path: string) {
  const token = await auth.currentUser?.getIdToken() ?? '';
  const r = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
  });
  return r.json();
}

const PLAN_PRICE: Record<string, number> = { Starter: 500, Business: 1000 };

const RevenueSection: React.FC = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const [revenueData, setRevenueData] = useState<any>({ mrr: 0, annualProjection: 0, monthlyData: [], planDist: {} });
  const [loading, setLoading] = useState(true);
  const [coupons, setCoupons] = useState<any[]>([]);
  const [showCouponDialog, setShowCouponDialog] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [couponDiscount, setCouponDiscount] = useState('');
  const [couponMaxUses, setCouponMaxUses] = useState('100');
  const [creatingCoupon, setCreatingCoupon] = useState(false);

  useEffect(() => {
    saFetch('/api/superadmin/revenue')
      .then(d => setRevenueData(d))
      .catch(console.error)
      .finally(() => setLoading(false));

    const unsub = onSnapshot(collection(db, 'coupons'), snap => {
      setCoupons(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  const handleCreateCoupon = async () => {
    if (!couponCode.trim() || !couponDiscount.trim()) {
      toast.error('Code and discount are required');
      return;
    }
    setCreatingCoupon(true);
    try {
      await addDoc(collection(db, 'coupons'), {
        code: couponCode.toUpperCase().trim(),
        discount: couponDiscount.trim(),
        uses: 0,
        maxUses: parseInt(couponMaxUses, 10) || 100,
        expiresAt: null,
        createdAt: Timestamp.now(),
      });
      toast.success('Coupon created');
      setShowCouponDialog(false);
      setCouponCode(''); setCouponDiscount(''); setCouponMaxUses('100');
    } catch { toast.error('Failed to create coupon'); }
    setCreatingCoupon(false);
  };

  const handleDeleteCoupon = async (id: string, code: string) => {
    try {
      await deleteDoc(doc(db, 'coupons', id));
      toast.success(`Coupon ${code} deleted`);
    } catch { toast.error('Failed to delete coupon'); }
  };

  const planDist = Object.entries(revenueData.planDist ?? {}).map(([name, value]) => ({ name, value }));

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-gray-400">
      <Loader2 className="w-6 h-6 animate-spin mr-2" />Loading revenue data…
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Revenue & Plans</h1>
        <p className="text-gray-400">Monitor revenue metrics and manage subscription plans</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-gradient-to-br from-green-500/20 to-green-600/20 border-green-500/30 p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-gray-300 text-sm mb-2">Monthly Recurring Revenue</p>
              <p className="text-4xl font-bold text-white mb-2">Rs. {(revenueData.mrr ?? 0).toLocaleString()}</p>
              <div className="flex items-center space-x-2 text-green-400">
                <TrendingUp className="w-4 h-4" /><span className="text-sm">Live from Firestore</span>
              </div>
            </div>
            <div className="w-14 h-14 rounded-xl bg-green-500/30 flex items-center justify-center">
              <Banknote className="w-7 h-7 text-green-300" />
            </div>
          </div>
        </Card>
        <Card className="bg-gradient-to-br from-blue-500/20 to-blue-600/20 border-blue-500/30 p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-gray-300 text-sm mb-2">Annual Recurring Revenue</p>
              <p className="text-4xl font-bold text-white mb-2">Rs. {(revenueData.annualProjection ?? 0).toLocaleString()}</p>
              <div className="flex items-center space-x-2 text-blue-400">
                <Calendar className="w-4 h-4" /><span className="text-sm">MRR × 12</span>
              </div>
            </div>
            <div className="w-14 h-14 rounded-xl bg-blue-500/30 flex items-center justify-center">
              <TrendingUp className="w-7 h-7 text-blue-300" />
            </div>
          </div>
        </Card>
      </div>

      <Card className="bg-white/5 backdrop-blur-xl border-[#00D4FF]/20 p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Revenue Trend (Last 7 Months)</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={revenueData.monthlyData ?? []}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="month" stroke="#9CA3AF" style={{ fontSize: '12px' }} />
            <YAxis stroke="#9CA3AF" style={{ fontSize: '12px' }} />
            <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #00D4FF', borderRadius: '8px', color: '#fff' }}
              formatter={(v: number) => `Rs. ${v.toLocaleString()}`} />
            <Line type="monotone" dataKey="revenue" stroke="#00D4FF" strokeWidth={3}
              dot={{ fill: '#00D4FF', r: 5 }} activeDot={{ r: 7 }} />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-white/5 border border-white/10">
          <TabsTrigger value="overview" className="data-[state=active]:bg-[#00D4FF]/20 data-[state=active]:text-[#00D4FF]">Plans</TabsTrigger>
          <TabsTrigger value="coupons" className="data-[state=active]:bg-[#00D4FF]/20 data-[state=active]:text-[#00D4FF]">Coupons</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {['Starter', 'Business'].map(plan => (
              <Card key={plan} className={`bg-white/5 border-[#00D4FF]/20 p-6 ${plan === 'Business' ? 'ring-2 ring-[#00D4FF]/50' : ''}`}>
                <h3 className="text-2xl font-bold text-white mb-2">{plan}</h3>
                <div className="flex items-baseline space-x-2 mb-4">
                  <span className="text-4xl font-bold text-[#00D4FF]">Rs. {PLAN_PRICE[plan].toLocaleString()}</span>
                  <span className="text-gray-400">/month</span>
                </div>
                <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                  <p className="text-sm text-gray-400">Organizations on this plan:</p>
                  <p className="text-2xl font-bold text-white mt-1">
                    {(revenueData.planDist ?? {})[plan] ?? 0}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="coupons" className="mt-6">
          <Card className="bg-white/5 backdrop-blur-xl border-[#00D4FF]/20 p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-semibold text-white">Active Coupons</h3>
              <Button onClick={() => setShowCouponDialog(true)} className="bg-[#00D4FF] hover:bg-[#00D4FF]/80 text-white">
                <Plus className="w-4 h-4 mr-2" />Create Coupon
              </Button>
            </div>
            {coupons.length === 0 && <p className="text-gray-500 text-sm">No coupons found.</p>}
            <div className="space-y-4">
              {coupons.map((c: any) => (
                <div key={c.id} className="p-4 rounded-lg bg-white/5 border border-white/10 flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-[#00D4FF]/20 to-purple-500/20 flex items-center justify-center">
                      <Tag className="w-6 h-6 text-[#00D4FF]" />
                    </div>
                    <div>
                      <p className="font-bold text-white text-lg">{c.code}</p>
                      <p className="text-sm text-gray-400">{c.uses ?? 0}/{c.maxUses ?? 100} uses</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-4">
                    <Badge className="bg-green-500/20 text-green-300 border border-green-500/30 text-lg px-4 py-1">{c.discount}</Badge>
                    <Button size="sm" variant="ghost" onClick={() => handleDeleteCoupon(c.id, c.code)}
                      className="text-red-400 hover:text-red-400 hover:bg-red-500/10">Delete</Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create Coupon Dialog — no window.prompt */}
      <Dialog open={showCouponDialog} onOpenChange={setShowCouponDialog}>
        <DialogContent className="bg-[#0F1629] border-[#00D4FF]/20 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-white">Create Coupon</DialogTitle>
            <DialogDescription className="text-gray-400">Add a new discount coupon to the platform.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-sm text-gray-400 mb-1 block">Coupon Code</label>
              <Input value={couponCode} onChange={e => setCouponCode(e.target.value.toUpperCase())}
                placeholder="e.g. LAUNCH50" className="bg-white/5 border-white/10 text-white uppercase" />
            </div>
            <div>
              <label className="text-sm text-gray-400 mb-1 block">Discount</label>
              <Input value={couponDiscount} onChange={e => setCouponDiscount(e.target.value)}
                placeholder="e.g. 20% or Rs. 100" className="bg-white/5 border-white/10 text-white" />
            </div>
            <div>
              <label className="text-sm text-gray-400 mb-1 block">Max Uses</label>
              <Input type="number" value={couponMaxUses} onChange={e => setCouponMaxUses(e.target.value)}
                placeholder="100" className="bg-white/5 border-white/10 text-white" />
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setShowCouponDialog(false)}
                className="flex-1 border-white/10 text-gray-400">Cancel</Button>
              <Button onClick={handleCreateCoupon} disabled={creatingCoupon}
                className="flex-1 bg-[#00D4FF] hover:bg-[#00D4FF]/80 text-white">
                {creatingCoupon ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Create
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RevenueSection;
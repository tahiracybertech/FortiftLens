import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router';
import { Check, Zap, Building2, Shield, Loader2, ArrowRight, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { auth } from '../../lib/firebase';
import { motion } from 'motion/react';
import { PAGE_FADE } from '../../lib/motionPresets';
import { Reveal, StaggerParent, StaggerChild } from '../components/Reveal';

const BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

const IND_PLANS = [{
  id: 'Individual', name: 'Individual', price: 'Rs. 300', period: '/month',
  desc: 'For solo developers and security researchers',
  features: ['All 5 SDLC analysis phases','AI-powered threat detection','Requirements analysis',
    'STRIDE threat modeling','Code Review (SAST)','Dependency scanning (SCA)',
    'Cross-phase consistency','Unlimited personal projects','PDF report downloads'],
}];

const ORG_PLANS = [
  { id: 'Starter', name: 'Starter', price: 'Rs. 500', period: '/month', popular: false,
    desc: 'Small teams getting started with security',
    features: ['Up to 5 org projects','Up to 5 team members','All 5 SDLC phases',
      'Team & project management','Phase review workflow','Basic PDF reports'] },
  { id: 'Business', name: 'Business', price: 'Rs. 1,000', period: '/month', popular: true,
    desc: 'Growing teams that need unlimited capacity',
    features: ['Unlimited org projects','Unlimited team members','All 5 SDLC phases',
      'AI-powered analysis','Phase review workflow','Vulnerability assignment',
      'Consolidated reports','Priority support'] },
];

export default function Pricing() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user }  = useAuth();
  const [loading, setLoading] = useState<string | null>(null);

  const required  = params.get('required') === 'true';
  const cancelled = params.get('payment') === 'cancelled';
  const userRole  = params.get('role') ?? user?.role;

  const [tab, setTab] = useState<'individual' | 'organization'>(
    userRole === 'org_admin' ? 'organization' : 'individual'
  );

  const pay = async (planId: string, type: 'individual' | 'organization') => {
    if (!user) { navigate('/signup'); return; }
    setLoading(planId);
    try {
      const token = (await auth.currentUser?.getIdToken()) ?? '';
      const ep = type === 'individual'
        ? '/api/payments/create-individual-checkout'
        : '/api/payments/create-checkout-session';
      const r = await fetch(`${BASE}${ep}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ planName: planId }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Failed');
      window.location.href = data.checkoutUrl;
    } catch (e: any) {
      alert(e.message || 'Payment failed. Please try again.');
      setLoading(null);
    }
  };

  return (
    <motion.div {...PAGE_FADE} className="min-h-screen bg-gradient-to-b from-[#0A0E1A] to-[#0F1629] py-20 px-4">

      {required && (
        <div className="max-w-2xl mx-auto mb-8 p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/30 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0" />
          <p className="text-yellow-300 text-sm">A subscription is required to access your dashboard. Choose a plan below.</p>
        </div>
      )}
      {cancelled && (
        <div className="max-w-2xl mx-auto mb-8 p-4 rounded-xl bg-white/5 border border-white/10 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-gray-400 flex-shrink-0" />
          <p className="text-gray-300 text-sm">Payment was cancelled. You can try again below.</p>
        </div>
      )}

      <Reveal className="text-center mb-12">
        <h1 className="text-5xl font-bold text-white mb-4">
          Choose Your <span className="text-[#00D4FF]">Plan</span>
        </h1>
        <p className="text-xl text-gray-300 max-w-xl mx-auto">
          All plans include AI-powered analysis across all 5 security phases.
        </p>
      </Reveal>

      {/* Tab switcher */}
      <div className="flex justify-center mb-10">
        <div className="bg-white/5 border border-white/10 rounded-xl p-1 flex gap-1">
          <button onClick={() => setTab('individual')}
            className={`px-6 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${tab === 'individual' ? 'bg-[#00D4FF] text-[#0A0E1A]' : 'text-gray-400 hover:text-white'}`}>
            <Shield className="w-4 h-4" /> Individual
          </button>
          <button onClick={() => setTab('organization')}
            className={`px-6 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${tab === 'organization' ? 'bg-[#00D4FF] text-[#0A0E1A]' : 'text-gray-400 hover:text-white'}`}>
            <Building2 className="w-4 h-4" /> Organization
          </button>
        </div>
      </div>

      {/* Individual */}
      {tab === 'individual' && (
        <div className="max-w-md mx-auto">
          {IND_PLANS.map(p => (
            <Reveal key={p.id}>
            <div className="cta-card hover-lift p-8 rounded-2xl ring-2 ring-[#00D4FF]/20">
              <div className="flex items-center justify-between mb-2">
                <div className="w-12 h-12 rounded-xl bg-[#00D4FF]/20 flex items-center justify-center">
                  <Shield className="w-6 h-6 text-[#00D4FF]" />
                </div>
                <span className="bg-[#00D4FF] text-[#0A0E1A] text-xs font-bold px-3 py-1 rounded-full">Most Popular</span>
              </div>
              <h3 className="text-2xl font-bold text-white mt-4 mb-1">{p.name}</h3>
              <p className="text-gray-400 text-sm mb-4">{p.desc}</p>
              <div className="flex items-baseline gap-1 mb-6">
                <span className="text-4xl font-bold text-white">{p.price}</span>
                <span className="text-gray-400">{p.period}</span>
              </div>
              <ul className="space-y-3 mb-8">
                {p.features.map(f => (
                  <li key={f} className="flex items-center gap-2 text-gray-300 text-sm">
                    <Check className="w-4 h-4 text-[#00D4FF] flex-shrink-0" />{f}
                  </li>
                ))}
              </ul>
              <button onClick={() => pay(p.id, 'individual')} disabled={!!loading}
                className="w-full h-12 rounded-lg bg-[#00D4FF] text-[#0A0E1A] font-semibold hover:bg-[#00D4FF]/90 disabled:opacity-60 transition-colors flex items-center justify-center gap-2">
                {loading === p.id ? <><Loader2 className="w-5 h-5 animate-spin" />Redirecting…</> : <>Get Started <ArrowRight className="w-5 h-5" /></>}
              </button>
              <p className="text-center text-gray-500 text-xs mt-3">Secure payment via Stripe · Cancel anytime</p>
            </div>
            </Reveal>
          ))}
          <p className="text-center text-gray-500 text-sm mt-6">
            Already have an account? <Link to="/login" className="text-[#00D4FF] hover:underline">Sign in</Link>
          </p>
        </div>
      )}

      {/* Organization */}
      {tab === 'organization' && (
        <StaggerParent className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {ORG_PLANS.map(p => (
            <StaggerChild key={p.id} className="h-full">
            <div className={`hover-lift p-8 rounded-2xl bg-white/5 border-2 relative h-full ${p.popular ? 'cta-card ring-2 ring-[#00D4FF]/20' : 'border-white/10'}`}>
              {p.popular && (
                <div className="absolute -top-3 left-6">
                  <span className="bg-[#00D4FF] text-[#0A0E1A] text-xs font-bold px-3 py-1 rounded-full">Most Popular</span>
                </div>
              )}
              <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center mb-4 mt-2">
                {p.popular ? <Zap className="w-6 h-6 text-[#00D4FF]" /> : <Building2 className="w-6 h-6 text-gray-300" />}
              </div>
              <h3 className="text-2xl font-bold text-white mb-1">{p.name}</h3>
              <p className="text-gray-400 text-sm mb-4">{p.desc}</p>
              <div className="flex items-baseline gap-1 mb-6">
                <span className="text-4xl font-bold text-white">{p.price}</span>
                <span className="text-gray-400">{p.period}</span>
              </div>
              <ul className="space-y-3 mb-8">
                {p.features.map(f => (
                  <li key={f} className="flex items-center gap-2 text-gray-300 text-sm">
                    <Check className="w-4 h-4 text-[#00D4FF] flex-shrink-0" />{f}
                  </li>
                ))}
              </ul>
              <button onClick={() => pay(p.id, 'organization')} disabled={!!loading}
                className={`w-full h-12 rounded-lg font-semibold disabled:opacity-60 transition-colors flex items-center justify-center gap-2 ${p.popular ? 'bg-[#00D4FF] text-[#0A0E1A] hover:bg-[#00D4FF]/90' : 'bg-white/10 text-white hover:bg-white/20'}`}>
                {loading === p.id ? <><Loader2 className="w-5 h-5 animate-spin" />Redirecting…</> : <>{p.popular ? 'Get Business' : 'Get Starter'} <ArrowRight className="w-5 h-5" /></>}
              </button>
              <p className="text-center text-gray-500 text-xs mt-3">Secure payment via Stripe · Cancel anytime</p>
            </div>
            </StaggerChild>
          ))}
          <p className="md:col-span-2 text-center text-gray-500 text-sm mt-2">
            Need Enterprise? <Link to="/contact" className="text-[#00D4FF] hover:underline">Contact us</Link>
          </p>
        </StaggerParent>
      )}
    </motion.div>
  );
}
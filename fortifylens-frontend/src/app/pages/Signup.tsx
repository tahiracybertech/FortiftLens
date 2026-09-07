import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'motion/react';
import { PAGE_FADE } from '../../lib/motionPresets';
import { GradientWord } from '../components/Reveal';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Checkbox } from '../components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  Shield, Building2, Users, Check, Eye, EyeOff, ArrowLeft,
  ChevronRight, CheckCircle2, Mail, Lock, User, Phone, Briefcase, Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import logoImage from '../../assets/logo.png';

type SignupRole = 'individual' | 'organization' | 'employee' | null;

const BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

export default function Signup() {
  const navigate = useNavigate();
  const { signup, loginWithGoogle } = useAuth();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedRole, setSelectedRole] = useState<SignupRole>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [inviteVerified, setInviteVerified] = useState(false);
  const [verifiedOrgName, setVerifiedOrgName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<'google' | 'github' | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<'Starter' | 'Business'>('Business');

  // Escape key: step back through the wizard, or leave to home on step 1
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (step > 1) setStep((prev) => (prev - 1) as 1 | 2 | 3)
      else navigate('/')
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [step, navigate])

  const [formData, setFormData] = useState({
    fullName: '', email: '', password: '', confirmPassword: '',
    orgName: '', industry: '', orgSize: '', phoneNumber: '',
    inviteCode: '', jobTitle: '', department: '',
    agreedToTerms: false,
  });

  const updateFormData = (field: string, value: string | boolean) =>
    setFormData(prev => ({ ...prev, [field]: value }));

  const roleCards = [
    {
      id: 'individual' as SignupRole, icon: Shield,
      title: 'Individual User',
      description: 'Analyze your personal projects and code independently',
      tag: 'Rs. 300/month', tagColor: 'bg-[#00FF88]/20 text-[#00FF88] border-[#00FF88]/30'
    },
    {
      id: 'organization' as SignupRole, icon: Building2,
      title: 'Organization',
      description: 'Register your company and manage your security team',
      tag: 'Starter & Business', tagColor: 'bg-[#7B61FF]/20 text-[#7B61FF] border-[#7B61FF]/30'
    },
    {
      id: 'employee' as SignupRole, icon: Users,
      title: 'Join as Employee',
      description: 'You have an invite code from your organization admin',
      tag: 'Invite required', tagColor: 'bg-[#00D4FF]/20 text-[#00D4FF] border-[#00D4FF]/30'
    }
  ];

  const handleGoogleSignup = async () => {
    setOauthLoading('google');
    try {
      const result = await loginWithGoogle();
      if (!result.success) { toast.error(result.message || 'Google sign-in failed'); return; }
      toast.success('Signed in with Google!');
      const role = result.role;
      if (role === 'superadmin') navigate('/superadmin-dashboard');
      else if (role === 'org_admin') navigate('/admin-dashboard');
      else navigate('/user-dashboard');
    } catch (err: any) {
      toast.error(err?.message || 'Google sign-in failed');
    } finally {
      setOauthLoading(null);
    }
  };

  const handleGithubSignup = async () => {
    setOauthLoading('github');
    try {
      const { GithubAuthProvider, signInWithPopup } = await import('firebase/auth');
      const { auth } = await import('../../lib/firebase');
      const provider = new GithubAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const { createUserProfile, getUserProfile } = await import('../../lib/firebaseService');
      let profile = await getUserProfile(result.user.uid);
      if (!profile) {
        await createUserProfile(result.user.uid, { email: result.user.email || '', fullName: result.user.displayName || '', role: 'user' });
        profile = await getUserProfile(result.user.uid);
      }
      toast.success('Signed in with GitHub!');
      const role = profile?.role;
      if (role === 'superadmin') navigate('/superadmin-dashboard');
      else if (role === 'org_admin') navigate('/admin-dashboard');
      else navigate('/user-dashboard');
    } catch (err: any) {
      if (err?.code === 'auth/account-exists-with-different-credential') toast.error('An account already exists with this email. Use your original sign-in method.');
      else if (err?.code === 'auth/popup-closed-by-user') toast.info('Sign-in cancelled');
      else toast.error(err?.message || 'GitHub sign-in failed');
    } finally {
      setOauthLoading(null);
    }
  };

  const handleVerifyInviteCode = async () => {
    if (formData.inviteCode.length < 6) { toast.error('Enter a valid invite code'); return; }
    try {
      const { api } = await import('../../lib/apiService');
      const result = await api.invitations.verify(formData.inviteCode);
      if (result.valid) {
        setInviteVerified(true);
        setVerifiedOrgName(result.orgName || result.department || 'Your Organization');
        toast.success('Invite code verified!');
      } else {
        toast.error('Invalid or expired invite code');
      }
    } catch { toast.error('Invalid or expired invite code'); }
  };

  // ── Individual / Employee submit ──────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.password !== formData.confirmPassword) { toast.error('Passwords do not match'); return; }
    if (!formData.agreedToTerms) { toast.error('Please agree to the Terms of Service'); return; }

    // Organization → go to payment step (unchanged)
    if (selectedRole === 'organization') { setStep(3); return; }

    // Employee (unchanged)
    if (selectedRole === 'employee' && !inviteVerified) { toast.error('Please verify your invite code first'); return; }

    setIsSubmitting(true);
    try {

      // ── INDIVIDUAL: create account → pay → dashboard ──────────────────────
      if (selectedRole === 'individual') {
        // Step 1: Create Firebase account
        const result = await signup(formData.email, formData.password, formData.fullName, 'user');
        if (!result.success) { toast.error(result.message || 'Failed to create account'); setIsSubmitting(false); return; }

        // Step 2: Sign in to get auth token
        const { signInWithEmailAndPassword } = await import('firebase/auth');
        const { auth } = await import('../../lib/firebase');
        const userCred = await signInWithEmailAndPassword(auth, formData.email, formData.password);
        const token = await userCred.user.getIdToken();

        // Step 3: Create Stripe checkout (same pattern as org)
        const res = await fetch(`${BASE}/api/payments/create-individual-checkout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ planName: 'Individual' }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Checkout failed');

        // Step 4: Redirect to Stripe (same as org)
        toast.success('Account created! Redirecting to secure payment...');
        window.location.href = data.checkoutUrl;
        return;
      }

      // ── EMPLOYEE (unchanged) ──────────────────────────────────────────────
      const result = await signup(formData.email, formData.password, formData.fullName, 'user');
      if (!result.success) { toast.error(result.message || 'Failed to create account'); return; }

      const { signInWithEmailAndPassword } = await import('firebase/auth');
      const { auth } = await import('../../lib/firebase');
      const userCred = await signInWithEmailAndPassword(auth, formData.email, formData.password);
      await userCred.user.getIdToken(true);
      const { api } = await import('../../lib/apiService');
      const acceptResult = await api.invitations.accept(formData.inviteCode);
      const KNOWN_ROLES = ['superadmin', 'org_admin', 'user', 'employee'];
      if (acceptResult?.role && !KNOWN_ROLES.includes(acceptResult.role)) {
        try {
          const { doc, updateDoc } = await import('firebase/firestore');
          const { db } = await import('../../lib/firebase');
          await updateDoc(doc(db, 'users', userCred.user.uid), { role: 'employee' });
        } catch (_) {}
      }
      toast.success('Account created! Please sign in.');
      navigate('/login');

    } catch (err: any) {
      toast.error(err?.message || 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Organization payment submit (unchanged) ───────────────────────────────
  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      // SECURITY FIX: previously called signup(..., 'org_admin'), which
      // tried to write role: 'org_admin' directly via the client SDK —
      // exactly what firestore.rules now (correctly) rejects. Create the
      // profile as a plain 'user' here; POST /api/orgs below promotes it
      // to org_admin server-side via the Admin SDK, which isn't subject
      // to client Firestore rules.
      const result = await signup(formData.email, formData.password, formData.fullName, 'user');
      if (!result.success) { toast.error(result.message || 'Failed to create account'); setIsSubmitting(false); return; }

      const { signInWithEmailAndPassword } = await import('firebase/auth');
      const { auth } = await import('../../lib/firebase');
      const userCred = await signInWithEmailAndPassword(auth, formData.email, formData.password);
      const token = await userCred.user.getIdToken();

      const orgRes = await fetch(`${BASE}/api/orgs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: formData.orgName, industry: formData.industry, orgSize: formData.orgSize, phoneNumber: formData.phoneNumber, adminUid: userCred.user.uid }),
      });
      if (!orgRes.ok) { const e = await orgRes.json(); throw new Error(e.error || 'Failed to create organization'); }

      const freshToken = await userCred.user.getIdToken(true);
      const checkoutRes = await fetch(`${BASE}/api/payments/create-checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${freshToken}` },
        body: JSON.stringify({ planName: selectedPlan }),
      });
      const checkoutData = await checkoutRes.json();
      if (!checkoutRes.ok) throw new Error(checkoutData.error || 'Checkout failed');

      toast.success('Account created! Redirecting to secure payment...');
      window.location.href = checkoutData.checkoutUrl;
    } catch (err: any) {
      toast.error(err.message || 'Something went wrong. Please try again.');
      setIsSubmitting(false);
    }
  };

  const inputCls = "focus-glow h-12 bg-[#0D1117] border-[#1E2D40] text-[#E8EDF5] placeholder:text-[#4A5568]";

  return (
    <motion.div {...PAGE_FADE} className="min-h-screen bg-[#0A0E1A] relative overflow-hidden">
      <div className="fixed inset-0 opacity-[0.03] pointer-events-none"
        style={{ backgroundImage: `linear-gradient(#00D4FF 1px, transparent 1px), linear-gradient(90deg, #00D4FF 1px, transparent 1px)`, backgroundSize: '50px 50px' }} />

      {/* one soft radial wash + one dot field — the page's only ambient decoration */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="auth-glow absolute -top-56 left-1/2 h-[42rem] w-[42rem] -translate-x-1/2" />
        <div className="dot-wave absolute -bottom-40 -right-24 h-[26rem] w-[26rem] opacity-[0.14]" />
      </div>

      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <button onClick={() => navigate('/')} aria-label="Go to home" className="cursor-pointer">
              <img src={logoImage} alt="FortifyLens" className="w-16 h-16 rounded-2xl object-contain drop-shadow-[0_0_15px_rgba(0,212,255,0.5)]" />
            </button>
            <div>
              <h1 className="text-3xl font-bold text-[#E8EDF5]">Fortify<GradientWord>Lens</GradientWord></h1>
              <p className="text-sm text-[#00D4FF]">Secure SDLC Platform</p>
            </div>
          </div>
          <div className="flex items-center justify-center gap-2 mb-1">
            {[1,2,3].map(s => <div key={s} className={`w-2 h-2 rounded-full transition-colors ${step >= s ? 'bg-[#00D4FF]' : 'bg-[#1E2D40]'}`} />)}
          </div>
          <p className="text-[#8892A4] text-sm">
            Step {step} of 3: {step === 1 ? 'Choose Account Type' : step === 2 ? 'Account Details' : 'Payment'}
          </p>
        </motion.div>

        <AnimatePresence mode="wait">
          {/* STEP 1 */}
          {step === 1 && (
            <motion.div key="step1" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="w-full max-w-[720px]">
              <h2 className="text-2xl font-semibold text-[#E8EDF5] text-center mb-2">Get Started with FortifyLens</h2>
              <p className="text-[#8892A4] text-center mb-8">Choose how you'd like to join our platform</p>
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: 'easeOut' }}>
              <div className="grid md:grid-cols-3 gap-6">
                {roleCards.map(card => {
                  const Icon = card.icon;
                  const isSelected = selectedRole === card.id;
                  return (
                    <motion.div key={card.id} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                      onClick={() => { setSelectedRole(card.id); setTimeout(() => setStep(2), 300); }}
                      className="cursor-pointer">
                      <Card className={`relative p-6 bg-[#111827] border transition-all h-full ${isSelected ? 'border-[#00D4FF] shadow-[0_0_20px_rgba(0,212,255,0.3)]' : 'border-[#1E2D40] hover:border-[#00D4FF]/50'}`}>
                        {isSelected && (
                          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute top-4 right-4 w-6 h-6 bg-[#00D4FF] rounded-full flex items-center justify-center">
                            <Check className="w-4 h-4 text-[#0A0E1A]" />
                          </motion.div>
                        )}
                        <div className={`w-14 h-14 rounded-xl flex items-center justify-center mb-4 ${isSelected ? 'bg-[#00D4FF]/20' : 'bg-[#1A2235]'}`}>
                          <Icon className={`w-7 h-7 ${isSelected ? 'text-[#00D4FF]' : 'text-[#8892A4]'}`} />
                        </div>
                        <h3 className="text-lg font-semibold text-[#E8EDF5] mb-2">{card.title}</h3>
                        <p className="text-[#8892A4] text-sm mb-4 min-h-[40px]">{card.description}</p>
                        <div className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${card.tagColor}`}>{card.tag}</div>
                      </Card>
                    </motion.div>
                  );
                })}
              </div>
              </motion.div>
              <div className="text-center mt-8">
                <p className="text-[#8892A4] text-sm">Already have an account?{' '}
                  <button onClick={() => navigate('/login')} className="text-[#00D4FF] hover:underline font-medium">Sign In</button>
                </p>
              </div>
            </motion.div>
          )}

          {/* STEP 2 */}
          {step === 2 && (
            <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="w-full max-w-[480px]">
              <button onClick={() => setStep(1)} className="flex items-center gap-2 text-[#8892A4] hover:text-[#00D4FF] transition-colors mb-6">
                <ArrowLeft className="w-4 h-4" /><span className="text-sm">Back to role selection</span>
              </button>
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: 'easeOut' }}>
              <Card className="p-8 bg-[#111827] border-[#1E2D40]">
                <h2 className="text-2xl font-semibold text-[#E8EDF5] mb-6">
                  {selectedRole === 'individual' && 'Create Individual Account'}
                  {selectedRole === 'organization' && 'Register Your Organization'}
                  {selectedRole === 'employee' && 'Join Organization'}
                </h2>

                {/* Individual plan info box */}
                {selectedRole === 'individual' && (
                  <div className="flex items-center gap-3 p-4 mb-5 bg-[#00D4FF]/5 border border-[#00D4FF]/20 rounded-lg">
                    <Shield className="w-5 h-5 text-[#00D4FF] flex-shrink-0" />
                    <div>
                      <p className="text-[#E8EDF5] text-sm font-medium">Individual Plan — Rs. 300/month</p>
                      <p className="text-[#8892A4] text-xs">All 5 SDLC phases · AI analysis · Unlimited projects</p>
                    </div>
                  </div>
                )}

                {/* OAuth — Individual only */}
                {selectedRole === 'individual' && (
                  <>
                    <div className="grid grid-cols-2 gap-3 mb-5">
                      <Button type="button" variant="outline" disabled={!!oauthLoading} onClick={handleGoogleSignup}
                        className="h-12 bg-[#0D1117] border-[#1E2D40] text-[#E8EDF5] hover:bg-[#1A2235] hover:border-[#00D4FF]/50 transition-all">
                        {oauthLoading === 'google' ? <Loader2 className="w-5 h-5 animate-spin" />
                          : <><svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                            </svg>Google</>}
                      </Button>
                      <Button type="button" variant="outline" disabled={!!oauthLoading} onClick={handleGithubSignup}
                        className="h-12 bg-[#0D1117] border-[#1E2D40] text-[#E8EDF5] hover:bg-[#1A2235] hover:border-[#00D4FF]/50 transition-all">
                        {oauthLoading === 'github' ? <Loader2 className="w-5 h-5 animate-spin" />
                          : <><svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 24 24">
                              <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd"/>
                            </svg>GitHub</>}
                      </Button>
                    </div>
                    <div className="relative mb-5">
                      <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-[#1E2D40]" /></div>
                      <div className="relative flex justify-center text-sm">
                        <span className="px-4 bg-[#111827] text-[#8892A4]">or sign up with email</span>
                      </div>
                    </div>
                  </>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                  {/* INDIVIDUAL */}
                  {selectedRole === 'individual' && (
                    <>
                      <div><Label className="text-[#E8EDF5] mb-2 block">Full Name</Label>
                        <div className="relative"><User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#4A5568]" />
                          <Input value={formData.fullName} onChange={e => updateFormData('fullName', e.target.value)} placeholder="John Doe" className={`${inputCls} pl-11`} required /></div></div>
                      <div><Label className="text-[#E8EDF5] mb-2 block">Email Address</Label>
                        <div className="relative"><Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#4A5568]" />
                          <Input type="email" value={formData.email} onChange={e => updateFormData('email', e.target.value)} placeholder="you@example.com" className={`${inputCls} pl-11`} required /></div></div>
                      <div><Label className="text-[#E8EDF5] mb-2 block">Password</Label>
                        <div className="relative"><Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#4A5568]" />
                          <Input type={showPassword ? 'text' : 'password'} value={formData.password} onChange={e => updateFormData('password', e.target.value)} placeholder="Create a strong password" className={`${inputCls} pl-11 pr-11`} required />
                          <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#4A5568] hover:text-[#00D4FF]">{showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}</button></div></div>
                      <div><Label className="text-[#E8EDF5] mb-2 block">Confirm Password</Label>
                        <div className="relative"><Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#4A5568]" />
                          <Input type={showConfirmPassword ? 'text' : 'password'} value={formData.confirmPassword} onChange={e => updateFormData('confirmPassword', e.target.value)} placeholder="Re-enter your password" className={`${inputCls} pl-11 pr-11`} required />
                          <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#4A5568] hover:text-[#00D4FF]">{showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}</button></div></div>
                    </>
                  )}

                  {/* ORGANIZATION */}
                  {selectedRole === 'organization' && (
                    <>
                      <div><Label className="text-[#E8EDF5] mb-2 block">Organization Name</Label>
                        <div className="relative"><Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#4A5568]" />
                          <Input value={formData.orgName} onChange={e => updateFormData('orgName', e.target.value)} placeholder="Your Company Name" className={`${inputCls} pl-11`} required /></div></div>
                      <div className="grid grid-cols-2 gap-4">
                        <div><Label className="text-[#E8EDF5] mb-2 block">Industry</Label>
                          <Select value={formData.industry} onValueChange={v => updateFormData('industry', v)}>
                            <SelectTrigger className="focus-glow h-12 bg-[#0D1117] border-[#1E2D40] text-[#E8EDF5]"><SelectValue placeholder="Select industry" /></SelectTrigger>
                            <SelectContent className="bg-[#1A2235] border-[#1E2D40]">
                              {['FinTech','HealthTech','E-Commerce','SaaS','Government','Defense','Education','Other'].map(i => <SelectItem key={i} value={i.toLowerCase()} className="text-[#E8EDF5]">{i}</SelectItem>)}
                            </SelectContent>
                          </Select></div>
                        <div><Label className="text-[#E8EDF5] mb-2 block">Organization Size</Label>
                          <Select value={formData.orgSize} onValueChange={v => updateFormData('orgSize', v)}>
                            <SelectTrigger className="focus-glow h-12 bg-[#0D1117] border-[#1E2D40] text-[#E8EDF5]"><SelectValue placeholder="Select size" /></SelectTrigger>
                            <SelectContent className="bg-[#1A2235] border-[#1E2D40]">
                              {['1-10','11-50','51-200','201-500','500+'].map(s => <SelectItem key={s} value={s} className="text-[#E8EDF5]">{s}</SelectItem>)}
                            </SelectContent>
                          </Select></div>
                      </div>
                      <div><Label className="text-[#E8EDF5] mb-2 block">Your Full Name</Label>
                        <div className="relative"><User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#4A5568]" />
                          <Input value={formData.fullName} onChange={e => updateFormData('fullName', e.target.value)} placeholder="Admin name" className={`${inputCls} pl-11`} required /></div>
                        <p className="text-xs text-[#4A5568] mt-1">You will be the organization administrator</p></div>
                      <div><Label className="text-[#E8EDF5] mb-2 block">Work Email</Label>
                        <div className="relative"><Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#4A5568]" />
                          <Input type="email" value={formData.email} onChange={e => updateFormData('email', e.target.value)} placeholder="admin@company.com" className={`${inputCls} pl-11`} required /></div></div>
                      <div><Label className="text-[#E8EDF5] mb-2 block">Password</Label>
                        <div className="relative"><Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#4A5568]" />
                          <Input type={showPassword ? 'text' : 'password'} value={formData.password} onChange={e => updateFormData('password', e.target.value)} placeholder="Create a strong password" className={`${inputCls} pl-11 pr-11`} required />
                          <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#4A5568] hover:text-[#00D4FF]">{showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}</button></div></div>
                      <div><Label className="text-[#E8EDF5] mb-2 block">Confirm Password</Label>
                        <div className="relative"><Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#4A5568]" />
                          <Input type={showConfirmPassword ? 'text' : 'password'} value={formData.confirmPassword} onChange={e => updateFormData('confirmPassword', e.target.value)} placeholder="Re-enter your password" className={`${inputCls} pl-11 pr-11`} required />
                          <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#4A5568] hover:text-[#00D4FF]">{showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}</button></div></div>
                      <div><Label className="text-[#E8EDF5] mb-2 block">Phone Number <span className="text-[#4A5568]">(Optional)</span></Label>
                        <div className="relative"><Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#4A5568]" />
                          <Input type="tel" value={formData.phoneNumber} onChange={e => updateFormData('phoneNumber', e.target.value)} placeholder="+92 300 0000000" className={`${inputCls} pl-11`} /></div></div>
                    </>
                  )}

                  {/* EMPLOYEE */}
                  {selectedRole === 'employee' && (
                    <>
                      <div><Label className="text-[#E8EDF5] mb-2 block">Invite Code</Label>
                        <div className="flex gap-2">
                          <Input value={formData.inviteCode} onChange={e => updateFormData('inviteCode', e.target.value.toUpperCase())} placeholder="ABCD1234" maxLength={8} className={`${inputCls} font-mono text-lg tracking-wider`} required />
                          <Button type="button" onClick={handleVerifyInviteCode} disabled={inviteVerified || formData.inviteCode.length < 6} className="px-6 bg-[#00D4FF] hover:bg-[#00D4FF]/90 text-[#0A0E1A] font-medium disabled:opacity-50">
                            {inviteVerified ? <CheckCircle2 className="w-5 h-5" /> : 'Verify'}
                          </Button>
                        </div>
                        {inviteVerified && (
                          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2 mt-2 px-3 py-2 bg-[#00FF88]/10 border border-[#00FF88]/30 rounded-lg">
                            <CheckCircle2 className="w-4 h-4 text-[#00FF88]" />
                            <span className="text-sm text-[#00FF88]">Joining: {verifiedOrgName}</span>
                          </motion.div>
                        )}
                      </div>
                      {inviteVerified && (
                        <>
                          {[{ label: 'Full Name', field: 'fullName', placeholder: 'John Doe', icon: User }, { label: 'Work Email', field: 'email', placeholder: 'you@company.com', icon: Mail, type: 'email' }].map(({ label, field, placeholder, icon: Icon, type }) => (
                            <div key={field}><Label className="text-[#E8EDF5] mb-2 block">{label}</Label>
                              <div className="relative"><Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#4A5568]" />
                                <Input type={type ?? 'text'} value={(formData as any)[field]} onChange={e => updateFormData(field, e.target.value)} placeholder={placeholder} className={`${inputCls} pl-11`} required /></div></div>
                          ))}
                          <div><Label className="text-[#E8EDF5] mb-2 block">Password</Label>
                            <div className="relative"><Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#4A5568]" />
                              <Input type={showPassword ? 'text' : 'password'} value={formData.password} onChange={e => updateFormData('password', e.target.value)} placeholder="Create a strong password" className={`${inputCls} pl-11 pr-11`} required />
                              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#4A5568] hover:text-[#00D4FF]">{showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}</button></div></div>
                          <div><Label className="text-[#E8EDF5] mb-2 block">Confirm Password</Label>
                            <div className="relative"><Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#4A5568]" />
                              <Input type={showConfirmPassword ? 'text' : 'password'} value={formData.confirmPassword} onChange={e => updateFormData('confirmPassword', e.target.value)} placeholder="Re-enter your password" className={`${inputCls} pl-11 pr-11`} required />
                              <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#4A5568] hover:text-[#00D4FF]">{showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}</button></div></div>
                          <div><Label className="text-[#E8EDF5] mb-2 block">Job Title</Label>
                            <div className="relative"><Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#4A5568]" />
                              <Input value={formData.jobTitle} onChange={e => updateFormData('jobTitle', e.target.value)} placeholder="Senior Security Engineer" className={`${inputCls} pl-11`} required /></div></div>
                          <div><Label className="text-[#E8EDF5] mb-2 block">Department</Label>
                            <Select value={formData.department} onValueChange={v => updateFormData('department', v)}>
                              <SelectTrigger className="focus-glow h-12 bg-[#0D1117] border-[#1E2D40] text-[#E8EDF5]"><SelectValue placeholder="Select department" /></SelectTrigger>
                              <SelectContent className="bg-[#1A2235] border-[#1E2D40]">
                                {['Engineering','DevOps','Security','QA','Management','Other'].map(d => <SelectItem key={d} value={d.toLowerCase()} className="text-[#E8EDF5]">{d}</SelectItem>)}
                              </SelectContent>
                            </Select></div>
                        </>
                      )}
                    </>
                  )}

                  {(selectedRole !== 'employee' || inviteVerified) && (
                    <div className="flex items-start gap-3">
                      <Checkbox id="terms" checked={formData.agreedToTerms} onCheckedChange={c => updateFormData('agreedToTerms', !!c)}
                        className="mt-1 border-[#1E2D40] data-[state=checked]:bg-[#00D4FF] data-[state=checked]:border-[#00D4FF]" />
                      <label htmlFor="terms" className="text-sm text-[#8892A4] cursor-pointer">
                        I agree to the <a href="/terms" className="text-[#00D4FF] hover:underline">Terms of Service</a> and <a href="/privacy" className="text-[#00D4FF] hover:underline">Privacy Policy</a>
                      </label>
                    </div>
                  )}

                  {(selectedRole !== 'employee' || inviteVerified) && (
                    <Button type="submit" disabled={isSubmitting}
                      className="w-full h-12 bg-[#00D4FF] hover:bg-[#00D4FF]/90 text-[#0A0E1A] font-semibold shadow-[0_0_20px_rgba(0,212,255,0.4)] disabled:opacity-60">
                      {isSubmitting
                        ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" />Creating Account...</>
                        : <>{selectedRole === 'individual' && 'Create Account & Pay'}{selectedRole === 'organization' && 'Continue to Payment'}{selectedRole === 'employee' && 'Join Organization'}<ChevronRight className="w-5 h-5 ml-2" /></>}
                    </Button>
                  )}
                </form>

                <div className="mt-6 text-center">
                  <p className="text-[#8892A4] text-sm">Already have an account?{' '}
                    <button onClick={() => navigate('/login')} className="text-[#00D4FF] hover:underline font-medium">Sign In</button>
                  </p>
                </div>
              </Card>
              </motion.div>
            </motion.div>
          )}

          {/* STEP 3 — Org payment only (unchanged) */}
          {step === 3 && (
            <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="w-full max-w-[480px]">
              <button onClick={() => setStep(2)} className="flex items-center gap-2 text-[#8892A4] hover:text-[#00D4FF] transition-colors mb-6">
                <ArrowLeft className="w-4 h-4" /><span className="text-sm">Back to account details</span>
              </button>
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: 'easeOut' }}>
              <Card className="p-8 bg-[#111827] border-[#1E2D40]">
                <h2 className="text-2xl font-semibold text-[#E8EDF5] mb-2">Choose Your Plan</h2>
                <p className="text-[#8892A4] text-sm mb-6">Select a plan to activate your organization</p>
                <form onSubmit={handlePaymentSubmit} className="space-y-4">
                  {[
                    { id: 'Starter' as const, price: 'Rs. 500', features: '5 projects · 5 team members · Basic reports', badge: null },
                    { id: 'Business' as const, price: 'Rs. 1,000', features: 'Unlimited projects · AI analysis · Priority support', badge: 'Most Popular' },
                  ].map(plan => (
                    <button key={plan.id} type="button" onClick={() => setSelectedPlan(plan.id)}
                      className={`w-full p-4 rounded-xl border-2 text-left transition-all relative ${selectedPlan === plan.id ? 'border-[#00D4FF] bg-[#00D4FF]/10' : 'border-[#1E2D40] bg-[#0D1117] hover:border-[#00D4FF]/40'}`}>
                      {plan.badge && <div className="absolute -top-2.5 left-4"><span className="bg-[#00D4FF] text-[#0A0E1A] text-xs font-bold px-2 py-0.5 rounded-full">{plan.badge}</span></div>}
                      <div className="flex items-center justify-between mt-1">
                        <div className="flex items-center gap-3">
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selectedPlan === plan.id ? 'border-[#00D4FF]' : 'border-[#4A5568]'}`}>
                            {selectedPlan === plan.id && <div className="w-2.5 h-2.5 rounded-full bg-[#00D4FF]" />}
                          </div>
                          <div><p className="text-[#E8EDF5] font-semibold">{plan.id}</p><p className="text-[#8892A4] text-xs mt-0.5">{plan.features}</p></div>
                        </div>
                        <div className="text-right"><p className="text-[#E8EDF5] font-bold text-lg">{plan.price}</p><p className="text-[#8892A4] text-xs">/month</p></div>
                      </div>
                    </button>
                  ))}
                  <div className="flex items-start gap-3 p-4 bg-[#00D4FF]/5 border border-[#00D4FF]/20 rounded-lg">
                    <Shield className="w-5 h-5 text-[#00D4FF] mt-0.5 flex-shrink-0" />
                    <div><p className="text-[#E8EDF5] text-sm font-medium mb-1">Secure Payment via Stripe</p>
                      <p className="text-[#8892A4] text-xs">You will be redirected to Stripe's secure checkout. Card details never stored on our servers.</p></div>
                  </div>
                  <Button type="submit" disabled={isSubmitting}
                    className="w-full h-12 bg-[#00D4FF] hover:bg-[#00D4FF]/90 text-[#0A0E1A] font-semibold shadow-[0_0_20px_rgba(0,212,255,0.4)] disabled:opacity-60">
                    {isSubmitting ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" />Setting up account...</> : <><CheckCircle2 className="w-5 h-5 mr-2" />Proceed to Secure Payment →</>}
                  </Button>
                </form>
              </Card>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="text-center mt-8">
          <p className="text-[#4A5568] text-sm">© 2026 FortifyLens. All rights reserved.</p>
        </motion.div>
      </div>
    </motion.div>
  );
}
import { useEffect, useState } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router';
import { XCircle, Loader2, ArrowRight } from 'lucide-react';
import { motion } from 'motion/react';
import { auth } from '../../lib/firebase';
import { Reveal } from '../components/Reveal';

const BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

export default function PaymentSuccess() {
  const [params]    = useSearchParams();
  const navigate    = useNavigate();
  const sessionId   = params.get('session_id');
  const type        = params.get('type'); // 'individual' | 'org'

  const [status,   setStatus]   = useState<'loading' | 'paid' | 'unpaid' | 'error'>('loading');
  const [planName, setPlanName] = useState('');
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    async function verify() {
      if (!sessionId) { setStatus('error'); return; }
      // Wait for Firebase auth to initialise (up to 5 s)
      let token = '';
      for (let i = 0; i < 10; i++) {
        if (auth.currentUser) { token = await auth.currentUser.getIdToken(); break; }
        await new Promise(r => setTimeout(r, 500));
      }
      if (!token) { setStatus('error'); return; }
      try {
        const r = await fetch(`${BASE}/api/payments/verify/${sessionId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        setPlanName(data.planName || '');
        setStatus(data.paymentStatus === 'paid' ? 'paid' : 'unpaid');
      } catch { setStatus('error'); }
    }
    verify();
  }, [sessionId]);

  // Auto-redirect 5 s after confirmed
  useEffect(() => {
    if (status !== 'paid') return;
    const t = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          clearInterval(t);
          auth.currentUser?.getIdToken(true).then(() => {
            navigate(type === 'individual' ? '/user-dashboard' : '/admin-dashboard', { replace: true });
          }).catch(() => navigate('/login', { replace: true }));
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [status, type, navigate]);

  const dest = type === 'individual' ? '/user-dashboard' : '/admin-dashboard';

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0A0E1A] to-[#0F1629] flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-6">

        {status === 'loading' && (
          <>
            <Loader2 className="w-16 h-16 text-[#00D4FF] mx-auto animate-spin" />
            <h1 className="text-2xl font-bold text-white">Confirming payment…</h1>
            <p className="text-gray-400">This only takes a moment.</p>
          </>
        )}

        {status === 'paid' && (
          <>
            {/* drawn success mark — ring first, then the check; once, 0.6s easeOut */}
            <motion.svg
              viewBox="0 0 96 96"
              fill="none"
              aria-hidden="true"
              className="mx-auto h-24 w-24"
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            >
              <motion.circle
                cx="48" cy="48" r="43"
                stroke="var(--circuit-teal)" strokeWidth="2"
                strokeLinecap="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              />
              <motion.path
                d="M31 49.5 L43.5 62 L66 35.5"
                stroke="var(--primary)" strokeWidth="4"
                strokeLinecap="round" strokeLinejoin="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.6, ease: 'easeOut', delay: 0.25 }}
              />
            </motion.svg>
            <h1 className="text-3xl font-bold text-white">Payment Successful! 🎉</h1>
            <p className="text-gray-300">
              Your <span className="text-[#00D4FF] font-semibold">{planName}</span> plan is now active.
            </p>
            <Reveal delay={0.3}>
              <div className="p-4 rounded-xl bg-[#00D4FF]/10 border border-[#00D4FF]/20">
                <p className="text-[#00D4FF] text-sm">
                  Redirecting to your dashboard in <strong>{countdown}s</strong>…
                </p>
              </div>
            </Reveal>
            <Link to={dest}
              className="inline-flex items-center justify-center w-full h-12 rounded-lg bg-[#00D4FF] text-[#0A0E1A] font-semibold hover:bg-[#00D4FF]/90 transition-colors">
              Go to Dashboard <ArrowRight className="w-5 h-5 ml-2" />
            </Link>
          </>
        )}

        {status === 'unpaid' && (
          <>
            <XCircle className="w-16 h-16 text-yellow-500 mx-auto" />
            <h1 className="text-2xl font-bold text-white">Payment Not Completed</h1>
            <p className="text-gray-400">The payment did not go through.</p>
            <Link to="/pricing"
              className="inline-flex items-center justify-center w-full h-12 rounded-lg border border-[#00D4FF]/50 text-[#00D4FF] hover:bg-[#00D4FF]/10 transition-colors">
              Try Again
            </Link>
          </>
        )}

        {status === 'error' && (
          <>
            <XCircle className="w-16 h-16 text-red-500 mx-auto" />
            <h1 className="text-2xl font-bold text-white">Something Went Wrong</h1>
            <p className="text-gray-400">Could not verify your payment. If you were charged, please contact support.</p>
            <div className="flex gap-3">
              <Link to="/contact"
                className="flex-1 inline-flex items-center justify-center h-12 rounded-lg border border-[#00D4FF]/50 text-[#00D4FF] hover:bg-[#00D4FF]/10 transition-colors">
                Contact Support
              </Link>
              <Link to="/pricing"
                className="flex-1 inline-flex items-center justify-center h-12 rounded-lg bg-[#00D4FF] text-[#0A0E1A] font-semibold hover:bg-[#00D4FF]/90 transition-colors">
                Try Again
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
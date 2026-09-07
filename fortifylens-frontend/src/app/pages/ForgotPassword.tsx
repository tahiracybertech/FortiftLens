import { useState } from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'motion/react';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Mail, ArrowLeft, CheckCircle2, Lock, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { GradientWord } from '../components/Reveal';
import logoImage from '../../assets/logo.png';

type Step = 'email' | 'check-email' | 'reset-password';

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSendResetLink = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    // Mock API call
    setTimeout(() => {
      setIsSubmitting(false);
      setStep('check-email');
      toast.success('Reset link sent to your email');
    }, 1500);
  };

  const handleResetPassword = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }

    setIsSubmitting(true);
    
    // Mock API call
    setTimeout(() => {
      setIsSubmitting(false);
      toast.success('Password reset successfully!');
      navigate('/login');
    }, 1500);
  };

  const handleResendLink = () => {
    toast.success('Reset link sent again');
  };

  // Animated background dots
  const BackgroundDots = () => (
    <div className="fixed inset-0 overflow-hidden pointer-events-none">
      <div className="absolute inset-0 opacity-[0.02]">
        {[...Array(40)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 bg-[#00D4FF] rounded-full"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
            }}
            animate={{
              y: [0, -30, 0],
              opacity: [0.3, 0.8, 0.3],
            }}
            transition={{
              duration: 3 + Math.random() * 2,
              repeat: Infinity,
              delay: Math.random() * 2,
            }}
          />
        ))}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0A0E1A] relative overflow-hidden">
      <BackgroundDots />

      {/* one soft radial wash + one dot field — the page's only ambient decoration */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="auth-glow absolute -top-48 left-1/2 h-[38rem] w-[38rem] -translate-x-1/2" />
        <div className="dot-wave absolute -bottom-32 -right-24 h-96 w-96 opacity-[0.14]" />
      </div>
      
      {/* Grid pattern overlay */}
      <div className="fixed inset-0 opacity-[0.03] pointer-events-none">
        <div 
          className="w-full h-full" 
          style={{
            backgroundImage: `linear-gradient(#00D4FF 1px, transparent 1px), linear-gradient(90deg, #00D4FF 1px, transparent 1px)`,
            backgroundSize: '50px 50px'
          }}
        />
      </div>

      <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-[440px]">
          {/* Logo and Header */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-8"
          >
            <div className="flex items-center justify-center gap-3 mb-6">
              <img src={logoImage} alt="FortifyLens Logo" className="w-14 h-14" />
              <div>
                <h1 className="text-3xl font-bold text-[#E8EDF5]" style={{ fontFamily: 'var(--font-display)' }}>
                  Fortify<GradientWord>Lens</GradientWord>
                </h1>
                <p className="text-sm text-[#00D4FF]">Secure SDLC Platform</p>
              </div>
            </div>
          </motion.div>

          {/* Back Button */}
          {step === 'email' && (
            <button
              onClick={() => navigate('/login')}
              className="flex items-center gap-2 text-[#8892A4] hover:text-[#00D4FF] transition-colors mb-6"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm">Back to login</span>
            </button>
          )}

          {/* Content Card */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut', delay: 0.15 }}
          >
            <Card className="p-8 bg-[#111827] border-[#1E2D40]">
              {/* STEP 1: Enter Email */}
              {step === 'email' && (
                <>
                  <h2 className="text-2xl font-semibold text-[#E8EDF5] mb-2">Reset Your Password</h2>
                  <p className="text-[#8892A4] mb-6">
                    Enter your email address and we'll send you a link to reset your password.
                  </p>

                  <form onSubmit={handleSendResetLink} className="space-y-5">
                    <div>
                      <Label htmlFor="email" className="text-[#E8EDF5] mb-2">Email Address</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#4A5568]" />
                        <Input
                          id="email"
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="Enter your email"
                          className="focus-glow h-12 bg-[#0D1117] border-[#1E2D40] text-[#E8EDF5] pl-11 placeholder:text-[#4A5568]"
                          required
                        />
                      </div>
                    </div>

                    <Button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full h-12 bg-[#00D4FF] hover:bg-[#00D4FF]/90 text-[#0A0E1A] font-semibold shadow-[0_0_20px_rgba(0,212,255,0.4)] hover:shadow-[0_0_30px_rgba(0,212,255,0.6)] transition-all disabled:opacity-50"
                    >
                      {isSubmitting ? (
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-5 h-5 border-2 border-[#0A0E1A]/20 border-t-[#0A0E1A] rounded-full animate-spin" />
                          <span>Sending...</span>
                        </div>
                      ) : (
                        'Send Reset Link'
                      )}
                    </Button>
                  </form>
                </>
              )}

              {/* STEP 2: Check Email */}
              {step === 'check-email' && (
                <>
                  <div className="text-center mb-6">
                    <div className="w-16 h-16 bg-[#00D4FF]/20 rounded-full flex items-center justify-center mx-auto mb-4">
                      <CheckCircle2 className="w-8 h-8 text-[#00D4FF]" />
                    </div>
                    <h2 className="text-2xl font-semibold text-[#E8EDF5] mb-2">Check Your Email</h2>
                    <p className="text-[#8892A4]">
                      We've sent a password reset link to
                    </p>
                    <p className="text-[#00D4FF] font-medium mt-1">{email}</p>
                  </div>

                  <div className="space-y-4">
                    <div className="p-4 bg-[#0D1117] border border-[#1E2D40] rounded-lg">
                      <p className="text-sm text-[#8892A4]">
                        Click the link in the email to reset your password. If you don't see it, check your spam folder.
                      </p>
                    </div>

                    <Button
                      onClick={handleResendLink}
                      variant="outline"
                      className="w-full h-12 bg-[#0D1117] border-[#1E2D40] text-[#E8EDF5] hover:bg-[#1A2235] hover:border-[#00D4FF]/50"
                    >
                      Resend Reset Link
                    </Button>

                    <Button
                      onClick={() => navigate('/login')}
                      variant="ghost"
                      className="w-full h-12 text-[#00D4FF] hover:bg-[#00D4FF]/10"
                    >
                      Back to Login
                    </Button>
                  </div>
                </>
              )}

              {/* STEP 3: Reset Password */}
              {step === 'reset-password' && (
                <>
                  <h2 className="text-2xl font-semibold text-[#E8EDF5] mb-2">Create New Password</h2>
                  <p className="text-[#8892A4] mb-6">
                    Enter your new password below.
                  </p>

                  <form onSubmit={handleResetPassword} className="space-y-5">
                    <div>
                      <Label htmlFor="newPassword" className="text-[#E8EDF5] mb-2">New Password</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#4A5568]" />
                        <Input
                          id="newPassword"
                          type={showNewPassword ? 'text' : 'password'}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="Enter new password"
                          className="focus-glow h-12 bg-[#0D1117] border-[#1E2D40] text-[#E8EDF5] pl-11 pr-11 placeholder:text-[#4A5568]"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPassword(!showNewPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-[#4A5568] hover:text-[#00D4FF] transition-colors"
                        >
                          {showNewPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                        </button>
                      </div>
                      <p className="text-xs text-[#4A5568] mt-1">Must be at least 8 characters</p>
                    </div>

                    <div>
                      <Label htmlFor="confirmPassword" className="text-[#E8EDF5] mb-2">Confirm New Password</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#4A5568]" />
                        <Input
                          id="confirmPassword"
                          type={showConfirmPassword ? 'text' : 'password'}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Re-enter new password"
                          className="focus-glow h-12 bg-[#0D1117] border-[#1E2D40] text-[#E8EDF5] pl-11 pr-11 placeholder:text-[#4A5568]"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-[#4A5568] hover:text-[#00D4FF] transition-colors"
                        >
                          {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                        </button>
                      </div>
                    </div>

                    <Button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full h-12 bg-[#00D4FF] hover:bg-[#00D4FF]/90 text-[#0A0E1A] font-semibold shadow-[0_0_20px_rgba(0,212,255,0.4)] hover:shadow-[0_0_30px_rgba(0,212,255,0.6)] transition-all disabled:opacity-50"
                    >
                      {isSubmitting ? (
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-5 h-5 border-2 border-[#0A0E1A]/20 border-t-[#0A0E1A] rounded-full animate-spin" />
                          <span>Resetting...</span>
                        </div>
                      ) : (
                        'Reset Password'
                      )}
                    </Button>
                  </form>
                </>
              )}
            </Card>
          </motion.div>

          {/* Footer */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="text-center mt-8"
          >
            <p className="text-[#4A5568] text-sm">
              © 2026 FortifyLens. All rights reserved.
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

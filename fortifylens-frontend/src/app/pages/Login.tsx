import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '../context/AuthContext'
import { Mail, Lock, Eye, EyeOff } from 'lucide-react'
import { Card } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { motion } from 'motion/react'
import { PAGE_FADE } from '../../lib/motionPresets'
import { GradientWord } from '../components/Reveal'
import { toast } from 'sonner'
import logoImage from '../../assets/logo.png'

export default function Login() {
  const navigate = useNavigate()
  const { login, user } = useAuth()

  const [usernameOrEmail, setUsernameOrEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  // true once login() has succeeded — we then wait for AuthContext's
  // onAuthStateChanged listener to actually populate `user` before navigating,
  // instead of navigating immediately (which raced ahead of the context update
  // and made ProtectedRoute bounce back to /login on the first click).
  const [pendingRedirect, setPendingRedirect] = useState(false)

  useEffect(() => {
    if (pendingRedirect && user) {
      if (user.role === 'superadmin') navigate('/superadmin-dashboard')
      else if (user.role === 'org_admin') navigate('/admin-dashboard')
      else navigate('/user-dashboard')
    }
  }, [pendingRedirect, user, navigate])

  // Escape key: leave the sign-in page and go back home
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') navigate('/')
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [navigate])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!usernameOrEmail || !password) { toast.error('Please enter email and password'); return }
    setIsLoggingIn(true)
    try {
      const result = await login(usernameOrEmail, password)
      if (result.success) {
        toast.success('Login successful')
        setPendingRedirect(true)
      } else {
        toast.error(result.message || 'Invalid credentials')
        setIsLoggingIn(false)
      }
    } catch {
      toast.error('Something went wrong')
      setIsLoggingIn(false)
    }
  }

  const BackgroundDots = () => (
    <div className="fixed inset-0 overflow-hidden pointer-events-none">
      <div className="absolute inset-0 opacity-[0.02]">
        {[...Array(40)].map((_, i) => (
          <motion.div key={i} className="absolute w-1 h-1 bg-[#00D4FF] rounded-full"
            style={{ left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%` }}
            animate={{ y: [0, -30, 0], opacity: [0.3, 0.8, 0.3] }}
            transition={{ duration: 3 + Math.random() * 2, repeat: Infinity, delay: Math.random() * 2 }}
          />
        ))}
      </div>
    </div>
  )

  return (
    <motion.div {...PAGE_FADE} className="min-h-screen bg-[#0A0E1A] relative overflow-hidden flex flex-col">
      <BackgroundDots />

      {/* one soft radial wash + one dot field — the page's only ambient decoration */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="auth-glow absolute -top-48 left-1/2 h-[38rem] w-[38rem] -translate-x-1/2" />
        <div className="dot-wave absolute -bottom-32 -left-24 h-96 w-96 opacity-[0.14]" />
      </div>

      <div className="relative z-10 flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-[440px]">

          <motion.div className="text-center mb-8">
            <button onClick={() => navigate('/')} aria-label="Go to home" className="cursor-pointer">
              <img src={logoImage} alt="FortifyLens"
                className="w-20 h-20 mx-auto mb-4 rounded-2xl object-contain drop-shadow-[0_0_15px_rgba(0,212,255,0.5)]" />
            </button>
            <h1 className="text-3xl text-white font-bold">Fortify<GradientWord>Lens</GradientWord></h1>
            <p className="text-[#00D4FF] text-sm mt-1">Secure SDLC Platform</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut', delay: 0.1 }}
          >
          <Card className="p-8 bg-[#111827] border-[#1E2D40]">
            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <Label className="text-[#E8EDF5] mb-2 block">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input value={usernameOrEmail} onChange={e => setUsernameOrEmail(e.target.value)}
                    className="focus-glow pl-10 bg-[#0D1117] border-[#1E2D40] text-white placeholder:text-gray-500"
                    placeholder="Enter email" />
                </div>
              </div>

              <div>
                <Label className="text-[#E8EDF5] mb-2 block">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input type={showPassword ? 'text' : 'password'}
                    value={password} onChange={e => setPassword(e.target.value)}
                    className="focus-glow pl-10 pr-10 bg-[#0D1117] border-[#1E2D40] text-white placeholder:text-gray-500"
                    placeholder="Enter password" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#00D4FF] transition-colors">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <div className="text-right mt-2">
                  <button type="button" onClick={() => navigate('/forgot-password')}
                    className="text-xs text-[#00D4FF] hover:underline">
                    Forgot password?
                  </button>
                </div>
              </div>

              <Button type="submit" disabled={isLoggingIn}
                className="w-full h-12 bg-[#00D4FF] hover:bg-[#00D4FF]/90 text-[#0A0E1A] font-semibold shadow-[0_0_20px_rgba(0,212,255,0.3)] disabled:opacity-60">
                {isLoggingIn ? 'Signing in...' : 'Sign In'}
              </Button>
            </form>

            <p className="text-center text-sm text-gray-400 mt-6">
              Don't have an account?{' '}
              <button onClick={() => navigate('/signup')} className="text-[#00D4FF] hover:underline font-medium">
                Sign Up
              </button>
            </p>
          </Card>
          </motion.div>
        </div>
      </div>

      {/* Footer */}
      <div className="relative z-10 py-6 text-center border-t border-white/5">
        <p className="text-gray-500 text-xs mb-2">© 2026 FortifyLens. All rights reserved.</p>
        <div className="flex items-center justify-center gap-4">
          <button onClick={() => navigate('/privacy')} className="text-xs text-gray-600 hover:text-[#00D4FF] transition-colors">Privacy Policy</button>
          <span className="text-gray-700">·</span>
          <button onClick={() => navigate('/terms')} className="text-xs text-gray-600 hover:text-[#00D4FF] transition-colors">Terms of Service</button>
          <span className="text-gray-700">·</span>
          <button onClick={() => navigate('/contact')} className="text-xs text-gray-600 hover:text-[#00D4FF] transition-colors">Contact Us</button>
        </div>
      </div>
    </motion.div>
  )
}
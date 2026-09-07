import { Link, useLocation } from 'react-router';
import { Menu, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from './ui/button';
import { useAuth } from '../context/AuthContext';
import logoImage from '../../assets/logo.png';

export function Header() {
  const location = useLocation();
  const { isAuthenticated, user } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Route to the dashboard that matches the logged-in user's actual role,
  // instead of always sending everyone to the org admin dashboard.
  const dashboardPath =
    user?.role === 'superadmin' ? '/superadmin-dashboard' :
    user?.role === 'org_admin' ? '/admin-dashboard' :
    '/user-dashboard';

  const navLinks = [
    { name: 'Home', path: '/' },
    { name: 'About', path: '/about' },
    { name: 'Features', path: '/features' },
    { name: 'Pricing', path: '/pricing' },
    { name: 'FAQ', path: '/faq' },
    { name: 'Contact', path: '/contact' }
  ];

  const isActive = (path: string) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(path);
  };

  return (
    <header className="sticky top-0 z-50 bg-[#0A0E1A]/95 backdrop-blur-sm border-b border-[#00D4FF]/20">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 group">
            <img src={logoImage} alt="FortifyLens" className="w-12 h-12 rounded-xl object-contain drop-shadow-[0_0_10px_rgba(0,212,255,0.5)] group-hover:scale-110 transition-transform" />
            <div>
              <div className="font-bold text-white text-lg">FortifyLens</div>
              <div className="text-xs text-[#00D4FF]">Secure SDLC</div>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map(link => (
              <Link
                key={link.path}
                to={link.path}
                className={`px-4 py-2 rounded-lg transition-all ${
                  isActive(link.path)
                    ? 'bg-[#00D4FF]/20 text-[#00D4FF]'
                    : 'text-gray-300 hover:text-white hover:bg-white/5'
                }`}
              >
                {link.name}
              </Link>
            ))}
          </nav>

          {/* CTA Button */}
          <div className="hidden md:block">
            <div className="flex items-center gap-3">
              <Button
                asChild
                variant="outline"
                className="border-[#00D4FF]/50 text-[#00D4FF] hover:bg-[#00D4FF]/10"
              >
                <Link to="/signup">
                  Signup
                </Link>
              </Button>
              <Button
                asChild
                className="bg-gradient-to-r from-[#00D4FF] to-[#00D4FF]/80 hover:from-[#00D4FF]/90 hover:to-[#00D4FF]/70 text-[#0A0E1A] border-0"
              >
                <Link to={isAuthenticated ? dashboardPath : "/login"}>
                  {isAuthenticated ? 'Dashboard' : 'Login'}
                </Link>
              </Button>
            </div>
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden text-white"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <nav className="md:hidden py-4 border-t border-[#00D4FF]/20">
            <div className="flex flex-col gap-2">
              {navLinks.map(link => (
                <Link
                  key={link.path}
                  to={link.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`px-4 py-2 rounded-lg transition-all ${
                    isActive(link.path)
                      ? 'bg-[#00D4FF]/20 text-[#00D4FF]'
                      : 'text-gray-300 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {link.name}
                </Link>
              ))}
              <Button
                asChild
                variant="outline"
                className="mt-2 border-[#00D4FF]/50 text-[#00D4FF] hover:bg-[#00D4FF]/10"
              >
                <Link to="/signup" onClick={() => setMobileMenuOpen(false)}>
                  Signup
                </Link>
              </Button>
              <Button
                asChild
                className="mt-2 bg-gradient-to-r from-[#00D4FF] to-[#00D4FF]/80 text-[#0A0E1A] border-0"
              >
                <Link to={isAuthenticated ? dashboardPath : "/login"} onClick={() => setMobileMenuOpen(false)}>
                  {isAuthenticated ? 'Dashboard' : 'Login'}
                </Link>
              </Button>
            </div>
          </nav>
        )}
      </div>
    </header>
  );
}
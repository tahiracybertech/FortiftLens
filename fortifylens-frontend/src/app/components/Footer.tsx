import { Link } from 'react-router';
import { Mail, MapPin, Phone, Github, Linkedin, Twitter } from 'lucide-react';
import logoImage from '../../assets/logo.png';

export function Footer() {
  return (
    <footer className="bg-[#0A0E1A] border-t border-[#00D4FF]/20">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <img src={logoImage} alt="FortifyLens" className="w-12 h-12 rounded-xl object-contain drop-shadow-[0_0_10px_rgba(0,212,255,0.5)]" />
              <div>
                <div className="font-bold text-white">FortifyLens</div>
                <div className="text-xs text-[#00D4FF]">Secure SDLC</div>
              </div>
            </div>
            <p className="text-gray-400 text-sm mb-4">
              AI-powered security integration for enterprise SDLC. Build secure software from day one.
            </p>
            <div className="flex gap-3">
              <a href="#" className="w-9 h-9 rounded-lg bg-white/5 hover:bg-[#00D4FF]/20 flex items-center justify-center transition-colors">
                <Github className="w-4 h-4 text-gray-400" />
              </a>
              <a href="#" className="w-9 h-9 rounded-lg bg-white/5 hover:bg-[#00D4FF]/20 flex items-center justify-center transition-colors">
                <Linkedin className="w-4 h-4 text-gray-400" />
              </a>
              <a href="#" className="w-9 h-9 rounded-lg bg-white/5 hover:bg-[#00D4FF]/20 flex items-center justify-center transition-colors">
                <Twitter className="w-4 h-4 text-gray-400" />
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-white font-semibold mb-4">Quick Links</h3>
            <ul className="space-y-2">
              <li>
                <Link to="/" className="text-gray-400 hover:text-[#00D4FF] transition-colors text-sm">
                  Home
                </Link>
              </li>
              <li>
                <Link to="/about" className="text-gray-400 hover:text-[#00D4FF] transition-colors text-sm">
                  About Us
                </Link>
              </li>
              <li>
                <Link to="/features" className="text-gray-400 hover:text-[#00D4FF] transition-colors text-sm">
                  Features
                </Link>
              </li>
              <li>
                <Link to="/pricing" className="text-gray-400 hover:text-[#00D4FF] transition-colors text-sm">
                  Pricing
                </Link>
              </li>
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h3 className="text-white font-semibold mb-4">Resources</h3>
            <ul className="space-y-2">
              <li>
                <Link to="/faq" className="text-gray-400 hover:text-[#00D4FF] transition-colors text-sm">
                  FAQ
                </Link>
              </li>
              <li>
                <Link to="/contact" className="text-gray-400 hover:text-[#00D4FF] transition-colors text-sm">
                  Contact
                </Link>
              </li>
              <li>
                <Link to="/dashboard" className="text-gray-400 hover:text-[#00D4FF] transition-colors text-sm">
                  Dashboard
                </Link>
              </li>
              <li>
                <a href="#" className="text-gray-400 hover:text-[#00D4FF] transition-colors text-sm">
                  Documentation
                </a>
              </li>
            </ul>
          </div>

          {/* Contact Info */}
          <div>
            <h3 className="text-white font-semibold mb-4">Contact</h3>
            <ul className="space-y-3">
              <li className="flex items-start gap-2 text-gray-400 text-sm">
                <Mail className="w-4 h-4 mt-0.5 text-[#00D4FF]" />
                <a
                  href="https://mail.google.com/mail/?view=cm&fs=1&to=fortifylens@gmail.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[#00D4FF] transition-colors"
                >
                  fortifylens@gmail.com
                </a>
              </li>
              <li className="flex items-start gap-2 text-gray-400 text-sm">
                <Phone className="w-4 h-4 mt-0.5 text-[#00D4FF]" />
                <a href="tel:+923180372733" className="hover:text-[#00D4FF] transition-colors">
                  +92 3180 372733
                </a>
              </li>
              
            </ul>
          </div>
        </div>

        <div className="border-t border-[#00D4FF]/20 mt-8 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-gray-400 text-sm">
            © 2026 FortifyLens. All rights reserved.
          </p>
          <div className="flex gap-6">
            <a href="#" className="text-gray-400 hover:text-[#00D4FF] transition-colors text-sm">
              Privacy Policy
            </a>
            <a href="#" className="text-gray-400 hover:text-[#00D4FF] transition-colors text-sm">
              Terms of Service
            </a>
            <a href="#" className="text-gray-400 hover:text-[#00D4FF] transition-colors text-sm">
              Security
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
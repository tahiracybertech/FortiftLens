import React, { useState } from 'react';
import logoImage from '../../assets/logo.png';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router';
import { motion } from 'motion/react';
import { PAGE_FADE } from '../../lib/motionPresets';
import {
  LayoutDashboard,
  Building2,
  DollarSign,
  BarChart3,
  FileText,
  Settings,
  LogOut,
  Shield
} from 'lucide-react';
import { Button } from '../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import OverviewSection from '../components/superadmin/OverviewSection';
import OrganizationsSection from '../components/superadmin/OrganizationsSection';
import RevenueSection from '../components/superadmin/RevenueSection';
import SystemAnalyticsSection from '../components/superadmin/SystemAnalyticsSection';
import ReportsSection from '../components/superadmin/ReportsSection';
import SettingsSection from '../components/superadmin/SettingsSection';

type Section = 'overview' | 'organizations' | 'revenue' | 'analytics' | 'reports' | 'settings';

const SuperAdminDashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState<Section>('overview');
  const [showSignOutDialog, setShowSignOutDialog] = useState(false);

  const handleLogout = () => {
    logout();
    setShowSignOutDialog(false);
    navigate('/login');
  };

  const handleSignOutClick = () => {
    setShowSignOutDialog(true);
  };

  const navItems = [
    { id: 'overview' as Section, label: 'Overview', icon: LayoutDashboard },
    { id: 'organizations' as Section, label: 'Organizations', icon: Building2 },
    { id: 'revenue' as Section, label: 'Revenue & Plans', icon: DollarSign },
    { id: 'analytics' as Section, label: 'System Analytics', icon: BarChart3 },
    { id: 'reports' as Section, label: 'Reports', icon: FileText },
    { id: 'settings' as Section, label: 'Settings', icon: Settings },
  ];

  const renderContent = () => {
    switch (activeSection) {
      case 'overview':
        return <OverviewSection />;
      case 'organizations':
        return <OrganizationsSection />;
      case 'revenue':
        return <RevenueSection />;
      case 'analytics':
        return <SystemAnalyticsSection />;
      case 'reports':
        return <ReportsSection />;
      case 'settings':
        return <SettingsSection />;
      default:
        return <OverviewSection />;
    }
  };

  return (
    <motion.div {...PAGE_FADE} className="min-h-screen bg-gradient-to-br from-[#0A0E1A] via-[#0F1629] to-[#0A0E1A]">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 h-full w-64 bg-[#0A0E1A]/80 backdrop-blur-xl border-r border-[#00D4FF]/20 flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-[#00D4FF]/20">
          <Link
            to="/"
            className="flex items-center space-x-3 cursor-pointer text-left"
            aria-label="Go to home"
          >
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#00D4FF] to-[#00D4FF]/60 flex items-center justify-center">
              <img src={logoImage} alt="FortifyLens" className="w-10 h-10 rounded-xl object-contain drop-shadow-[0_0_10px_rgba(0,212,255,0.5)]" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">FortifyLens</h1>
              <p className="text-xs text-[#00D4FF]">Super Admin</p>
            </div>
          </Link>
        </div>

        {/* User Info */}
        <div className="p-4 border-b border-[#00D4FF]/20">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#00D4FF] to-purple-600 flex items-center justify-center text-white font-semibold">
              SA
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{user?.email}</p>
              <p className="text-xs text-gray-400">Platform Owner</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="p-4 space-y-2 flex-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all ${
                  isActive
                    ? 'bg-gradient-to-r from-[#00D4FF]/20 to-[#00D4FF]/10 text-[#00D4FF] border border-[#00D4FF]/30'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="font-medium">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Sign Out Button */}
        <div className="mt-auto">
          <div className="h-px bg-[#00D4FF]/20 mx-4 mb-2" />
          <div className="p-4">
            <button
              onClick={handleSignOutClick}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-500/10 transition-all group"
            >
              <LogOut className="w-5 h-5 group-hover:text-red-500" />
              <span className="font-medium group-hover:text-red-500">Sign Out</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Sign Out Confirmation Dialog */}
      <Dialog open={showSignOutDialog} onOpenChange={setShowSignOutDialog}>
        <DialogContent className="bg-[#0F1629] border-[#00D4FF]/20">
          <DialogHeader>
            <DialogTitle className="text-white text-2xl">Confirm Sign Out</DialogTitle>
            <DialogDescription className="text-gray-400 text-base pt-2">
              Are you sure you want to sign out?
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 pt-4">
            <Button
              onClick={() => setShowSignOutDialog(false)}
              variant="outline"
              className="flex-1 border-[#00D4FF]/50 text-[#00D4FF] hover:bg-[#00D4FF]/10"
            >
              Cancel
            </Button>
            <Button
              onClick={handleLogout}
              className="flex-1 bg-red-500 hover:bg-red-600 text-white"
            >
              Sign Out
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Main Content */}
      <main className="ml-64 min-h-screen">
        <div className="p-8">
          {renderContent()}
        </div>
      </main>
    </motion.div>
  );
};

export default SuperAdminDashboard;
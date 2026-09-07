import { createBrowserRouter, Navigate } from 'react-router';
import Landing from './pages/Landing';
import About from './pages/About';
import Features from './pages/Features';
import Contact from './pages/Contact';
import Pricing from './pages/Pricing';
import FAQ from './pages/FAQ';
import Login from './pages/Login';
import Signup from './pages/Signup';
import ForgotPassword from './pages/ForgotPassword';
import AuthCallback from './pages/AuthCallback';
import AdminDashboard from './pages/OrgAdminDashboard';
import UserDashboard from './pages/UserDashboard';
import SuperAdminDashboard from './pages/SuperAdminDashboard';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { useAuth } from './context/AuthContext';
import PaymentSuccess from './pages/PaymentSuccess';

function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}

function ProtectedRoute({ children, requiredRoles, requirePayment = false }: {
  children: React.ReactNode;
  requiredRoles?: Array<'user' | 'superadmin' | 'org_admin' | 'employee' | '__any__'>
  requirePayment?: boolean
}) {
  const { isAuthenticated, user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0E1A] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#00D4FF] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!requiredRoles || requiredRoles.includes('__any__')) {
    // superadmin aur employee ko payment wall se bypass karo
    if (requirePayment && user?.role !== 'superadmin' && user?.role !== 'employee') {
      const blocked = user?.planStatus !== 'active'
      if (blocked) return <Navigate to="/pricing?required=true" replace />
    }
    return <>{children}</>;
  }

  if (user?.role && !requiredRoles.includes(user.role as any)) {
    if (user.role === 'superadmin') return <Navigate to="/superadmin-dashboard" replace />;
    if (user.role === 'org_admin')  return <Navigate to="/admin-dashboard" replace />;
    return <Navigate to="/user-dashboard" replace />;
  }

  // superadmin aur employee payment wall bypass
  if (requirePayment && user?.role !== 'superadmin' && user?.role !== 'employee') {
    const blocked = user?.planStatus === 'inactive' || user?.planStatus === 'cancelled'
    if (blocked) return <Navigate to="/pricing?required=true" replace />
  }

  return <>{children}</>;
}

export const router = createBrowserRouter([
  { path: '/',               element: <PublicLayout><Landing /></PublicLayout> },
  { path: '/about',          element: <PublicLayout><About /></PublicLayout> },
  { path: '/features',       element: <PublicLayout><Features /></PublicLayout> },
  { path: '/contact',        element: <PublicLayout><Contact /></PublicLayout> },
  { path: '/pricing',        element: <PublicLayout><Pricing /></PublicLayout> },
  { path: '/faq',            element: <PublicLayout><FAQ /></PublicLayout> },
  { path: '/login',          element: <Login /> },
  { path: '/signup',         element: <Signup /> },
  { path: '/forgot-password',element: <ForgotPassword /> },
  { path: '/auth/callback',  element: <AuthCallback /> },
  { path: '/payment/success', element: <PaymentSuccess /> },
  {
    path: '/superadmin-dashboard',
    element: <ProtectedRoute requiredRoles={['superadmin']}>
      <SuperAdminDashboard />
    </ProtectedRoute>
  },
  {
    path: '/admin-dashboard',
    element: <ProtectedRoute requiredRoles={['org_admin']} requirePayment={true}>
      <AdminDashboard />
    </ProtectedRoute>
  },
  {
    path: '/user-dashboard',
    element: <ProtectedRoute requirePayment={true}>
      <UserDashboard />
    </ProtectedRoute>
  },
  { path: '/analyst-dashboard', element: <Navigate to="/user-dashboard" replace /> },
  {
    path: '*',
    element: <PublicLayout>
      <div className="min-h-screen bg-gradient-to-b from-[#0A1F44] to-[#050F22] flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-6xl font-bold text-white mb-4">404</h1>
          <p className="text-xl text-gray-400 mb-6">Page not found</p>
          <a href="/" className="inline-flex items-center justify-center px-6 py-3 rounded-lg bg-gradient-to-r from-[#00B3B3] to-[#00B3B3]/80 text-white font-semibold">
            Return Home
          </a>
        </div>
      </div>
    </PublicLayout>
  }
]);